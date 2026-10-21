"""Phase 11: security behaviours that cut across features."""

import httpx
import pytest

from app.main import create_app
from app.services.email_service import Email, EmailService
from tests.conftest import make_settings
from tests.factories import auth_headers, make_listing, make_user

API = "/api/v1"


async def test_security_headers_on_every_response(client):
    response = await client.get(f"{API}/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert "strict-transport-security" not in response.headers  # HSTS only in production (HTTPS)


async def test_oversized_requests_are_rejected_before_parsing(client):
    huge = b"x" * (7 * 1024 * 1024)
    response = await client.post(
        f"{API}/auth/login", content=huge, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


@pytest.mark.db
@pytest.mark.parametrize(
    "payload",
    [
        {"email": {"$gt": ""}, "password": "x"},
        {"email": {"$ne": None}, "password": {"$ne": None}},
        {"email": "a@example.com", "password": {"$regex": ".*"}},
    ],
)
async def test_operator_injection_in_login_is_rejected(client, payload):
    response = await client.post(f"{API}/auth/login", json=payload)
    assert response.status_code == 422


@pytest.mark.db
async def test_operator_injection_in_query_params_is_inert(client, db):
    # Query params are strings; "[$ne]" is just text, never a MongoDB operator.
    response = await client.get(
        f"{API}/resorts/search", params={"destination[$ne]": "x", "q": "{'$gt': ''}"}
    )
    assert response.status_code == 200 and response.json()["total"] == 0


@pytest.mark.db
async def test_unexpected_errors_hide_internals(db):
    app = create_app(make_settings())

    @app.get("/api/v1/_boom")
    async def boom():
        raise RuntimeError("secret connection string mongodb+srv://user:pass@host")

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            response = await c.get("/api/v1/_boom")
    assert response.status_code == 500
    assert "mongodb+srv" not in response.text and "Traceback" not in response.text
    assert (
        response.json()["error"]["code"] == "INTERNAL_ERROR"
        and response.json()["error"]["request_id"]
    )


async def test_production_console_email_never_logs_links(caplog):
    settings = make_settings(
        app_env="production",
        jwt_secret="x" * 40,
        cookie_secure=True,
        image_storage="cloudinary",
        cloudinary_cloud_name="c",
        cloudinary_api_key="k",
        cloudinary_api_secret="s",
    )
    service = EmailService(settings, [])
    with caplog.at_level("INFO"):
        await service.send(
            Email(to="a@example.com", subject="Reset", text="https://x/reset?token=SECRET123")
        )
    assert "SECRET123" not in caplog.text


@pytest.mark.db
async def test_responses_never_leak_password_hashes(client, db):
    user = await make_user(db)
    listing = await make_listing(db)
    bodies = [
        (await client.get(f"{API}/users/me", headers=auth_headers(user))).text,
        (await client.get(f"{API}/resorts/{listing['resort']['slug']}")).text,
        (
            await client.post(
                f"{API}/auth/login", json={"email": user["email"], "password": "Correct-Horse-42"}
            )
        ).text,
    ]
    assert not any("argon2" in body or "password_hash" in body for body in bodies)
