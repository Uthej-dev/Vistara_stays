"""Authentication endpoints.

The refresh token lives only in an httpOnly cookie scoped to /api/v1/auth, so JavaScript can't
read it and it's only sent to these endpoints. The two cookie-authenticated endpoints (refresh,
logout) also require an `X-Requested-With` header and an allowed Origin — a cross-site form
can't add custom headers, which blocks CSRF.
"""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Request, Response, status

from app.api.deps import CurrentUserDep, DbDep, SettingsDep, client_ip, rate_limit
from app.core.config import Settings
from app.core.errors import ForbiddenError
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    VerifyEmailRequest,
)
from app.services.auth_service import AuthService
from app.services.email_service import EmailService

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "vs_refresh"
COOKIE_PATH = "/api/v1/auth"


def get_email_service(request: Request) -> EmailService:
    return EmailService(request.app.state.settings, request.app.state.email_outbox)


def get_auth_service(request: Request, db: DbDep, settings: SettingsDep) -> AuthService:
    return AuthService(db, settings, get_email_service(request), request.app.state.rate_limiter)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def request_meta(request: Request) -> dict:
    return {"ip": client_ip(request), "user_agent": request.headers.get("user-agent")}


def set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        REFRESH_COOKIE, path=COOKIE_PATH, secure=settings.cookie_secure, httponly=True, samesite="lax"
    )


def require_same_site(request: Request) -> None:
    settings: Settings = request.app.state.settings
    if request.headers.get("x-requested-with") != "XMLHttpRequest":
        raise ForbiddenError("Missing request header.", code="CSRF_CHECK_FAILED")
    origin = request.headers.get("origin")
    allowed = {*settings.cors_origins, settings.frontend_url.rstrip("/")}
    if origin and origin.rstrip("/") not in allowed:
        raise ForbiddenError("Origin not allowed.", code="CSRF_CHECK_FAILED")


def _respond(result: dict, response: Response, settings: Settings) -> dict:
    set_refresh_cookie(response, result.pop("refresh_token"), settings)
    response.headers["Cache-Control"] = "no-store"
    return result


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[rate_limit("signup", 5, 60)],
)
async def signup(
    body: SignupRequest, request: Request, response: Response, svc: AuthServiceDep, settings: SettingsDep
):
    """Create a customer or owner account and sign in. A verification email is sent."""
    return _respond(await svc.signup(body, request_meta(request)), response, settings)


@router.post("/login", response_model=AuthResponse, dependencies=[rate_limit("login", 10, 60)])
async def login(
    body: LoginRequest, request: Request, response: Response, svc: AuthServiceDep, settings: SettingsDep
):
    return _respond(await svc.login(body.email, body.password, request_meta(request)), response, settings)


@router.post(
    "/refresh",
    response_model=AuthResponse,
    dependencies=[Depends(require_same_site), rate_limit("refresh", 60, 60)],
)
async def refresh(
    request: Request,
    response: Response,
    svc: AuthServiceDep,
    settings: SettingsDep,
    vs_refresh: RefreshCookie = None,
):
    """Exchange the refresh cookie for a new access token (and a rotated cookie)."""
    return _respond(await svc.refresh(vs_refresh, request_meta(request)), response, settings)


@router.post("/logout", status_code=204, dependencies=[Depends(require_same_site)])
async def logout(svc: AuthServiceDep, settings: SettingsDep, vs_refresh: RefreshCookie = None):
    await svc.logout(vs_refresh)
    response = Response(status_code=204)
    clear_refresh_cookie(response, settings)
    return response


@router.post("/logout-all", status_code=204)
async def logout_all(user: CurrentUserDep, svc: AuthServiceDep, settings: SettingsDep):
    """Sign out on every device."""
    await svc.revoke_all(user["_id"], "logout_all")
    response = Response(status_code=204)
    clear_refresh_cookie(response, settings)
    return response


@router.post("/forgot-password", status_code=202, dependencies=[rate_limit("forgot", 5, 900)])
async def forgot_password(body: ForgotPasswordRequest, svc: AuthServiceDep, request: Request):
    """Always 202, whether or not the email has an account."""
    request.app.state.rate_limiter.hit(f"forgot-email:{body.email}", 3, 900)
    await svc.forgot_password(body.email)
    return {"message": "If an account exists for that email, we've sent a reset link."}


@router.post("/reset-password", status_code=204, dependencies=[rate_limit("reset", 10, 900)])
async def reset_password(body: ResetPasswordRequest, svc: AuthServiceDep):
    await svc.reset_password(body.token, body.new_password)
    return Response(status_code=204)


@router.post("/verify-email", status_code=204, dependencies=[rate_limit("verify", 20, 900)])
async def verify_email(body: VerifyEmailRequest, svc: AuthServiceDep):
    await svc.verify_email(body.token)
    return Response(status_code=204)


@router.post("/resend-verification", status_code=202)
async def resend_verification(user: CurrentUserDep, svc: AuthServiceDep, request: Request):
    request.app.state.rate_limiter.hit(f"resend-verify:{user['_id']}", 3, 900)
    if not user.get("email_verified"):
        await svc.send_verification(user)
    return {"message": "Verification email sent."}


@router.post("/change-password", response_model=AuthResponse)
async def change_password(
    body: ChangePasswordRequest,
    user: CurrentUserDep,
    request: Request,
    response: Response,
    svc: AuthServiceDep,
    settings: SettingsDep,
):
    """Change password; signs out other devices but keeps this one signed in."""
    result = await svc.change_password(user, body.current_password, body.new_password, request_meta(request))
    return _respond(result, response, settings)
