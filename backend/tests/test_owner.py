"""Phase 8: owner portal, ownership isolation, listing lifecycle, approval workflow, uploads."""

import uuid
from datetime import timedelta

import pytest

from app.models.enums import Role
from app.utils.dates import iso, now_utc, today_ist
from tests.factories import auth_headers, make_destination, make_listing, make_user

pytestmark = pytest.mark.db
API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def day(n: int) -> str:
    return iso(today_ist() + timedelta(days=n))


ROOM = {
    "name": "Garden Room",
    "max_adults": 2,
    "max_children": 1,
    "max_occupancy": 3,
    "base_occupancy": 2,
    "beds": [{"type": "queen", "count": 1}],
    "total_units": 4,
    "base_rate_paise": 450000,
    "meal_plan": "breakfast",
}


async def seed_categories(db):
    for kind, slug in [
        ("amenity", "wifi"),
        ("amenity", "pool"),
        ("category", "mountain_retreat"),
        ("surrounding", "mountain"),
    ]:
        await db["categories"].update_one(
            {"slug": slug}, {"$set": {"kind": kind, "name": slug, "sort_order": 0}}, upsert=True
        )


async def upload(client, user, data=PNG, alt="Pool at sunset"):
    return await client.post(
        f"{API}/uploads/images",
        headers=auth_headers(user),
        files={"file": ("photo.png", data, "image/png")},
        data={"alt": alt},
    )


# ---------- access control ----------


@pytest.mark.parametrize(
    "path", ["/owner/dashboard", "/owner/resorts", "/owner/bookings", "/owner/enquiries"]
)
async def test_owner_routes_need_owner_role(client, db, path):
    customer = await make_user(db)
    admin = await make_user(db, role=Role.ADMIN)
    assert (await client.get(f"{API}{path}")).status_code == 401
    assert (await client.get(f"{API}{path}", headers=auth_headers(customer))).status_code == 403
    assert (await client.get(f"{API}{path}", headers=auth_headers(admin))).status_code == 403


async def test_admin_routes_need_admin_role(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner, status="pending_review")
    response = await client.post(
        f"{API}/admin/resorts/{listing['resort']['_id']}/approve", headers=auth_headers(owner)
    )
    assert response.status_code == 403


async def test_owners_cannot_touch_each_others_data(client, db):
    alice = await make_user(db, role=Role.OWNER)
    bob = await make_user(db, role=Role.OWNER)
    bobs = await make_listing(db, owner=bob)
    rid, room_id = bobs["resort"]["_id"], bobs["room"]["_id"]
    customer = await make_user(db)
    booking = await db["bookings"].insert_one(
        {
            "booking_ref": f"VS-{uuid.uuid4().hex[:6]}",
            "owner_id": bob["_id"],
            "resort_id": rid,
            "room_type_id": room_id,
            "user_id": customer["_id"],
            "status": "confirmed",
            "check_in": day(10),
            "check_out": day(12),
            "idempotency_key": uuid.uuid4().hex,
        }
    )
    h = auth_headers(alice)

    attempts = [
        await client.get(f"{API}/owner/resorts/{rid}", headers=h),
        await client.patch(
            f"{API}/owner/resorts/{rid}", headers=h, json={"description": "hijacked"}
        ),
        await client.post(f"{API}/owner/resorts/{rid}/room-types", headers=h, json=ROOM),
        await client.patch(
            f"{API}/owner/room-types/{room_id}", headers=h, json={"base_rate_paise": 100000}
        ),
        await client.get(
            f"{API}/owner/room-types/{room_id}/calendar",
            headers=h,
            params={"from": day(1), "to": day(10)},
        ),
        await client.put(
            f"{API}/owner/room-types/{room_id}/calendar",
            headers=h,
            json={"from": day(1), "to": day(2), "closed": True},
        ),
        await client.get(f"{API}/owner/bookings/{booking.inserted_id}", headers=h),
        await client.post(
            f"{API}/owner/bookings/{booking.inserted_id}/cancel",
            headers=h,
            json={"reason": "nope nope"},
        ),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)
    assert (await db["resorts"].find_one({"_id": rid}))["description"] != "hijacked"
    assert (await client.get(f"{API}/owner/bookings", headers=h)).json()["total"] == 0


