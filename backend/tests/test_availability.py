"""Phase 6: stay validation, availability, quotes, date-aware search, coupons, enquiries."""

from datetime import timedelta

import pytest

from app.utils.dates import iso, today_ist
from tests.factories import make_listing, unique

pytestmark = pytest.mark.db
API = "/api/v1"


def day(offset: int) -> str:
    return iso(today_ist() + timedelta(days=offset))


def stay(room, start=30, nights=2, **overrides):
    return {
        "room_type_id": str(room["_id"]),
        "check_in": day(start),
        "check_out": day(start + nights),
        "rooms": 1,
        "adults": 2,
        "children": 0,
        "child_ages": [],
        **overrides,
    }


async def quote(client, body):
    response = await client.post(f"{API}/bookings/quote", json=body)
    return response.status_code, response.json()


async def test_quote_prices_the_stay_on_the_server(client, db):
    listing = await make_listing(db)
    status, body = await quote(client, stay(listing["room"], nights=3))

    assert status == 200
    assert body["available"] is True and body["available_units"] == 3
    assert body["price"]["nights_count"] == 3
    assert len(body["price"]["nights"]) == 3  # check-out night not charged
    assert body["price"]["total_paise"] == (
        body["price"]["taxable_paise"]
        + body["price"]["tax_total_paise"]
        + body["price"]["service_fee_paise"]
    )


@pytest.mark.parametrize(
    "change,code",
    [
        ({"check_in": "past", "check_out": "today"}, "INVALID_DATES"),
        ({"same_day": True}, "INVALID_DATES"),
        ({"nights": 31}, "INVALID_DATES"),
        ({"start": 400}, "INVALID_DATES"),
        ({"adults": 4}, "OCCUPANCY_EXCEEDED"),
        ({"rooms": 2, "adults": 1}, "OCCUPANCY_EXCEEDED"),
    ],
)
async def test_quote_rejects_invalid_stays(client, db, change, code):
    listing = await make_listing(db)
    body = stay(listing["room"], start=change.pop("start", 30), nights=change.pop("nights", 2))
    if change.pop("same_day", False):
        body["check_out"] = body["check_in"]
    if "check_in" in change:
        body["check_in"], body["check_out"] = day(-1), day(0)
        change = {}
    body.update(change)

    status, response = await quote(client, body)

    assert status == 400
    assert response["error"]["code"] == code


async def test_child_ages_must_match_children(client, db):
    listing = await make_listing(db)
    status, _ = await quote(client, stay(listing["room"], children=2, child_ages=[6]))
    assert status == 422


async def test_unpublished_resort_or_inactive_room_cannot_be_quoted(client, db):
    draft = await make_listing(db, status="draft")
    live = await make_listing(db)
    await db["room_types"].update_one(
        {"_id": live["room"]["_id"]}, {"$set": {"status": "inactive"}}
    )

    assert (await quote(client, stay(draft["room"])))[0] == 404
    assert (await quote(client, stay(live["room"])))[0] == 404


async def test_sold_out_nights_make_the_room_unavailable(client, db):
    listing = await make_listing(db, units=2)
    room = listing["room"]
    await db["inventory"].insert_one(
        {
            "room_type_id": room["_id"],
            "resort_id": room["resort_id"],
            "date": day(31),
            "total_units": 2,
            "reserved_units": 1,
            "blocked_units": 1,
            "version": 0,
        }
    )

    _, body = await quote(client, stay(room, start=30, nights=3))
    availability = (
        await client.get(
            f"{API}/resorts/{listing['resort']['_id']}/availability",
            params={"check_in": day(30), "check_out": day(33)},
        )
    ).json()
    _, other_dates = await quote(client, stay(room, start=40))

    assert body["available"] is False and body["available_units"] == 0
    assert availability["room_types"][0]["bookable"] is False
    assert availability["room_types"][0]["unavailable_reason"] == "Sold out for these dates."
    assert other_dates["available"] is True


async def test_closed_day_blocks_the_whole_stay(client, db):
    listing = await make_listing(db)
    room = listing["room"]
    await db["inventory"].insert_one(
        {
            "room_type_id": room["_id"],
            "resort_id": room["resort_id"],
            "date": day(30),
            "total_units": 3,
            "reserved_units": 0,
            "blocked_units": 0,
            "closed": True,
            "version": 0,
        }
    )
    _, body = await quote(client, stay(room))
    assert body["available"] is False


