"""Domain errors and the handlers that turn them into consistent JSON responses.

Services raise these exceptions; they never build HTTP responses themselves. Every error the
API returns has the same shape:

    {"error": {"code": "NOT_FOUND", "message": "...", "details": {...}}}
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"
    message = "The request could not be processed."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        self.message = message or self.message
        self.code = code or self.code
        self.details = details or {}
        super().__init__(self.message)


class BusinessRuleError(AppError):
    """400 — the request is well-formed but breaks a business rule (e.g. INVALID_DATES)."""


class UnauthorizedError(AppError):
    status_code = 401
    code = "NOT_AUTHENTICATED"
    message = "Please log in to continue."


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You don't have permission to do that."


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "The requested resource was not found."


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    message = "The request conflicts with the current state."


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    message = "Too many requests. Please wait a moment and try again."

    def __init__(self, retry_after: int):
        super().__init__(details={"retry_after_seconds": retry_after})
        self.retry_after = retry_after


class ServiceUnavailableError(AppError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    message = "A required service is temporarily unavailable."


def error_body(code: str, message: str, details: Any = None, request_id: str | None = None):
    body: dict[str, Any] = {"code": code, "message": message, "details": details or {}}
    if request_id:
        body["request_id"] = request_id
    return {"error": body}


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


_HTTP_CODES = {
    401: "NOT_AUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    429: "RATE_LIMITED",
}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        headers = (
            {"Retry-After": str(exc.retry_after)} if isinstance(exc, RateLimitedError) else None
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.details, _request_id(request)),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        # Strip the submitted input from error details so we never echo back passwords etc.
        fields = [
            {"loc": list(err["loc"]), "msg": err["msg"], "type": err["type"]}
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR",
                "Some fields are invalid.",
                {"fields": jsonable_encoder(fields)},
                _request_id(request),
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(code, message, None, _request_id(request)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        # Full details go to the server log only; the client gets a generic message.
        logger.exception("Unhandled error", extra={"request_id": _request_id(request)})
        return JSONResponse(
            status_code=500,
            content=error_body(
                "INTERNAL_ERROR",
                "Something went wrong on our side. Please try again.",
                None,
                _request_id(request),
            ),
        )
