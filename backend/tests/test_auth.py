"""Phase 5: sign-up, login, tokens, refresh rotation, password reset, email verification."""

from datetime import timedelta

import jwt
import pytest

from app.core.security import create_access_token
from app.models.enums import Role
from app.utils.dates import now_utc
from tests.conftest import make_settings
from tests.factories import PASSWORD, auth_headers, make_user, unique

pytestmark = pytest.mark.db

API = "/api/v1"
SAME_SITE = {"X-Requested-With": "XMLHttpRequest", "Origin": "http://localhost:5173"}


def signup_body(**overrides):
    return {
        "name": "Asha Rao",
        "email": f"{unique('asha')}@example.com",
        "password": "Monsoon-Trail-2026",
        **overrides,
    }


async def signup(client, **overrides):
    return await client.post(f"{API}/auth/signup", json=signup_body(**overrides))


def refresh_cookie(response) -> str:
    return response.cookies.get("vs_refresh")


async def post_with_session(client, path, token, headers=SAME_SITE):
    """POST as a browser holding refresh cookie `token` (and nothing else)."""
    client.cookies.clear()
    client.cookies.set("vs_refresh", token)
    try:
        return await client.post(f"{API}{path}", headers=headers)
    finally:
        client.cookies.clear()


# ---------- sign-up ----------


async def test_signup_creates_customer_and_sets_secure_refresh_cookie(client, db, outbox):
    response = await signup(client)
    body = response.json()

    assert response.status_code == 201
    assert body["user"]["role"] == "customer"
    assert body["user"]["email_verified"] is False
    assert "password_hash" not in body["user"]
    cookie_header = response.headers["set-cookie"]
    assert "vs_has_session=1" in cookie_header  # non-secret hint the frontend can read
    assert "vs_refresh=" in cookie_header
    assert "HttpOnly" in cookie_header and "Path=/api/v1/auth" in cookie_header
    assert "samesite=lax" in cookie_header.lower()
    stored = await db["users"].find_one({"email": body["user"]["email"]})
    assert stored["password_hash"].startswith("$argon2id$")  # never plaintext
    assert outbox[-1].tags["kind"] == "verify_email"


async def test_signup_can_create_owner_but_never_admin(client):
    owner = await signup(client, account_type="owner", business_name="Hill Stays")
    admin = await signup(client, account_type="admin")
    sneaky = await signup(client, role="admin")

    assert owner.status_code == 201 and owner.json()["user"]["role"] == "owner"
    assert admin.status_code == 422
    assert sneaky.status_code == 422  # unknown fields are rejected outright


async def test_signup_rejects_duplicate_email_case_insensitively(client):
    email = f"{unique('dup')}@example.com"
    await signup(client, email=email)
    response = await signup(client, email=email.upper())

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_TAKEN"


@pytest.mark.parametrize(
    "password",
    ["short1!", "1234567890123", "password123", "aaaaaaaaaaaa", "asharao-is-great"],
)
async def test_signup_rejects_weak_passwords(client, password):
    response = await signup(client, password=password)
    assert response.status_code == 422


async def test_validation_errors_never_echo_the_password(client):
    response = await signup(client, password="short")
    assert "short" not in response.text.replace("too_short", "")


# ---------- login ----------


async def test_login_returns_tokens(client, db):
    user = await make_user(db)
    response = await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": PASSWORD}
    )

    assert response.status_code == 200
    token = response.json()["access_token"]
    me = await client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == user["email"]


async def test_login_wrong_password_and_unknown_email_look_identical(client, db):
    user = await make_user(db)
    wrong = await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": "nope-nope-nope"}
    )
    unknown = await client.post(
        f"{API}/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"}
    )

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


async def test_login_locks_after_repeated_failures(client, db):
    user = await make_user(db)
    for _ in range(5):
        await client.post(
            f"{API}/auth/login", json={"email": user["email"], "password": "wrong-password"}
        )

    blocked = await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": PASSWORD}
    )

    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


