"""Application entry point.

Run locally with:  uvicorn app.main:app --reload
`create_app()` builds a fresh app (tests use it with test settings); `app` is the instance
Uvicorn serves.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, catalog, health, stays, users
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.rate_limit import RateLimiter
from app.db.indexes import ensure_indexes
from app.db.mongodb import create_client, get_database

API_PREFIX = "/api/v1"
logger = logging.getLogger("app")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup: open one shared client (connection pool) for the whole process.
        client = create_client(settings)
        app.state.db = get_database(client, settings)
        if settings.ensure_indexes_on_startup:
            try:
                await ensure_indexes(app.state.db)
                logger.info("Indexes ensured")
            except Exception:
                # Don't crash the server; /health/ready will report the database problem.
                logger.exception("Could not ensure indexes at startup")
        logger.info("Startup complete", extra={"env": settings.app_env, "db": settings.mongodb_db})
        yield
        # Shutdown
        await client.close()

    docs = settings.enable_docs
    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )

    # Middleware runs outermost-last-added: CORS wraps everything, then request logging.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,  # needed for the refresh-token cookie (Phase 5)
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Requested-With"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )

    app.state.settings = settings
    app.state.rate_limiter = RateLimiter()
    app.state.email_outbox = []  # console email backend keeps recent emails here
    register_exception_handlers(app)
    for router in (health.router, catalog.router, stays.router, auth.router, users.router):
        app.include_router(router, prefix=API_PREFIX)
    return app


app = create_app()
