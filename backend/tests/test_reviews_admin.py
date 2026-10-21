"""Phase 9: review eligibility & aggregates, reporting, owner replies, admin moderation & tools."""

import uuid
from datetime import timedelta

import pytest

from app.models.enums import Role
from app.utils.dates import iso, now_utc, today_ist
from tests.factories import auth_headers, make_listing, make_user, unique

pytestmark = pytest.mark.db
API = "/api/v1"


def day(n: int) -> str:
    return iso(today_ist() + timedelta(days=n))


async def stay(db, listing, customer, *, status="completed", start=-10, nights=2):
    doc = {
        "booking_ref": f"VS-{uuid.uuid4().hex[:6].upper()}",
        "user_id": customer["_id"],
        "owner_id": listing["owner"]["_id"],
        "resort_id": listing["resort"]["_id"],
        "room_type_id": listing["room"]["_id"],
        "check_in": day(start),
        "check_out": day(start + nights),
        "nights": nights,
        "night_dates": [],
        "rooms": 1,
        "guests": {"adults": 2, "children": 0, "child_ages": []},
        "guest_details": {
            "name": customer["name"],
            "email": customer["email"],
            "phone": "+919876543210",
            "age": 30,
            "nationality": "IN",
        },
        "status": status,
        "payment_status": "paid",
        "hold_expires_at": now_utc() + timedelta(minutes=10),
        "inventory_released": False,
        "price": {
            "total_paise": 1000000,
            "service_fee_paise": 0,
            "taxable_paise": 1000000,
            "nights": [],
            "taxes": [],
            "meal_plan": "breakfast",
        },
        "policy_snapshot": {
            "cancellation_policy": {"tiers": [{"days_before_check_in": 0, "refund_pct": 0}]},
            "check_in_time": "14:00",
            "check_out_time": "11:00",
        },
        "resort_snapshot": {"name": "R", "room_type_name": "Garden Room"},
        "payment": {"provider": "simulated", "simulated": True},
        "idempotency_key": uuid.uuid4().hex,
        "status_history": [],
        "created_at": now_utc(),
    }
    doc["_id"] = (await db["bookings"].insert_one(doc)).inserted_id
    return doc


def review_body(booking, **overrides):
    return {
        "booking_id": str(booking["_id"]),
        "rating": 5,
        "body": "Lovely quiet stay with very helpful hosts.",
        **overrides,
    }


async def post_review(client, user, body):
    return await client.post(f"{API}/reviews", json=body, headers=auth_headers(user))


# ---------- eligibility ----------


async def test_guest_can_review_a_completed_stay_once(client, db):
    listing = await make_listing(db)
    guest = await make_user(db, name="Asha Rao")
    booking = await stay(db, listing, guest)

    first = await post_review(client, guest, review_body(booking, sub_ratings={"cleanliness": 4}))
    second = await post_review(client, guest, review_body(booking))
    resort = (await client.get(f"{API}/resorts/{listing['resort']['slug']}")).json()

    assert first.status_code == 201
    assert first.json()["author"] == "Asha R."  # no full surname published
    assert second.status_code == 409 and second.json()["error"]["code"] == "ALREADY_REVIEWED"
    assert (
        resort["rating"]["avg"] == 5
        and resort["rating"]["count"] == 1
        and resort["rating"]["cleanliness"] == 4
    )


async def test_upcoming_stays_and_other_peoples_bookings_cannot_be_reviewed(client, db):
    listing = await make_listing(db)
    guest, stranger = await make_user(db), await make_user(db)
    upcoming = await stay(db, listing, guest, status="confirmed", start=10)
    past = await stay(db, listing, guest)

    early = await post_review(client, guest, review_body(upcoming))
    not_mine = await post_review(client, stranger, review_body(past))
    owner = await post_review(client, listing["owner"], review_body(past))

    assert early.status_code == 403 and early.json()["error"]["code"] == "NOT_ELIGIBLE"
    assert not_mine.status_code == 404
    assert owner.status_code == 403


async def test_stay_that_just_ended_becomes_reviewable(client, db):
    listing = await make_listing(db)
    guest = await make_user(db)
    booking = await stay(
        db, listing, guest, status="confirmed", start=-2, nights=2
    )  # check-out today
    assert (await post_review(client, guest, review_body(booking))).status_code == 201


