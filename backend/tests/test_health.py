"""Phase 2 smoke tests: app boots, health checks, error format, CORS, indexes."""

import httpx
import pytest

from app.db.indexes import INDEXES, ensure_indexes
from app.main import create_app
from tests.conftest import make_settings


async def test_liveness_returns_ok(client):
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.headers["X-Request-ID"]


@pytest.mark.db
async def test_readiness_ok_when_database_reachable(client):
    response = await client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


async def test_readiness_503_when_database_unreachable():
    # Port 1 has nothing listening, so the ping fails.
    settings = make_settings(mongodb_uri="mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=500")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/health/ready")

    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "SERVICE_UNAVAILABLE"
    assert "request_id" in error


async def test_unknown_route_uses_standard_error_format(client):
    response = await client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


async def test_cors_allows_configured_origin_only(client):
    preflight = {"Access-Control-Request-Method": "GET"}

    allowed = await client.options(
        "/api/v1/health", headers={"Origin": "http://localhost:5173", **preflight}
    )
    blocked = await client.options(
        "/api/v1/health", headers={"Origin": "https://evil.example", **preflight}
    )

    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in blocked.headers


@pytest.mark.db
async def test_ensure_indexes_is_idempotent_and_creates_booking_guards(db):
    await ensure_indexes(db)
    await ensure_indexes(db)  # second run must not fail

    inventory = await db["inventory"].index_information()
    bookings = await db["bookings"].index_information()
    assert inventory["uniq_room_night"]["unique"] is True
    assert bookings["uniq_idempotency"]["unique"] is True
    for collection in INDEXES:
        assert await db[collection].index_information()


def test_production_rejects_weak_jwt_secret():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        make_settings(app_env="production", jwt_secret="change-me")
