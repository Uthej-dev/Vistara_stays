"""Phase 7: the booking engine — holds, concurrency, idempotency, payment, expiry, cancellation."""

import asyncio
import uuid
from datetime import timedelta

import pytest

from app.models.enums import Role
from app.utils.dates import iso, now_utc, today_ist
from tests.factories import auth_headers, make_listing, make_user, unique

pytestmark = pytest.mark.db
API = "/api/v1"


def day(offset: int) -> str:
    return iso(today_ist() + timedelta(days=offset))


GUEST = {
    "name": "Asha Rao",
    "email": "asha@example.com",
    "phone": "+919876543210",
    "age": 34,
    "nationality": "IN",
}


def body(room, start=30, nights=2, **overrides):
    return {
        "room_type_id": str(room["_id"]),
        "check_in": day(start),
        "check_out": day(start + nights),
        "rooms": 1,
        "adults": 2,
        "children": 0,
        "child_ages": [],
        "guest_details": GUEST,
        **overrides,
    }


async def book(client, user, payload, key=None):
    headers = {**auth_headers(user), "Idempotency-Key": key or str(uuid.uuid4())}
    return await client.post(f"{API}/bookings", json=payload, headers=headers)


async def pay(client, user, booking_id):
    return await client.post(
        f"{API}/payments/simulated/{booking_id}/succeed", headers=auth_headers(user)
    )


async def assert_inventory_consistent(db, room_type_id):
    """reserved_units on every night must equal the rooms held by active bookings that night."""
    nights = await db["inventory"].find({"room_type_id": room_type_id}).to_list(None)
    active = (
        await db["bookings"]
        .find(
            {
                "room_type_id": room_type_id,
                "status": {"$in": ["pending_payment", "pending_owner", "confirmed"]},
            }
        )
        .to_list(None)
    )
    for night in nights:
        expected = sum(b["rooms"] for b in active if night["date"] in b["night_dates"])
        assert night["reserved_units"] == expected, night["date"]
        assert night["reserved_units"] + night["blocked_units"] <= night["total_units"]


# ---------- creating a hold ----------


async def test_booking_holds_rooms_and_snapshots_price_and_policy(client, db):
    listing = await make_listing(db)
    customer = await make_user(db)
    quote = (
        await client.post(
            f"{API}/bookings/quote",
            json={k: v for k, v in body(listing["room"]).items() if k != "guest_details"},
        )
    ).json()

    response = await book(client, customer, body(listing["room"]))
    booking = response.json()

    assert response.status_code == 201
    assert booking["status"] == "pending_payment" and booking["payment_status"] == "unpaid"
    assert booking["booking_ref"].startswith("VS-")
    assert booking["price"]["total_paise"] == quote["price"]["total_paise"]
    assert booking["policy_snapshot"]["cancellation_policy"]["tiers"][0]["refund_pct"] == 100
    assert booking["guest_details"]["name"] == "Asha Rao"
    assert "address" not in booking["resort_snapshot"]  # exact address only after confirmation
    hold = (now_utc() + timedelta(minutes=15)).isoformat()
    assert booking["hold_expires_at"][:16] <= hold[:16]
    nights = await db["inventory"].find({"room_type_id": listing["room"]["_id"]}).to_list(None)
    assert sorted(n["date"] for n in nights) == [day(30), day(31)]
    assert all(n["reserved_units"] == 1 for n in nights)


async def test_unverified_email_cannot_book(client, db):
    listing = await make_listing(db)
    customer = await make_user(db, email_verified=False)
    response = await book(client, customer, body(listing["room"]))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "EMAIL_NOT_VERIFIED"


@pytest.mark.parametrize("role", [Role.OWNER, Role.ADMIN])
async def test_only_customers_can_book(client, db, role):
    listing = await make_listing(db)
    user = await make_user(db, role=role)
    assert (await book(client, user, body(listing["room"]))).status_code == 403


