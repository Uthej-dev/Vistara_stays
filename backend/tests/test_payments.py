"""Phase 10: Razorpay test-mode flow with a fake Razorpay API (no network)."""

import hashlib
import hmac
import json
import uuid
from datetime import timedelta

import httpx
import pytest

from app.main import create_app
from app.services.razorpay import RazorpayClient, verify_payment_signature, verify_webhook_signature
from app.utils.dates import iso, now_utc, today_ist
from tests.conftest import make_settings
from tests.factories import auth_headers, make_listing, make_user

pytestmark = pytest.mark.db
API = "/api/v1"
KEY_ID, KEY_SECRET, WEBHOOK_SECRET = "rzp_test_abc123", "test_key_secret_xyz", "test_webhook_secret"
GUEST = {
    "name": "Asha Rao",
    "email": "asha@example.com",
    "phone": "+919876543210",
    "age": 34,
    "nationality": "IN",
}


def sign(message: str, secret: str = KEY_SECRET) -> str:
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


class FakeRazorpay:
    """Stands in for api.razorpay.com and records what we asked it to do."""

    def __init__(self):
        self.calls = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        self.calls.append((request.method, request.url.path, body))
        assert request.headers["authorization"].startswith(
            "Basic "
        )  # key id + secret via basic auth
        if request.url.path == "/v1/orders":
            return httpx.Response(
                200,
                json={
                    "id": f"order_{uuid.uuid4().hex[:10]}",
                    "amount": body["amount"],
                    "currency": "INR",
                    "status": "created",
                },
            )
        if request.url.path.endswith("/refund"):
            return httpx.Response(
                200,
                json={
                    "id": f"rfnd_{uuid.uuid4().hex[:10]}",
                    "amount": body["amount"],
                    "status": "pending",
                },
            )
        return httpx.Response(404, json={})


@pytest.fixture
def fake_razorpay():
    return FakeRazorpay()


@pytest.fixture
async def rz_client(fake_razorpay):
    settings = make_settings(
        payment_provider="razorpay",
        razorpay_key_id=KEY_ID,
        razorpay_key_secret=KEY_SECRET,
        razorpay_webhook_secret=WEBHOOK_SECRET,
    )
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        app.state.razorpay_client = RazorpayClient(
            KEY_ID, KEY_SECRET, transport=httpx.MockTransport(fake_razorpay.handler)
        )
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            client.db = app.state.db
            yield client