async def test_suspended_user_cannot_log_in_or_use_tokens(client, db):
    user = await make_user(db, status="suspended")
    login = await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": PASSWORD}
    )
    me = await client.get(f"{API}/users/me", headers=auth_headers(user))

    assert login.status_code == 403 and login.json()["error"]["code"] == "ACCOUNT_SUSPENDED"
    assert me.status_code == 403


# ---------- access tokens ----------


async def test_protected_route_requires_token(client):
    response = await client.get(f"{API}/users/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"


async def test_expired_token_is_rejected_with_specific_code(client, db):
    user = await make_user(db)
    payload = {
        "sub": str(user["_id"]),
        "role": "customer",
        "ver": 0,
        "type": "access",
        "iat": now_utc() - timedelta(hours=1),
        "exp": now_utc() - timedelta(minutes=1),
    }
    token = jwt.encode(payload, "test-secret-not-for-production-0123456789", algorithm="HS256")

    response = await client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "TOKEN_EXPIRED"


async def test_tampered_and_wrongly_signed_tokens_are_rejected(client, db):
    user = await make_user(db)
    forged, _ = create_access_token(
        user_id=str(user["_id"]),
        role="admin",
        token_version=0,
        secret="attacker-secret-that-is-long-enough-123",
        ttl_minutes=5,
    )
    unsigned = jwt.encode({"sub": str(user["_id"]), "type": "access"}, key=None, algorithm="none")

    for token in (forged, unsigned, "not.a.jwt"):
        response = await client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


async def test_role_comes_from_database_not_token(client, db):
    """Even a validly signed token claiming 'admin' can't grant admin rights."""
    user = await make_user(db, role=Role.CUSTOMER)
    token, _ = create_access_token(
        user_id=str(user["_id"]),
        role="admin",
        token_version=0,
        secret="test-secret-not-for-production-0123456789",
        ttl_minutes=5,
    )
    response = await client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})
    assert response.json()["role"] == "customer"


async def test_bumping_token_version_revokes_existing_access_tokens(client, db):
    user = await make_user(db)
    headers = auth_headers(user)
    await db["users"].update_one({"_id": user["_id"]}, {"$inc": {"token_version": 1}})

    response = await client.get(f"{API}/users/me", headers=headers)
    assert response.status_code == 401


# ---------- refresh rotation ----------


async def test_refresh_rotates_the_token(client):
    first = refresh_cookie(await signup(client))

    response = await post_with_session(client, "/auth/refresh", first)
    second = refresh_cookie(response)

    assert response.status_code == 200
    assert response.json()["access_token"]
    assert second and second != first


async def test_reusing_a_rotated_token_revokes_the_whole_family(client, db):
    first = refresh_cookie(await signup(client))
    second = refresh_cookie(await post_with_session(client, "/auth/refresh", first))
    # Pretend the rotation happened long ago (outside the two-tab grace period).
    await db["sessions"].update_many(
        {"replaced": True}, {"$set": {"revoked_at": now_utc() - timedelta(minutes=5)}}
    )

    stolen = await post_with_session(client, "/auth/refresh", first)
    legit = await post_with_session(client, "/auth/refresh", second)

    assert stolen.status_code == 401 and stolen.json()["error"]["code"] == "SESSION_REVOKED"
    assert legit.status_code == 401  # the attacker's attempt also ended the real session


async def test_two_tabs_refreshing_at_once_both_succeed(client):
    first = refresh_cookie(await signup(client))
    a = await post_with_session(client, "/auth/refresh", first)
    b = await post_with_session(client, "/auth/refresh", first)
    assert a.status_code == b.status_code == 200


async def test_refresh_requires_csrf_header_and_allowed_origin(client):
    token = refresh_cookie(await signup(client))
    no_header = await post_with_session(client, "/auth/refresh", token, headers={})
    bad_origin = await post_with_session(
        client,
        "/auth/refresh",
        token,
        headers={"X-Requested-With": "XMLHttpRequest", "Origin": "https://evil.example"},
    )
    assert no_header.status_code == bad_origin.status_code == 403


async def test_logout_revokes_the_session(client):
    token = refresh_cookie(await signup(client))

    out = await post_with_session(client, "/auth/logout", token)
    again = await post_with_session(client, "/auth/refresh", token)

    assert out.status_code == 204
    assert 'vs_refresh=""' in out.headers["set-cookie"] or "Max-Age=0" in out.headers["set-cookie"]
    assert again.status_code == 401