@pytest.mark.parametrize(
    "guest_change",
    [
        {"age": 17},
        {"phone": "98765"},
        {"email": "not-an-email"},
        {"name": ""},
        {"nationality": "india"},
    ],
)
async def test_lead_guest_details_are_validated(client, db, guest_change):
    listing = await make_listing(db)
    customer = await make_user(db)
    response = await book(
        client, customer, body(listing["room"], guest_details={**GUEST, **guest_change})
    )
    assert response.status_code == 422


async def test_idempotency_key_is_required(client, db):
    listing = await make_listing(db)
    customer = await make_user(db)
    response = await client.post(
        f"{API}/bookings", json=body(listing["room"]), headers=auth_headers(customer)
    )
    assert response.status_code == 422


async def test_client_supplied_totals_are_rejected(client, db):
    listing = await make_listing(db)
    customer = await make_user(db)
    response = await book(client, customer, {**body(listing["room"]), "total_paise": 100})
    assert response.status_code == 422


# ---------- idempotency ----------


async def test_retrying_with_the_same_key_returns_the_same_booking(client, db):
    listing = await make_listing(db)
    customer = await make_user(db)
    key = str(uuid.uuid4())

    first = await book(client, customer, body(listing["room"]), key)
    second = await book(client, customer, body(listing["room"]), key)
    different = await book(client, customer, body(listing["room"], start=50), key)

    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert (
        different.status_code == 409
        and different.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    )
    assert await db["bookings"].count_documents({"user_id": customer["_id"]}) == 1
    await assert_inventory_consistent(db, listing["room"]["_id"])


async def test_double_click_storm_creates_one_booking(client, db):
    listing = await make_listing(db, units=5)
    customer = await make_user(db)
    key = str(uuid.uuid4())

    responses = await asyncio.gather(
        *(book(client, customer, body(listing["room"]), key) for _ in range(5))
    )

    assert sorted(r.status_code for r in responses).count(201) == 1
    assert {r.json()["id"] for r in responses} == {responses[0].json()["id"]}
    await assert_inventory_consistent(db, listing["room"]["_id"])


# ---------- concurrency: the last room ----------


async def test_twenty_customers_racing_for_the_last_room(client, db):
    listing = await make_listing(db, units=1)
    customers = [await make_user(db) for _ in range(20)]

    responses = await asyncio.gather(*(book(client, c, body(listing["room"])) for c in customers))
    codes = [r.status_code for r in responses]

    assert codes.count(201) == 1
    assert codes.count(409) == 19
    assert {r.json()["error"]["code"] for r in responses if r.status_code == 409} == {
        "ROOM_UNAVAILABLE"
    }
    nights = await db["inventory"].find({"room_type_id": listing["room"]["_id"]}).to_list(None)
    assert all(n["reserved_units"] == 1 for n in nights)
    await assert_inventory_consistent(db, listing["room"]["_id"])


async def test_overlapping_multi_night_stays_never_oversell(client, db):
    listing = await make_listing(db, units=1)
    a, b = await make_user(db), await make_user(db)

    ra, rb = await asyncio.gather(
        book(client, a, body(listing["room"], start=30, nights=3)),
        book(client, b, body(listing["room"], start=32, nights=3)),  # overlaps on one night
    )

    assert sorted([ra.status_code, rb.status_code]) == [201, 409]
    await assert_inventory_consistent(
        db, listing["room"]["_id"]
    )  # loser's other nights rolled back


async def test_owner_blocked_units_reduce_what_can_be_booked(client, db):
    listing = await make_listing(db, units=2)
    room = listing["room"]
    await db["inventory"].insert_one(
        {
            "room_type_id": room["_id"],
            "resort_id": room["resort_id"],
            "date": day(30),
            "total_units": 2,
            "reserved_units": 0,
            "blocked_units": 1,
            "version": 0,
        }
    )
    first = await book(client, await make_user(db), body(room))
    second = await book(client, await make_user(db), body(room))
    assert (first.status_code, second.status_code) == (201, 409)


# ---------- payment, expiry ----------