@pytest.mark.parametrize(
    "change", [{"rating": 6}, {"rating": 0}, {"body": "Too short"}, {"sub_ratings": {"wifi": 5}}]
)
async def test_review_content_is_validated(client, db, change):
    listing = await make_listing(db)
    guest = await make_user(db)
    booking = await stay(db, listing, guest)
    assert (await post_review(client, guest, review_body(booking, **change))).status_code == 422


async def test_editing_is_limited_to_30_days(client, db):
    listing = await make_listing(db)
    guest = await make_user(db)
    review = (await post_review(client, guest, review_body(await stay(db, listing, guest)))).json()
    url = f"{API}/reviews/{review['id']}"

    edited = await client.patch(url, json={"rating": 3}, headers=auth_headers(guest))
    await db["reviews"].update_one(
        {"_id": __import__("bson").ObjectId(review["id"])},
        {"$set": {"created_at": now_utc() - timedelta(days=31)}},
    )
    late = await client.patch(url, json={"rating": 4}, headers=auth_headers(guest))

    assert edited.json()["rating"] == 3
    assert late.status_code == 400


# ---------- listing reviews, histogram, sorting ----------


async def test_resort_reviews_have_histogram_and_sorting(client, db):
    listing = await make_listing(db)
    for rating in (5, 3, 4):
        guest = await make_user(db)
        await post_review(client, guest, review_body(await stay(db, listing, guest), rating=rating))

    data = (
        await client.get(
            f"{API}/resorts/{listing['resort']['_id']}/reviews", params={"sort": "lowest"}
        )
    ).json()

    assert [r["rating"] for r in data["items"]] == [3, 4, 5]
    assert data["histogram"] == {"5": 1, "4": 1, "3": 1, "2": 0, "1": 0}
    assert data["summary"]["avg"] == 4.0 and data["summary"]["count"] == 3


# ---------- reporting & moderation ----------


async def test_reporting_and_moderation_update_the_rating(client, db):
    listing = await make_listing(db)
    author, reporter = await make_user(db), await make_user(db)
    admin = await make_user(db, role=Role.ADMIN)
    good = await make_user(db)
    await post_review(client, good, review_body(await stay(db, listing, good), rating=5))
    bad = (
        await post_review(
            client,
            author,
            review_body(
                await stay(db, listing, author), rating=1, body="This is spam spam spam spam spam."
            ),
        )
    ).json()
    url = f"{API}/reviews/{bad['id']}/report"

    own = await client.post(url, json={"reason": "spam"}, headers=auth_headers(author))
    reported = await client.post(
        url, json={"reason": "spam", "note": "Not a real stay"}, headers=auth_headers(reporter)
    )
    again = await client.post(url, json={"reason": "spam"}, headers=auth_headers(reporter))
    queue = (await client.get(f"{API}/admin/reports", headers=auth_headers(admin))).json()
    no_reason = await client.post(
        f"{API}/admin/reviews/{bad['id']}/hide", json={}, headers=auth_headers(admin)
    )
    hidden = await client.post(
        f"{API}/admin/reviews/{bad['id']}/hide",
        json={"reason": "Spam"},
        headers=auth_headers(admin),
    )
    rating_after_hide = (await client.get(f"{API}/resorts/{listing['resort']['slug']}")).json()[
        "rating"
    ]
    restored = await client.post(
        f"{API}/admin/reviews/{bad['id']}/restore", headers=auth_headers(admin)
    )
    rating_after_restore = (await client.get(f"{API}/resorts/{listing['resort']['slug']}")).json()[
        "rating"
    ]

    assert own.status_code == 400
    assert reported.status_code == 204 and again.status_code == 409
    assert bad["id"] in [r["review"]["id"] for r in queue["items"]]
    assert no_reason.status_code == 400
    assert hidden.json()["status"] == "hidden"
    assert (rating_after_hide["avg"], rating_after_hide["count"]) == (5, 1)  # hidden 1★ excluded
    assert restored.json()["status"] == "published" and rating_after_restore["count"] == 2
    assert (
        await db["audit_logs"].count_documents(
            {"action": {"$in": ["review.hide", "review.restore"]}, "actor_id": admin["_id"]}
        )
        == 2
    )


