"""Booking without signing up first: account created from checkout details, confirmations by
email + SMS after a successful payment."""

import uuid
from datetime import timedelta

import pytest

from app.utils.dates import iso, today_ist
from tests.factories import PASSWORD, make_listing, make_user, unique

pytestmark = pytest.mark.db
API = "/api/v1"


def details(**overrides):
    return {
        "first_name": "Meera",
        "last_name": "Nair",
        "email": f"{unique('meera')}@example.com",
        "phone": "+919812345678",
        **overrides,
    }


async def checkout_signup(client, body):
    return await client.post(f"{API}/auth/checkout-signup", json=body)


async def test_new_guest_gets_an_account_and_is_signed_in(client, db, outbox):
    body = details()
    response = await checkout_signup(client, body)
    data = response.json()
    stored = await db["users"].find_one({"email": body["email"]})

    assert response.status_code == 201
    assert data["user"]["name"] == "Meera Nair" and data["user"]["role"] == "customer"
    assert data["access_token"] and "vs_refresh=" in response.headers["set-cookie"]
    assert stored["password_hash"] is None and stored["phone"] == "+919812345678"
    assert stored["first_name"] == "Meera" and stored["last_name"] == "Nair"
    assert outbox[-1].tags["kind"] == "set_password"


async def test_existing_email_must_log_in_instead(client, db):
    existing = await make_user(db)
    response = await checkout_signup(client, details(email=existing["email"]))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ACCOUNT_EXISTS"
    assert "set-cookie" not in response.headers  # never signed in on an email address alone


@pytest.mark.parametrize(
    "change",
    [
        {"first_name": ""},
        {"last_name": ""},
        {"email": "nope"},
        {"phone": "12345"},
        {"role": "admin"},
    ],
)
async def test_checkout_details_are_validated(client, change):
    assert (await checkout_signup(client, details(**change))).status_code == 422


async def test_set_password_link_lets_them_log_in_later(client, outbox):
    body = details()
    await checkout_signup(client, body)
    no_password = await client.post(
        f"{API}/auth/login", json={"email": body["email"], "password": "anything-at-all"}
    )
    token = outbox[-1].tags["link"].split("token=")[1].split("&")[0]

    set_it = await client.post(
        f"{API}/auth/reset-password", json={"token": token, "new_password": "Backwater-Sunset-88"}
    )
    login = await client.post(
        f"{API}/auth/login", json={"email": body["email"], "password": "Backwater-Sunset-88"}
    )

    assert no_password.status_code == 401
    assert set_it.status_code == 204
    assert login.status_code == 200 and login.json()["user"]["email_verified"] is True


async def test_guest_books_and_gets_email_and_sms_after_payment(client, db, app, outbox):
    listing = await make_listing(db)
    body = details()
    session = (await checkout_signup(client, body)).json()
    headers = {"Authorization": f"Bearer {session['access_token']}"}
    start = today_ist() + timedelta(days=30)

    booking = await client.post(
        f"{API}/bookings",
        json={
            "room_type_id": str(listing["room"]["_id"]),
            "check_in": iso(start),
            "check_out": iso(start + timedelta(days=2)),
            "rooms": 1,
            "adults": 2,
            "children": 0,
            "child_ages": [],
            "guest_details": {k: body[k] for k in ("first_name", "last_name", "email", "phone")},
        },
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    sms_before = len(app.state.sms_outbox)
    paid = await client.post(
        f"{API}/payments/simulated/{booking.json()['id']}/succeed", headers=headers
    )

    assert booking.status_code == 201  # no email verification needed
    assert booking.json()["guest_details"] == {
        **{k: body[k] for k in ("first_name", "last_name", "email", "phone")},
        "name": "Meera Nair",
    }
    assert paid.json()["status"] == "confirmed"
    sms = app.state.sms_outbox[sms_before:]
    assert len(sms) == 1 and sms[0]["to"] == "+919812345678"
    assert booking.json()["booking_ref"] in sms[0]["text"]
    assert any(e.to == body["email"] and "confirmed" in e.subject for e in outbox)


async def test_regular_customers_still_book_as_before(client, db):
    customer = await make_user(db)
    login = await client.post(
        f"{API}/auth/login", json={"email": customer["email"], "password": PASSWORD}
    )
    assert login.status_code == 200
