"""Application entry point.

Run locally with:  uvicorn app.main:app --reload
`create_app()` builds a fresh app (tests use it with test settings); `app` is the instance
Uvicorn serves.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import admin, auth, bookings, catalog, health, owner, stays, uploads, users
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.rate_limit import RateLimiter
from app.db.indexes import ensure_indexes
from app.db.mongodb import create_client, get_database

API_PREFIX = "/api/v1"
logger = logging.getLogger("app")


async def run_maintenance(db, settings: Settings) -> None:
    """While the server is awake: expire unpaid holds, complete finished stays, decline
    unanswered booking requests. Correctness never depends on this loop — the same work also
    happens lazily whenever the affected data is read or booked."""
    from app.services.booking_service import BookingService
    from app.services.platform_settings import get_platform_settings

    while True:
        await asyncio.sleep(settings.maintenance_interval_seconds)
        try:
            svc = BookingService(db)
            platform = await get_platform_settings(db)
            expired = await svc.release_expired_holds()
            completed = await svc.complete_stays()
            declined = await svc.auto_reject_stale_requests(platform["owner_confirmation_hours"])
            if expired or completed or declined:
                logger.info(
                    "Maintenance",
                    extra={"expired": expired, "completed": completed, "declined": declined},
                )
        except Exception:
            logger.exception("Maintenance run failed")


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
        maintenance = None
        if settings.maintenance_interval_seconds:
            maintenance = asyncio.create_task(run_maintenance(app.state.db, settings))
        logger.info("Startup complete", extra={"env": settings.app_env, "db": settings.mongodb_db})
        yield
        # Shutdown
        if maintenance:
            maintenance.cancel()
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
    for router in (
        health.router,
        catalog.router,
        stays.router,
        bookings.router,
        auth.router,
        users.router,
        owner.router,
        uploads.router,
        admin.router,
    ):
        app.include_router(router, prefix=API_PREFIX)
    if settings.image_storage == "local":
        # Development only: serve uploaded images. Production uses Cloudinary.
        media = Path(settings.media_dir)
        media.mkdir(parents=True, exist_ok=True)
        app.mount(f"{API_PREFIX}/media", StaticFiles(directory=media), name="media")
    return app


app = create_app()