async def test_owner_id_in_body_is_rejected(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    response = await client.patch(
        f"{API}/owner/resorts/{listing['resort']['_id']}",
        headers=auth_headers(owner),
        json={"owner_id": str(uuid.uuid4().hex[:24]), "status": "published"},
    )
    assert response.status_code == 422


# ---------- listing lifecycle & approval ----------


async def test_full_listing_lifecycle_through_admin_approval(client, db):
    await seed_categories(db)
    owner = await make_user(db, role=Role.OWNER)
    admin = await make_user(db, role=Role.ADMIN)
    destination = await make_destination(
        db, location={"type": "Point", "coordinates": [77.0, 10.0]}
    )
    h, ha = auth_headers(owner), auth_headers(admin)

    created = await client.post(
        f"{API}/owner/resorts",
        headers=h,
        json={
            "name": "Hill Breeze",
            "destination": destination["slug"],
            "property_type": "cottage",
        },
    )
    rid = created.json()["id"]
    early = await client.post(f"{API}/owner/resorts/{rid}/submit", headers=h)

    images = [(await upload(client, owner, alt=f"Photo {i}")).json() for i in range(3)]
    patched = await client.patch(
        f"{API}/owner/resorts/{rid}",
        headers=h,
        json={
            "description": "A quiet hillside cottage stay surrounded by tea gardens, with long walks and cool evenings.",
            "amenities": ["wifi", "pool"],
            "categories": ["mountain_retreat"],
            "surroundings": ["mountain"],
            "address": {
                "line1": "12 Estate Road",
                "town": "Munnar",
                "district": "Idukki",
                "pincode": "685612",
            },
            "location": {"lat": 10.02, "lng": 77.03},
            "images": images,
        },
    )
    room = await client.post(f"{API}/owner/resorts/{rid}/room-types", headers=h, json=ROOM)
    submitted = await client.post(f"{API}/owner/resorts/{rid}/submit", headers=h)
    hidden = await client.get(f"{API}/resorts/{created.json()['slug']}")
    queue = (
        await client.get(f"{API}/admin/resorts", headers=ha, params={"status": "pending_review"})
    ).json()
    reject_without_reason = await client.post(
        f"{API}/admin/resorts/{rid}/reject", headers=ha, json={}
    )
    approved = await client.post(f"{API}/admin/resorts/{rid}/approve", headers=ha)
    public = await client.get(f"{API}/resorts/{created.json()['slug']}")

    assert created.status_code == 201 and created.json()["status"] == "draft"
    assert (
        early.status_code == 400
        and "At least 3 photos" in early.json()["error"]["details"]["missing"]
    )
    assert patched.status_code == 200 and patched.json()["distance_from_centre_km"] < 10
    assert room.status_code == 201
    assert submitted.json()["status"] == "pending_review"
    assert hidden.status_code == 404  # not public until approved
    assert rid in [r["id"] for r in queue["items"]]
    assert reject_without_reason.status_code == 400
    assert approved.json()["status"] == "published"
    assert public.status_code == 200 and public.json()["starting_price_paise"] == 450000
    log = await db["audit_logs"].find_one(
        {
            "action": "resort.approve",
            "target_id": approved.json() and created.json() and __import__("bson").ObjectId(rid),
        }
    )
    assert log and log["actor_id"] == admin["_id"]
    note = await db["notifications"].find_one({"user_id": owner["_id"], "type": "resort.approve"})
    assert note is not None


async def test_rejection_reason_reaches_owner_and_they_can_resubmit(client, db):
    owner = await make_user(db, role=Role.OWNER)
    admin = await make_user(db, role=Role.ADMIN)
    listing = await make_listing(
        db, owner=owner, status="pending_review", description="x" * 60, amenities=["wifi"]
    )
    rid = listing["resort"]["_id"]

    await client.post(
        f"{API}/admin/resorts/{rid}/reject",
        headers=auth_headers(admin),
        json={"reason": "Photos are blurry"},
    )
    seen = (await client.get(f"{API}/owner/resorts/{rid}", headers=auth_headers(owner))).json()
    again = await client.post(f"{API}/owner/resorts/{rid}/submit", headers=auth_headers(owner))

    assert seen["status"] == "rejected" and seen["rejection_reason"] == "Photos are blurry"
    assert again.json()["status"] == "pending_review"


async def test_editing_a_live_listings_identity_needs_review_again(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    rid = listing["resort"]["_id"]

    price_tweak = await client.patch(
        f"{API}/owner/resorts/{rid}",
        headers=auth_headers(owner),
        json={"highlights": ["Sunrise deck"]},
    )
    renamed = await client.patch(
        f"{API}/owner/resorts/{rid}",
        headers=auth_headers(owner),
        json={"name": "A Completely New Name"},
    )

    assert price_tweak.json()["status"] == "published"
    assert renamed.json()["status"] == "pending_review"


@pytest.mark.parametrize(
    "change,code",
    [
        ({"amenities": ["helipad"]}, "UNKNOWN_OPTION"),
        ({"images": [{"src": "https://evil.example/pixel.gif", "alt": "x"}]}, "IMAGE_NOT_ALLOWED"),
        ({"location": {"lat": 18.9, "lng": 84.9}}, "LOCATION_TOO_FAR"),
        ({"destination": "atlantis"}, "UNKNOWN_DESTINATION"),
    ],
)
async def test_listing_edits_are_validated(client, db, change, code):
    await seed_categories(db)
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    response = await client.patch(
        f"{API}/owner/resorts/{listing['resort']['_id']}", headers=auth_headers(owner), json=change
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == code


async def test_archive_is_blocked_by_upcoming_bookings(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    await db["bookings"].insert_one(
        {
            "booking_ref": f"VS-{uuid.uuid4().hex[:6]}",
            "owner_id": owner["_id"],
            "resort_id": listing["resort"]["_id"],
            "status": "confirmed",
            "check_in": day(5),
            "check_out": day(7),
            "user_id": owner["_id"],
            "idempotency_key": uuid.uuid4().hex,
        }
    )
    response = await client.post(
        f"{API}/owner/resorts/{listing['resort']['_id']}/archive", headers=auth_headers(owner)
    )
    assert response.status_code == 409


# ---------- rooms, calendar, rate rules ----------


async def test_room_occupancy_must_be_consistent(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    bad = await client.post(
        f"{API}/owner/resorts/{listing['resort']['_id']}/room-types",
        headers=auth_headers(owner),
        json={**ROOM, "max_occupancy": 9},
    )
    assert bad.status_code == 422


async def test_units_cannot_drop_below_existing_bookings(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner, units=3)
    room = listing["room"]
    await db["inventory"].insert_one(
        {
            "room_type_id": room["_id"],
            "resort_id": room["resort_id"],
            "date": day(20),
            "total_units": 3,
            "reserved_units": 2,
            "blocked_units": 0,
            "version": 0,
        }
    )

    too_few = await client.patch(
        f"{API}/owner/room-types/{room['_id']}",
        headers=auth_headers(owner),
        json={"total_units": 1},
    )
    ok = await client.patch(
        f"{API}/owner/room-types/{room['_id']}",
        headers=auth_headers(owner),
        json={"total_units": 5},
    )

    assert too_few.status_code == 409 and too_few.json()["error"]["details"]["dates"] == [day(20)]
    assert ok.status_code == 200
    assert (await db["inventory"].find_one({"room_type_id": room["_id"], "date": day(20)}))[
        "total_units"
    ] == 5


async def test_calendar_blocks_never_override_bookings(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner, units=2)
    room = listing["room"]
    await db["inventory"].insert_one(
        {
            "room_type_id": room["_id"],
            "resort_id": room["resort_id"],
            "date": day(21),
            "total_units": 2,
            "reserved_units": 2,
            "blocked_units": 0,
            "version": 0,
        }
    )
    url = f"{API}/owner/room-types/{room['_id']}/calendar"

    result = (
        await client.put(
            url,
            headers=auth_headers(owner),
            json={
                "from": day(20),
                "to": day(22),
                "blocked_units": 1,
                "price_override_paise": 900000,
            },
        )
    ).json()
    calendar = (
        await client.get(url, headers=auth_headers(owner), params={"from": day(20), "to": day(22)})
    ).json()["days"]
    past = await client.put(
        url, headers=auth_headers(owner), json={"from": day(-2), "to": day(1), "closed": True}
    )
    too_long = await client.get(
        url, headers=auth_headers(owner), params={"from": day(1), "to": day(120)}
    )

    assert result["conflicts"] == [day(21)]
    assert [(d["blocked_units"], d["available_units"], d["rate_paise"]) for d in calendar] == [
        (1, 1, 900000),
        (0, 0, 900000),
        (1, 1, 900000),
    ]
    assert past.status_code == 400 and too_long.status_code == 400


async def test_rate_rules_change_quotes(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    room = listing["room"]
    rule = await client.post(
        f"{API}/owner/room-types/{room['_id']}/rate-rules",
        headers=auth_headers(owner),
        json={
            "name": "Diwali",
            "start_date": day(40),
            "end_date": day(45),
            "adjustment_type": "percent",
            "value": 50,
            "priority": 2,
        },
    )
    quote = (
        await client.post(
            f"{API}/bookings/quote",
            json={
                "room_type_id": str(room["_id"]),
                "check_in": day(40),
                "check_out": day(41),
                "rooms": 1,
                "adults": 2,
                "children": 0,
                "child_ages": [],
            },
        )
    ).json()
    deleted = await client.delete(
        f"{API}/owner/rate-rules/{rule.json()['id']}", headers=auth_headers(owner)
    )

    assert rule.status_code == 201
    assert quote["price"]["nights"][0]["source"] == "rule:Diwali"
    assert deleted.status_code == 204


# ---------- reservations ----------


async def make_booking(
    db, listing, customer, *, status="confirmed", start=10, nights=2, mode="instant"
):
    doc = {
        "booking_ref": f"VS-{uuid.uuid4().hex[:6].upper()}",
        "user_id": customer["_id"],
        "owner_id": listing["owner"]["_id"],
        "resort_id": listing["resort"]["_id"],
        "room_type_id": listing["room"]["_id"],
        "check_in": day(start),
        "check_out": day(start + nights),
        "nights": nights,
        "night_dates": [day(start + i) for i in range(nights)],
        "rooms": 1,
        "guests": {"adults": 2, "children": 0, "child_ages": []},
        "guest_details": {
            "name": "Asha Rao",
            "email": "asha@example.com",
            "phone": "+919876543210",
            "age": 34,
            "nationality": "IN",
        },
        "status": status,
        "payment_status": "paid",
        "hold_expires_at": now_utc(),
        "inventory_released": False,
        "price": {
            "total_paise": 1070000,
            "service_fee_paise": 20000,
            "taxable_paise": 1000000,
            "nights": [],
            "taxes": [],
            "meal_plan": "breakfast",
        },
        "policy_snapshot": {
            "cancellation_policy": {"tiers": [{"days_before_check_in": 0, "refund_pct": 0}]},
            "check_in_time": "14:00",
            "check_out_time": "11:00",
            "booking_mode": mode,
        },
        "resort_snapshot": {"name": "R", "room_type_name": "Room", "address": {"line1": "x"}},
        "payment": {"provider": "simulated", "simulated": True},
        "paid_at": now_utc(),
        "idempotency_key": uuid.uuid4().hex,
        "status_history": [],
        "created_at": now_utc(),
    }
    doc["_id"] = (await db["bookings"].insert_one(doc)).inserted_id
    for d in doc["night_dates"]:
        await db["inventory"].update_one(
            {"room_type_id": listing["room"]["_id"], "date": d},
            {
                "$setOnInsert": {
                    "resort_id": listing["resort"]["_id"],
                    "total_units": listing["room"]["total_units"],
                    "blocked_units": 0,
                    "version": 0,
                },
                "$inc": {"reserved_units": 1},
            },
            upsert=True,
        )
    return doc


async def test_guest_contact_is_only_visible_near_the_stay(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    customer = await make_user(db)
    soon = await make_booking(db, listing, customer, start=10)
    later = await make_booking(db, listing, customer, start=120)

    near = (
        await client.get(f"{API}/owner/bookings/{soon['_id']}", headers=auth_headers(owner))
    ).json()
    far = (
        await client.get(f"{API}/owner/bookings/{later['_id']}", headers=auth_headers(owner))
    ).json()

    assert near["guest_details"]["phone"] == "+919876543210"
    assert far["guest_details"]["phone"] is None and far["guest_details"]["name"] == "Asha Rao"
    assert "payment" not in near and "coupon" not in near


async def test_owner_confirms_or_declines_requests(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    customer = await make_user(db)
    a = await make_booking(db, listing, customer, status="pending_owner", mode="request")
    b = await make_booking(db, listing, customer, status="pending_owner", mode="request", start=20)
    h = auth_headers(owner)

    confirmed = (await client.post(f"{API}/owner/bookings/{a['_id']}/confirm", headers=h)).json()
    declined = (
        await client.post(
            f"{API}/owner/bookings/{b['_id']}/reject",
            headers=h,
            json={"reason": "Closed for repairs"},
        )
    ).json()
    again = await client.post(f"{API}/owner/bookings/{a['_id']}/confirm", headers=h)

    assert confirmed["status"] == "confirmed"
    assert declined["status"] == "rejected" and declined["cancellation"]["refund_pct"] == 100
    assert again.status_code == 400
    inv = await db["inventory"].find_one({"room_type_id": listing["room"]["_id"], "date": day(20)})
    assert inv["reserved_units"] == 0  # declined booking's rooms went back on sale


async def test_owner_cancellation_refunds_in_full_and_is_audited(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    booking = await make_booking(db, listing, await make_user(db))  # policy says 0% for guests

    cancelled = (
        await client.post(
            f"{API}/owner/bookings/{booking['_id']}/cancel",
            headers=auth_headers(owner),
            json={"reason": "Flooding on the access road"},
        )
    ).json()

    assert cancelled["status"] == "cancelled"
    assert cancelled["cancellation"]["refund_paise"] == 1070000
    assert await db["audit_logs"].find_one(
        {"action": "booking.cancel", "target_id": booking["_id"]}
    )


async def test_no_show_only_from_check_in(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner)
    booking = await make_booking(db, listing, await make_user(db))
    response = await client.post(
        f"{API}/owner/bookings/{booking['_id']}/no-show", headers=auth_headers(owner)
    )
    assert response.status_code == 400


async def test_dashboard_summarises_the_owners_business(client, db):
    owner = await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=owner, units=2)
    await make_booking(db, listing, await make_user(db), start=3, nights=2)
    await db["enquiries"].insert_one(
        {
            "owner_id": owner["_id"],
            "resort_id": listing["resort"]["_id"],
            "status": "open",
            "message": "hi",
            "created_at": now_utc(),
        }
    )

    data = (await client.get(f"{API}/owner/dashboard", headers=auth_headers(owner))).json()

    assert data["resorts_by_status"] == {"published": 1}
    assert len(data["upcoming_arrivals"]) == 1
    assert data["room_nights_sold_next_30_days"] == 2
    assert data["occupancy_next_30_days_pct"] == round(100 * 2 / 60, 1)
    assert data["open_enquiries"] == 1


# ---------- uploads ----------


async def test_image_upload_checks_content_not_filename(client, db):
    owner = await make_user(db, role=Role.OWNER)

    ok = await upload(client, owner)
    fake = await client.post(
        f"{API}/uploads/images",
        headers=auth_headers(owner),
        files={"file": ("x.jpg", b"<script>alert(1)</script>", "image/jpeg")},
        data={"alt": "sneaky"},
    )
    huge = await upload(client, owner, data=PNG + b"\x00" * (5 * 1024 * 1024))
    customer = await upload(client, await make_user(db))
    served = await client.get(ok.json()["src"])

    assert ok.status_code == 201 and ok.json()["src"].startswith("/api/v1/media/owners/")
    assert fake.status_code == 400 and fake.json()["error"]["code"] == "IMAGE_TYPE_NOT_ALLOWED"
    assert huge.status_code == 400 and huge.json()["error"]["code"] == "IMAGE_TOO_LARGE"
    assert customer.status_code == 403
    assert served.status_code == 200 and served.content == PNG


async def test_enquiries_are_private_to_the_owner(client, db):
    alice, bob = await make_user(db, role=Role.OWNER), await make_user(db, role=Role.OWNER)
    listing = await make_listing(db, owner=alice)
    enquiry = await db["enquiries"].insert_one(
        {
            "owner_id": alice["_id"],
            "resort_id": listing["resort"]["_id"],
            "status": "open",
            "message": "Is breakfast vegetarian?",
            "created_at": now_utc(),
        }
    )

    mine = (await client.get(f"{API}/owner/enquiries", headers=auth_headers(alice))).json()
    theirs = (await client.get(f"{API}/owner/enquiries", headers=auth_headers(bob))).json()
    closed = await client.patch(
        f"{API}/owner/enquiries/{enquiry.inserted_id}",
        headers=auth_headers(alice),
        json={"status": "closed"},
    )
    bob_close = await client.patch(
        f"{API}/owner/enquiries/{enquiry.inserted_id}",
        headers=auth_headers(bob),
        json={"status": "closed"},
    )

    assert len(mine) == 1 and mine[0]["resort_name"] == listing["resort"]["name"]
    assert theirs == []
    assert closed.json()["status"] == "closed" and bob_close.status_code == 404
