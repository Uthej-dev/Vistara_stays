"""HTTP hardening: security headers on every response and a cap on request body size."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.errors import error_body

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",  # browsers must not guess content types
    "X-Frame-Options": "DENY",  # the API is never meant to be framed (clickjacking)
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}
# API docs (Swagger UI) load their own scripts, so only JSON responses get the strict CSP.
API_CSP = "default-src 'none'; frame-ancestors 'none'"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, hsts: bool):
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if response.headers.get("content-type", "").startswith("application/json"):
            response.headers.setdefault("Content-Security-Policy", API_CSP)
        if self.hsts:  # only over HTTPS in production
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose declared body is larger than the limit (uploads included)."""

    def __init__(self, app, *, max_bytes: int):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > self.max_bytes:
            return JSONResponse(
                status_code=413,
                content=error_body("PAYLOAD_TOO_LARGE", "The request is too large."),
            )
        return await call_next(request)