# ---------- password reset & email verification ----------


async def test_password_reset_flow(client, db, outbox):
    user = await make_user(db)
    old_headers = auth_headers(user)

    response = await client.post(f"{API}/auth/forgot-password", json={"email": user["email"]})
    token = outbox[-1].tags["link"].split("token=")[1]
    reset = await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": "Fresh-Coffee-Estate-9"}
    )
    reuse = await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": "Another-Pass-77"}
    )
    login = await client.post(
        f"{API}/auth/login", json={"email": user["email"], "password": "Fresh-Coffee-Estate-9"}
    )

    assert response.status_code == 202
    assert reset.status_code == 204
    assert reuse.status_code == 409  # single use
    assert login.status_code == 200
    assert (
        await client.get(f"{API}/users/me", headers=old_headers)
    ).status_code == 401  # old tokens revoked


async def test_forgot_password_does_not_reveal_unknown_emails(client, outbox):
    before = len(outbox)
    response = await client.post(
        f"{API}/auth/forgot-password", json={"email": "nobody@example.com"}
    )
    assert response.status_code == 202
    assert len(outbox) == before


async def test_expired_reset_token_is_rejected(client, db, outbox):
    user = await make_user(db)
    await client.post(f"{API}/auth/forgot-password", json={"email": user["email"]})
    token = outbox[-1].tags["link"].split("token=")[1]
    await db["auth_tokens"].update_many(
        {"user_id": user["_id"]}, {"$set": {"expires_at": now_utc() - timedelta(seconds=1)}}
    )

    response = await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": "Fresh-Coffee-Estate-9"}
    )
    assert response.status_code == 409


async def test_email_verification(client, outbox):
    body = (await signup(client)).json()
    token = outbox[-1].tags["link"].split("token=")[1]
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    verify = await client.post(f"{API}/auth/verify-email", json={"token": token})
    me = await client.get(f"{API}/users/me", headers=headers)

    assert verify.status_code == 204
    assert me.json()["email_verified"] is True


async def test_change_password_keeps_this_device_and_signs_out_others(client, db):
    user = await make_user(db)
    other_device = auth_headers(user)

    response = await client.post(
        f"{API}/auth/change-password",
        headers=other_device,
        json={"current_password": PASSWORD, "new_password": "Tea-Garden-Walk-11"},
    )
    new_token = response.json()["access_token"]

    assert response.status_code == 200
    assert (await client.get(f"{API}/users/me", headers=other_device)).status_code == 401
    assert (
        await client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {new_token}"})
    ).status_code == 200


# ---------- profile ----------


async def test_profile_update_cannot_change_role_or_email(client, db):
    user = await make_user(db)
    headers = auth_headers(user)

    ok = await client.patch(
        f"{API}/users/me", headers=headers, json={"name": "New Name", "phone": "+919812345678"}
    )
    role = await client.patch(f"{API}/users/me", headers=headers, json={"role": "admin"})
    email = await client.patch(f"{API}/users/me", headers=headers, json={"email": "x@example.com"})

    assert ok.status_code == 200 and ok.json()["name"] == "New Name"
    assert role.status_code == email.status_code == 422


async def test_delete_account_anonymises_user(client, db):
    user = await make_user(db)
    response = await client.delete(f"{API}/users/me", headers=auth_headers(user))
    stored = await db["users"].find_one({"_id": user["_id"]})

    assert response.status_code == 204
    assert stored["name"] == "Deleted user" and "phone" not in stored
    assert stored["email"].endswith("@invalid.local")


# ---------- rate limiting ----------


async def test_signup_is_rate_limited_per_ip():
    import httpx

    from app.main import create_app

    app = create_app(make_settings(rate_limit_enabled=True))
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as c:
            codes = [
                (await c.post(f"{API}/auth/signup", json=signup_body())).status_code
                for _ in range(6)
            ]
    assert codes[:5] == [201] * 5
    assert codes[5] == 429
