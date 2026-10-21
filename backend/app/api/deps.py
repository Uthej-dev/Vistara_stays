"""Reusable FastAPI dependencies, injected into route functions with `Depends(...)`.

Authorization happens here, on the server, for every protected route. The user's role is always
read from the database — never from the token alone and never from the request body.
"""

from typing import Annotated

from bson import ObjectId
from fastapi import Depends, Request
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import Settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.rate_limit import RateLimiter
from app.core.security import TokenError, decode_access_token
from app.db.mongodb import create_client, get_database
from app.models.enums import Role, UserStatus


def get_app_settings(request: Request) -> Settings:
    """The settings this app instance was created with (tests inject their own)."""
    return request.app.state.settings


def get_db(request: Request) -> AsyncDatabase:
    """The database handle created at startup (see `lifespan` in main.py).

    Some serverless hosts (e.g. Vercel's Python runtime) may not run the lifespan hook, so the
    client is created on first use instead. The client connects lazily, so this is cheap."""
    state = request.app.state
    if getattr(state, "db", None) is None:
        settings = state.settings
        state.db = get_database(create_client(settings), settings)
    return state.db


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DbDep = Annotated[AsyncDatabase, Depends(get_db)]


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


async def _load_user(request: Request, db: AsyncDatabase, settings: Settings, token: str) -> dict:
    try:
        payload = decode_access_token(token, settings.jwt_secret)
    except TokenError as exc:
        message = "Your session has expired." if exc.code == "TOKEN_EXPIRED" else None
        raise UnauthorizedError(message, code=exc.code) from exc
    if not ObjectId.is_valid(payload["sub"]):
        raise UnauthorizedError(code="TOKEN_INVALID")
    user = await db["users"].find_one({"_id": ObjectId(payload["sub"])})
    # token_version lets us revoke every access token for a user immediately.
    if not user or user.get("token_version", 0) != payload["ver"]:
        raise UnauthorizedError(code="TOKEN_INVALID")
    if user["status"] != UserStatus.ACTIVE:
        raise ForbiddenError("This account is suspended.", code="ACCOUNT_SUSPENDED")
    request.state.user_id = str(user["_id"])  # for request logs
    return user


async def get_current_user(request: Request, db: DbDep, settings: SettingsDep) -> dict:
    token = _bearer_token(request)
    if not token:
        raise UnauthorizedError()
    return await _load_user(request, db, settings, token)


async def get_optional_user(request: Request, db: DbDep, settings: SettingsDep) -> dict | None:
    """For public pages that personalise when logged in. A bad token is treated as anonymous."""
    token = _bearer_token(request)
    if not token:
        return None
    try:
        return await _load_user(request, db, settings, token)
    except (UnauthorizedError, ForbiddenError):
        return None


CurrentUserDep = Annotated[dict, Depends(get_current_user)]
OptionalUserDep = Annotated[dict | None, Depends(get_optional_user)]


def require_role(*roles: Role):
    async def checker(user: CurrentUserDep) -> dict:
        if user["role"] not in roles:
            raise ForbiddenError()
        return user

    return checker


CustomerDep = Annotated[dict, Depends(require_role(Role.CUSTOMER))]
OwnerDep = Annotated[dict, Depends(require_role(Role.OWNER))]
AdminDep = Annotated[dict, Depends(require_role(Role.ADMIN))]


def rate_limit(name: str, limit: int, window_seconds: int, *, per: str = "ip"):
    """Dependency factory: `Depends(rate_limit("login", 10, 60))`."""

    async def dependency(request: Request) -> None:
        settings: Settings = request.app.state.settings
        if not settings.rate_limit_enabled:
            return
        limiter: RateLimiter = request.app.state.rate_limiter
        if per == "user" and getattr(request.state, "user_id", None):
            key = f"user:{request.state.user_id}"
        else:
            key = f"ip:{client_ip(request)}"
        limiter.hit(f"{name}:{key}", limit, window_seconds)

    return Depends(dependency)


def client_ip(request: Request) -> str:
    # Render/Vercel put the real client IP first in X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