async def test_simulated_payment_confirms_and_is_idempotent(client, db):
    listing = await make_listing(db)
    customer = await make_user(db)
    booking = (await book(client, customer, body(listing["room"]))).json()

    paid = await pay(client, customer, booking["id"])
    again = await pay(client, customer, booking["id"])
    payment = await db["payments"].find_one(
        {
            "booking_id": listing
            and (await db["bookings"].find_one({"booking_ref": booking["booking_ref"]}))["_id"]
        }
    )

    assert paid.status_code == 200
    assert paid.json()["status"] == "confirmed" and paid.json()["payment_status"] == "paid"
    assert paid.json()["payment"]["simulated"] is True
    assert paid.json()["resort_snapshot"]["address"]  # revealed once confirmed
    assert again.status_code == 200 and again.json()["status"] == "confirmed"
    assert payment["status"] == "captured" and payment["simulated"] is True


async def test_request_mode_waits_for_the_owner(client, db):
    listing = await make_listing(db, booking_mode="request")
    customer = await make_user(db)
    booking = (await book(client, customer, body(listing["room"]))).json()
    paid = (await pay(client, customer, booking["id"])).json()
    assert paid["status"] == "pending_owner"


async def test_expired_hold_releases_rooms_and_blocks_payment(client, db):
    listing = await make_listing(db, units=1)
    customer, other = await make_user(db), await make_user(db)
    booking = (await book(client, customer, body(listing["room"]))).json()
    await db["bookings"].update_one(
        {"booking_ref": booking["booking_ref"]},
        {"$set": {"hold_expires_at": now_utc() - timedelta(seconds=1)}},
    )

    late_payment = await pay(client, customer, booking["id"])
    status = (
        await client.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(customer))
    ).json()["status"]
    someone_else = await book(client, other, body(listing["room"]))

    assert late_payment.status_code == 409
    assert status == "expired"
    assert someone_else.status_code == 201  # the room went back on sale
    await assert_inventory_consistent(db, listing["room"]["_id"])


async def test_new_booking_attempt_releases_stale_holds_first(client, db):
    listing = await make_listing(db, units=1)
    first = (await book(client, await make_user(db), body(listing["room"]))).json()
    await db["bookings"].update_one(
        {"booking_ref": first["booking_ref"]},
        {"$set": {"hold_expires_at": now_utc() - timedelta(minutes=1)}},
    )

    second = await book(client, await make_user(db), body(listing["room"]))

    assert second.status_code == 201
    assert (await db["bookings"].find_one({"booking_ref": first["booking_ref"]}))[
        "status"
    ] == "expired"


async def test_failed_payment_releases_the_hold(client, db):
    listing = await make_listing(db, units=1)
    customer = await make_user(db)
    booking = (await book(client, customer, body(listing["room"]))).json()

    failed = await client.post(
        f"{API}/payments/simulated/{booking['id']}/fail", headers=auth_headers(customer)
    )

    assert failed.json()["status"] == "expired"
    await assert_inventory_consistent(db, listing["room"]["_id"])


# ---------- cancellation ----------


@pytest.mark.parametrize("start,expected_pct", [(10, 100), (3, 50), (1, 0)])
async def test_cancellation_refund_follows_the_booked_policy(client, db, start, expected_pct):
    listing = await make_listing(db)
    customer = await make_user(db)
    booking = (await book(client, customer, body(listing["room"], start=start))).json()
    await pay(client, customer, booking["id"])
    # The property tightens its policy afterwards — the booking keeps the original terms.
    await db["resorts"].update_one(
        {"_id": listing["resort"]["_id"]},
        {
            "$set": {
                "policies.cancellation_policy.tiers": [{"days_before_check_in": 0, "refund_pct": 0}]
            }
        },
    )

    preview = (
        await client.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(customer))
    ).json()["cancellation_preview"]
    cancelled = (
        await client.post(
            f"{API}/bookings/{booking['id']}/cancel",
            json={"reason": "Plans changed"},
            headers=auth_headers(customer),
        )
    ).json()

    refundable = booking["price"]["total_paise"] - booking["price"]["service_fee_paise"]
    assert preview["refund_pct"] == expected_pct
    assert cancelled["status"] == "cancelled"
    assert cancelled["cancellation"]["refund_paise"] == refundable * expected_pct // 100
    assert cancelled["cancellation"]["refund_status"] == (
        "simulated_refund" if expected_pct else "not_applicable"
    )
    await assert_inventory_consistent(db, listing["room"]["_id"])