async def hold(client, user, listing, start=30):
    body = {
        "room_type_id": str(listing["room"]["_id"]),
        "check_in": iso(today_ist() + timedelta(days=start)),
        "check_out": iso(today_ist() + timedelta(days=start + 2)),
        "rooms": 1,
        "adults": 2,
        "children": 0,
        "child_ages": [],
        "guest_details": GUEST,
    }
    response = await client.post(
        f"{API}/bookings",
        json=body,
        headers={**auth_headers(user), "Idempotency-Key": str(uuid.uuid4())},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def order_for(client, user, booking):
    response = await client.post(
        f"{API}/payments/razorpay/order",
        json={"booking_id": booking["id"]},
        headers=auth_headers(user),
    )
    return response


async def verify(client, user, order_id, payment_id="pay_TEST123", signature=None):
    return await client.post(
        f"{API}/payments/razorpay/verify",
        json={
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature or sign(f"{order_id}|{payment_id}"),
        },
        headers=auth_headers(user),
    )


def webhook_body(event: str, entity_key: str, entity: dict) -> bytes:
    return json.dumps(
        {"event": event, "payload": {entity_key: {"entity": entity}}, "created_at": 1}
    ).encode()


async def send_webhook(client, raw: bytes, event_id: str, secret: str = WEBHOOK_SECRET):
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return await client.post(
        f"{API}/payments/razorpay/webhook",
        content=raw,
        headers={
            "X-Razorpay-Signature": signature,
            "X-Razorpay-Event-Id": event_id,
            "Content-Type": "application/json",
        },
    )


# ---------- signatures ----------


def test_signature_helpers_match_razorpays_scheme():
    assert verify_payment_signature("order_1", "pay_1", sign("order_1|pay_1"), KEY_SECRET)
    assert not verify_payment_signature("order_1", "pay_2", sign("order_1|pay_1"), KEY_SECRET)
    raw = b'{"event":"payment.captured"}'
    assert verify_webhook_signature(
        raw, hmac.new(b"whsec", raw, hashlib.sha256).hexdigest(), "whsec"
    )
    assert not verify_webhook_signature(
        raw + b" ", hmac.new(b"whsec", raw, hashlib.sha256).hexdigest(), "whsec"
    )


# ---------- checkout flow ----------


async def test_config_exposes_only_the_public_key(rz_client):
    config = (await rz_client.get(f"{API}/payments/config")).json()
    assert config == {"provider": "razorpay", "simulated": False, "razorpay_key_id": KEY_ID}
    assert KEY_SECRET not in json.dumps(config)


async def test_order_uses_server_total_and_is_reused_on_retry(rz_client, fake_razorpay):
    db = rz_client.db
    listing, customer = await make_listing(db), await make_user(db)
    booking = await hold(rz_client, customer, listing)

    first = (await order_for(rz_client, customer, booking)).json()
    second = (await order_for(rz_client, customer, booking)).json()
    stranger = await order_for(rz_client, await make_user(db), booking)

    assert first["amount_paise"] == booking["price"]["total_paise"]
    assert first["order_id"] == second["order_id"]
    assert [c for c in fake_razorpay.calls if c[1] == "/v1/orders"] == [
        (
            "POST",
            "/v1/orders",
            {
                "amount": booking["price"]["total_paise"],
                "currency": "INR",
                "receipt": booking["booking_ref"],
                "notes": {"booking_id": booking["id"], "booking_ref": booking["booking_ref"]},
            },
        )
    ]
    assert stranger.status_code == 404


async def test_verified_payment_confirms_and_forged_signature_does_not(rz_client):
    db = rz_client.db
    listing, customer = await make_listing(db), await make_user(db)
    booking = await hold(rz_client, customer, listing)
    order_id = (await order_for(rz_client, customer, booking)).json()["order_id"]

    forged = await verify(rz_client, customer, order_id, signature="0" * 64)
    still_pending = (
        await rz_client.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(customer))
    ).json()
    ok = await verify(rz_client, customer, order_id)
    again = await verify(rz_client, customer, order_id)

    assert forged.status_code == 403 and still_pending["status"] == "pending_payment"
    assert ok.status_code == 200 and ok.json()["status"] == "confirmed"
    assert ok.json()["payment"] == {
        "provider": "razorpay",
        "simulated": False,
        "provider_order_id": order_id,
        "provider_payment_id": "pay_TEST123",
    }
    assert again.status_code == 200 and again.json()["status"] == "confirmed"  # idempotent
    owner_note = await db["notifications"].find_one(
        {"user_id": listing["owner"]["_id"], "type": "owner.booking"}
    )
    assert owner_note is not None


async def test_simulated_endpoints_are_off_in_razorpay_mode(rz_client):
    db = rz_client.db
    listing, customer = await make_listing(db), await make_user(db)
    booking = await hold(rz_client, customer, listing)
    response = await rz_client.post(
        f"{API}/payments/simulated/{booking['id']}/succeed", headers=auth_headers(customer)
    )
    assert response.status_code == 404


# ---------- webhooks ----------


async def test_webhook_confirms_even_if_the_browser_never_returns(rz_client):
    db = rz_client.db
    listing, customer = await make_listing(db), await make_user(db)
    booking = await hold(rz_client, customer, listing)
    order_id = (await order_for(rz_client, customer, booking)).json()["order_id"]
    raw = webhook_body("payment.captured", "payment", {"id": "pay_WEBHOOK1", "order_id": order_id})

    bad = await send_webhook(rz_client, raw, "evt_1", secret="wrong-secret")
    first = await send_webhook(rz_client, raw, "evt_1")
    replay = await send_webhook(rz_client, raw, "evt_1")
    stored = (
        await rz_client.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(customer))
    ).json()

    assert bad.status_code == 403
    assert first.json() == {"status": "processed", "event": "payment.captured"}
    assert replay.json() == {"status": "duplicate"}
    assert stored["status"] == "confirmed" and stored["payment_status"] == "paid"


async def test_late_payment_retakes_the_room_if_still_free(rz_client):
    db = rz_client.db
    listing, customer = await make_listing(db, units=1), await make_user(db)
    booking = await hold(rz_client, customer, listing)
    order_id = (await order_for(rz_client, customer, booking)).json()["order_id"]
    await db["bookings"].update_one(
        {"booking_ref": booking["booking_ref"]},
        {"$set": {"hold_expires_at": now_utc() - timedelta(minutes=5)}},
    )

    response = await verify(rz_client, customer, order_id)

    assert response.status_code == 200 and response.json()["status"] == "confirmed"
    nights = await db["inventory"].find({"room_type_id": listing["room"]["_id"]}).to_list(None)
    assert all(n["reserved_units"] == 1 for n in nights)