async def test_owner_replies_only_to_own_resort_reviews(client, db):
    listing = await make_listing(db)
    other_owner = await make_user(db, role=Role.OWNER)
    guest = await make_user(db)
    review = (await post_review(client, guest, review_body(await stay(db, listing, guest)))).json()
    url = f"{API}/owner/reviews/{review['id']}/reply"

    mine = await client.put(
        url, json={"body": "Thank you for staying with us!"}, headers=auth_headers(listing["owner"])
    )
    theirs = await client.put(
        url, json={"body": "Thanks from someone else!"}, headers=auth_headers(other_owner)
    )
    listed = (
        await client.get(f"{API}/owner/reviews", headers=auth_headers(listing["owner"]))
    ).json()

    assert mine.json()["owner_reply"]["body"] == "Thank you for staying with us!"
    assert theirs.status_code == 404
    assert listed["total"] == 1


# ---------- admin tools ----------


@pytest.mark.parametrize(
    "path",
    [
        "/admin/metrics",
        "/admin/users",
        "/admin/bookings",
        "/admin/reviews",
        "/admin/settings",
        "/admin/audit-logs",
        "/admin/coupons",
    ],
)
async def test_admin_routes_are_admin_only(client, db, path):
    for role in (Role.CUSTOMER, Role.OWNER):
        user = await make_user(db, role=role)
        assert (await client.get(f"{API}{path}", headers=auth_headers(user))).status_code == 403


async def test_metrics_shape(client, db):
    admin = await make_user(db, role=Role.ADMIN)
    data = (await client.get(f"{API}/admin/metrics", headers=auth_headers(admin))).json()
    assert {
        "users_by_role",
        "bookings_by_status",
        "gross_booking_value_paise",
        "pending_approvals",
        "open_reports",
    } <= set(data)


async def test_suspending_a_user_signs_them_out_everywhere(client, db):
    admin = await make_user(db, role=Role.ADMIN)
    user = await make_user(db, name=unique("Findme"))
    other_admin = await make_user(db, role=Role.ADMIN)
    token = auth_headers(user)

    found = (
        await client.get(
            f"{API}/admin/users", params={"q": user["name"]}, headers=auth_headers(admin)
        )
    ).json()
    no_reason = await client.post(
        f"{API}/admin/users/{user['_id']}/suspend", json={}, headers=auth_headers(admin)
    )
    suspended = await client.post(
        f"{API}/admin/users/{user['_id']}/suspend",
        json={"reason": "Fraudulent bookings"},
        headers=auth_headers(admin),
    )
    after = await client.get(f"{API}/users/me", headers=token)
    self_suspend = await client.post(
        f"{API}/admin/users/{admin['_id']}/suspend",
        json={"reason": "oops oops"},
        headers=auth_headers(admin),
    )
    admin_suspend = await client.post(
        f"{API}/admin/users/{other_admin['_id']}/suspend",
        json={"reason": "nope nope"},
        headers=auth_headers(admin),
    )
    back = await client.post(
        f"{API}/admin/users/{user['_id']}/reactivate", headers=auth_headers(admin)
    )

    assert found["total"] == 1 and "password_hash" not in found["items"][0]
    assert no_reason.status_code == 400
    assert suspended.json()["status"] == "suspended"
    assert after.status_code == 401  # token_version bumped → old token is dead
    assert self_suspend.status_code == admin_suspend.status_code == 400
    assert back.json()["status"] == "active"
    assert await db["audit_logs"].find_one(
        {"action": "user.suspend", "target_id": user["_id"], "reason": "Fraudulent bookings"}
    )


async def test_admin_cancels_with_full_refund(client, db):
    admin = await make_user(db, role=Role.ADMIN)
    listing = await make_listing(db)
    booking = await stay(db, listing, await make_user(db), status="confirmed", start=5)

    found = (
        await client.get(
            f"{API}/admin/bookings",
            params={"q": booking["booking_ref"][3:]},
            headers=auth_headers(admin),
        )
    ).json()
    cancelled = (
        await client.post(
            f"{API}/admin/bookings/{booking['_id']}/cancel",
            json={"reason": "Property closed by authorities"},
            headers=auth_headers(admin),
        )
    ).json()

    assert found["total"] == 1
    assert (
        cancelled["status"] == "cancelled" and cancelled["cancellation"]["refund_paise"] == 1000000
    )