async def test_cancelling_an_unpaid_hold_and_cancelling_twice(client, db):
    listing = await make_listing(db)
    customer = await make_user(db)
    booking = (await book(client, customer, body(listing["room"]))).json()
    url = f"{API}/bookings/{booking['id']}/cancel"

    first = await client.post(url, json={}, headers=auth_headers(customer))
    second = await client.post(url, json={}, headers=auth_headers(customer))

    assert (
        first.json()["status"] == "cancelled" and first.json()["cancellation"]["refund_paise"] == 0
    )
    assert second.status_code == 400 and second.json()["error"]["code"] == "NOT_CANCELLABLE"
    await assert_inventory_consistent(db, listing["room"]["_id"])


async def test_customers_only_see_their_own_bookings(client, db):
    listing = await make_listing(db)
    owner_of_booking, stranger = await make_user(db), await make_user(db)
    booking = (await book(client, owner_of_booking, body(listing["room"]))).json()

    view = await client.get(f"{API}/bookings/{booking['id']}", headers=auth_headers(stranger))
    cancel = await client.post(
        f"{API}/bookings/{booking['id']}/cancel", json={}, headers=auth_headers(stranger)
    )
    pay_it = await pay(client, stranger, booking["id"])

    assert view.status_code == cancel.status_code == pay_it.status_code == 404


async def test_booking_list_scopes_and_lazy_completion(client, db):
    listing = await make_listing(db)
    customer = await make_user(db)
    upcoming = (await book(client, customer, body(listing["room"]))).json()
    await pay(client, customer, upcoming["id"])
    # A stay that has already ended (inserted directly: you can't book the past).
    past = (await book(client, customer, body(listing["room"], start=60))).json()
    await pay(client, customer, past["id"])
    await db["bookings"].update_one(
        {"booking_ref": past["booking_ref"]}, {"$set": {"check_in": day(-5), "check_out": day(-3)}}
    )

    h = auth_headers(customer)
    up = (await client.get(f"{API}/bookings", params={"scope": "upcoming"}, headers=h)).json()
    done = (await client.get(f"{API}/bookings", params={"scope": "past"}, headers=h)).json()

    assert [b["booking_ref"] for b in up["items"]] == [upcoming["booking_ref"]]
    assert [b["booking_ref"] for b in done["items"]] == [past["booking_ref"]]
    assert done["items"][0]["status"] == "completed" and done["items"][0]["can_review"] is True


async def test_limited_coupon_can_be_used_once_and_is_restored_on_expiry(client, db):
    listing = await make_listing(db, units=5)
    code = unique("ONE").upper().replace("-", "")
    await db["coupons"].insert_one(
        {
            "code": code,
            "type": "flat",
            "value": 50000,
            "is_active": True,
            "usage_limit": 1,
            "used_count": 0,
        }
    )
    a, b = await make_user(db), await make_user(db)

    first = await book(client, a, body(listing["room"], coupon_code=code))
    second = await book(client, b, body(listing["room"], coupon_code=code))
    await db["bookings"].update_one(
        {"booking_ref": first.json()["booking_ref"]},
        {"$set": {"hold_expires_at": now_utc() - timedelta(seconds=1)}},
    )
    await client.get(
        f"{API}/bookings/{first.json()['id']}", headers=auth_headers(a)
    )  # triggers expiry
    third = await book(client, b, body(listing["room"], coupon_code=code))

    assert first.status_code == 201 and first.json()["price"]["discount_paise"] == 50000
    assert second.status_code == 400 and second.json()["error"]["code"] == "COUPON_INVALID"
    assert third.status_code == 201  # usage was returned when the first hold expired
    assert (await db["coupons"].find_one({"code": code}))["used_count"] == 1