async def test_late_payment_for_a_room_that_is_gone_is_refunded(rz_client, fake_razorpay):
    db = rz_client.db
    listing = await make_listing(db, units=1)
    slow, fast = await make_user(db), await make_user(db)
    booking = await hold(rz_client, slow, listing)
    order_id = (await order_for(rz_client, slow, booking)).json()["order_id"]
    await db["bookings"].update_one(
        {"booking_ref": booking["booking_ref"]},
        {"$set": {"hold_expires_at": now_utc() - timedelta(minutes=5)}},
    )
    await hold(rz_client, fast, listing)  # someone else books the room meanwhile

    response = await verify(rz_client, slow, order_id)
    stored = await db["bookings"].find_one({"booking_ref": booking["booking_ref"]})

    assert response.status_code == 409 and response.json()["error"]["code"] == "HOLD_LOST"
    assert stored["status"] == "cancelled" and stored["payment_status"] == "refund_pending"
    refunds = [c for c in fake_razorpay.calls if c[1].endswith("/refund")]
    assert refunds == [
        (
            "POST",
            "/v1/payments/pay_TEST123/refund",
            {"amount": booking["price"]["total_paise"], "notes": {"reason": "hold_expired"}},
        )
    ]


# ---------- cancellations & refunds ----------


async def test_cancellation_requests_refund_and_webhook_completes_it(rz_client, fake_razorpay):
    db = rz_client.db
    listing, customer = await make_listing(db), await make_user(db)
    booking = await hold(
        rz_client, customer, listing, start=40
    )  # ≥7 days → 100% under the flexible policy
    order_id = (await order_for(rz_client, customer, booking)).json()["order_id"]
    await verify(rz_client, customer, order_id)

    cancelled = (
        await rz_client.post(
            f"{API}/bookings/{booking['id']}/cancel", json={}, headers=auth_headers(customer)
        )
    ).json()
    refund_call = [c for c in fake_razorpay.calls if c[1].endswith("/refund")][-1]
    payment = await db["payments"].find_one({"provider_order_id": order_id})
    refund_id = payment["refunds"][0]["provider_refund_id"]
    await send_webhook(
        rz_client,
        webhook_body("refund.processed", "refund", {"id": refund_id, "payment_id": "pay_TEST123"}),
        "evt_refund_1",
    )
    final = (
        await rz_client.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(customer))
    ).json()

    expected = booking["price"]["total_paise"] - booking["price"]["service_fee_paise"]
    assert cancelled["payment_status"] == "refund_pending"  # not "refunded" until Razorpay confirms
    assert cancelled["cancellation"]["refund_status"] == "pending"
    assert refund_call[2]["amount"] == expected
    assert final["payment_status"] == "partially_refunded"  # service fee kept
    assert final["cancellation"]["refund_status"] == "refunded"


# ---------- notifications ----------


async def test_notifications_list_and_mark_read(rz_client):
    db = rz_client.db
    user = await make_user(db)
    await db["notifications"].insert_many(
        [
            {
                "user_id": user["_id"],
                "type": "x",
                "title": "One",
                "body": "",
                "read_at": None,
                "created_at": now_utc(),
            },
            {
                "user_id": user["_id"],
                "type": "x",
                "title": "Two",
                "body": "",
                "read_at": None,
                "created_at": now_utc(),
            },
        ]
    )
    h = auth_headers(user)
    listed = (await rz_client.get(f"{API}/notifications", headers=h)).json()
    await rz_client.post(f"{API}/notifications/{listed['items'][0]['id']}/read", headers=h)
    after_one = (await rz_client.get(f"{API}/notifications", headers=h)).json()["unread"]
    other = await rz_client.post(
        f"{API}/notifications/{listed['items'][1]['id']}/read",
        headers=auth_headers(await make_user(db)),
    )
    await rz_client.post(f"{API}/notifications/read-all", headers=h)

    assert listed["unread"] == 2 and after_one == 1
    assert other.status_code == 404  # can't touch someone else's notifications
    assert (await rz_client.get(f"{API}/notifications", headers=h)).json()["unread"] == 0