async def test_admin_adds_destinations_without_code_changes(client, db):
    admin = await make_user(db, role=Role.ADMIN)
    slug = unique("dest")
    body = {
        "slug": slug,
        "name": "Agumbe",
        "state": "karnataka",
        "district": "Shivamogga",
        "types": ["forest"],
        "best_months": [10, 11, 12],
        "summary": "Rainforest village in the Western Ghats.",
        "lat": 13.5,
        "lng": 75.09,
    }

    created = await client.post(f"{API}/admin/destinations", json=body, headers=auth_headers(admin))
    duplicate = await client.post(
        f"{API}/admin/destinations", json=body, headers=auth_headers(admin)
    )
    public = await client.get(f"{API}/destinations/{slug}")
    hidden = await client.patch(
        f"{API}/admin/destinations/{created.json()['id']}",
        json={"is_active": False},
        headers=auth_headers(admin),
    )
    gone = await client.get(f"{API}/destinations/{slug}")

    assert created.status_code == 201 and duplicate.status_code == 409
    assert public.status_code == 200 and public.json()["name"] == "Agumbe"
    assert hidden.status_code == 200 and gone.status_code == 404


async def test_coupon_management(client, db):
    admin = await make_user(db, role=Role.ADMIN)
    code = unique("SAVE").upper().replace("-", "")[:12]
    ok = await client.post(
        f"{API}/admin/coupons",
        json={"code": code, "type": "percent", "value": 10},
        headers=auth_headers(admin),
    )
    dup = await client.post(
        f"{API}/admin/coupons",
        json={"code": code, "type": "percent", "value": 10},
        headers=auth_headers(admin),
    )
    greedy = await client.post(
        f"{API}/admin/coupons",
        json={"code": code + "X", "type": "percent", "value": 95},
        headers=auth_headers(admin),
    )
    assert ok.status_code == 201 and dup.status_code == 409 and greedy.status_code == 422


async def test_tax_settings_change_new_quotes_and_are_audited(client, db):
    admin = await make_user(db, role=Role.ADMIN)
    listing = await make_listing(db)
    bad = await client.patch(
        f"{API}/admin/settings",
        json={
            "tax_slabs": [
                {"up_to_paise_per_night": None, "rate_pct": 5},
                {"up_to_paise_per_night": 100, "rate_pct": 18},
            ]
        },
        headers=auth_headers(admin),
    )
    try:
        changed = await client.patch(
            f"{API}/admin/settings",
            json={"tax_slabs": [{"up_to_paise_per_night": None, "rate_pct": 12}]},
            headers=auth_headers(admin),
        )
        quote = (
            await client.post(
                f"{API}/bookings/quote",
                json={
                    "room_type_id": str(listing["room"]["_id"]),
                    "check_in": day(30),
                    "check_out": day(31),
                    "rooms": 1,
                    "adults": 2,
                    "children": 0,
                    "child_ages": [],
                },
            )
        ).json()
        assert bad.status_code == 422
        assert changed.json()["tax_slabs"] == [{"up_to_paise_per_night": None, "rate_pct": 12.0}]
        assert quote["price"]["taxes"][0]["rate_pct"] == 12
        log = await db["audit_logs"].find_one({"action": "settings.update"}, sort=[("_id", -1)])
        assert log["before"]["tax_slabs"][0]["rate_pct"] == 5
    finally:
        await db["platform_settings"].delete_one(
            {"_id": "global"}
        )  # back to defaults for other tests


async def test_audit_log_uses_keyset_pagination(client, db):
    admin = await make_user(db, role=Role.ADMIN)
    for _ in range(3):
        await db["audit_logs"].insert_one(
            {"action": "test.event", "at": now_utc(), "target_id": "x"}
        )
    first = (
        await client.get(
            f"{API}/admin/audit-logs", params={"action": "test.event"}, headers=auth_headers(admin)
        )
    ).json()
    ids = [item["id"] for item in first["items"]]
    assert len(ids) >= 3 and ids == sorted(ids, reverse=True)  # newest first
    older = (
        await client.get(
            f"{API}/admin/audit-logs",
            params={"action": "test.event", "before": ids[0]},
            headers=auth_headers(admin),
        )
    ).json()
    assert [item["id"] for item in older["items"]] == ids[1:]
