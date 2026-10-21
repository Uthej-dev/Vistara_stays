"""Health checks.

- `/health`        liveness: is the process up? No database call, so it stays fast and cheap
                   (Render polls it to decide whether to restart the service).
- `/health/ready`  readiness: can we reach MongoDB? Returns 503 if not.
"""

import asyncio
import logging

from fastapi import APIRouter

from app.api.deps import DbDep, SettingsDep
from app.core.errors import ServiceUnavailableError
from app.db.mongodb import ping

router = APIRouter(prefix="/health", tags=["health"])
logger = logging.getLogger("app.health")


@router.get("")
async def liveness(settings: SettingsDep) -> dict:
    return {"status": "ok", "service": settings.app_name, "version": settings.version}


@router.get("/ready")
async def readiness(db: DbDep) -> dict:
    try:
        await asyncio.wait_for(ping(db), timeout=3)
    except Exception as exc:
        logger.warning("Database ping failed", extra={"error": type(exc).__name__})
        raise ServiceUnavailableError("Database is unreachable.") from exc
    return {"status": "ok", "database": "ok"}