async def test_date_override_and_seasonal_rule_are_used(client, db):
    listing = await make_listing(db)
    room = listing["room"]
    await db["inventory"].insert_one(
        {
            "room_type_id": room["_id"],
            "resort_id": room["resort_id"],
            "date": day(30),
            "total_units": 3,
            "reserved_units": 0,
            "blocked_units": 0,
            "price_override_paise": 1234500,
            "version": 0,
        }
    )
    await db["rate_rules"].insert_one(
        {
            "room_type_id": room["_id"],
            "owner_id": room["owner_id"],
            "name": "Peak",
            "start_date": day(31),
            "end_date": day(31),
            "adjustment": {"type": "fixed_rate", "value": 777700},
            "priority": 1,
            "is_active": True,
        }
    )
    _, body = await quote(client, stay(room))

    assert [(n["rate_paise"], n["source"]) for n in body["price"]["nights"]] == [
        (1234500, "date_override"),
        (777700, "rule:Peak"),
    ]


async def test_coupons_are_validated_on_the_server(client, db):
    listing = await make_listing(db)
    code = unique("SAVE").upper().replace("-", "")
    await db["coupons"].insert_many(
        [
            {
                "code": code,
                "type": "percent",
                "value": 10,
                "max_discount_paise": 100000,
                "is_active": True,
                "used_count": 0,
            },
            {
                "code": code + "OLD",
                "type": "flat",
                "value": 50000,
                "is_active": True,
                "valid_to": day(-1),
            },
            {
                "code": code + "MIN",
                "type": "flat",
                "value": 50000,
                "is_active": True,
                "min_subtotal_paise": 99999999,
            },
        ]
    )
    room = listing["room"]

    ok_status, ok = await quote(client, stay(room, coupon_code=code.lower()))
    expired_status, expired = await quote(client, stay(room, coupon_code=code + "OLD"))
    _, minimum = await quote(client, stay(room, coupon_code=code + "MIN"))
    _, unknown = await quote(client, stay(room, coupon_code="NOPE"))

    assert (
        ok_status == 200
        and ok["price"]["discount_paise"] == 100000
        and ok["price"]["coupon_code"] == code
    )
    assert expired_status == 400 and expired["error"]["code"] == "COUPON_INVALID"
    assert "minimum" in minimum["error"]["message"]
    assert unknown["error"]["code"] == "COUPON_INVALID"


async def test_quote_ignores_client_supplied_prices(client, db):
    listing = await make_listing(db)
    status, _ = await quote(client, {**stay(listing["room"]), "total_paise": 1})
    assert status == 422  # unknown field rejected — the price only ever comes from the server


# ---------- search with dates ----------


async def test_search_with_dates_shows_real_totals_and_hides_sold_out(client, db):
    town = unique("town")
    open_listing = await make_listing(db, name=f"Open {town}")
    full_listing = await make_listing(db, name=f"Full {town}", units=1)
    full_room = full_listing["room"]
    await db["inventory"].insert_one(
        {
            "room_type_id": full_room["_id"],
            "resort_id": full_room["resort_id"],
            "date": day(30),
            "total_units": 1,
            "reserved_units": 1,
            "blocked_units": 0,
            "version": 0,
        }
    )
    params = {"q": town, "check_in": day(30), "check_out": day(32)}

    available_only = (await client.get(f"{API}/resorts/search", params=params)).json()
    everything = (
        await client.get(f"{API}/resorts/search", params={**params, "available_only": "false"})
    ).json()
    _, direct = await quote(client, stay(open_listing["room"]))

    assert [r["name"] for r in available_only["items"]] == [f"Open {town}"]
    card = available_only["items"][0]
    assert card["price"]["kind"] == "stay" and card["price"]["taxes_included"] is True
    assert card["price"]["total_paise"] == direct["price"]["total_paise"]
    assert available_only["nights"] == 2
    assert {r["name"]: r["available"] for r in everything["items"]} == {
        f"Open {town}": True,
        f"Full {town}": False,
    }


async def test_search_with_dates_filters_by_total_price(client, db):
    town = unique("town")
    await make_listing(db, name=f"Budget {town}")
    params = {"q": town, "check_in": day(30), "check_out": day(32), "price_basis": "total"}

    cheap = (await client.get(f"{API}/resorts/search", params={**params, "max_price": 5000})).json()
    fine = (await client.get(f"{API}/resorts/search", params={**params, "max_price": 50000})).json()

    assert cheap["total"] == 0  # 2 nights at ₹5,000 + tax is more than ₹5,000
    assert fine["total"] == 1


async def test_search_rejects_past_dates(client, db):
    response = await client.get(
        f"{API}/resorts/search", params={"check_in": day(-3), "check_out": day(-1)}
    )
    assert response.status_code == 400


# ---------- enquiries ----------


async def test_enquiry_reaches_the_owner(client, db):
    listing = await make_listing(db)
    response = await client.post(
        f"{API}/resorts/{listing['resort']['_id']}/enquiries",
        json={
            "name": "Meera",
            "email": "meera@example.com",
            "message": "Is the road accessible by car in July?",
        },
    )
    stored = await db["enquiries"].find_one({"resort_id": listing["resort"]["_id"]})

    assert response.status_code == 201
    assert stored["owner_id"] == listing["owner"]["_id"] and stored["status"] == "open"
