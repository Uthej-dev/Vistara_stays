"""Phase 4: destinations, categories, resort search/filter/sort/pagination, resort details."""

import pytest

from scripts import seed
from tests.factories import make_listing

pytestmark = pytest.mark.db


@pytest.fixture
async def seeded(db):
    """Load the real seed data once per test database (read-only tests share it)."""
    if await db["resorts"].count_documents({"is_sample": True}) == 0:
        destinations = await seed.seed_reference_data(db)
        owners = await seed.seed_users(db, "not-used-in-these-tests")
        await seed.seed_resorts(db, owners, destinations)
    return db


async def get(client, url, **params):
    response = await client.get(f"/api/v1{url}", params=params)
    return response.status_code, response.json()


# ---------- destinations & categories ----------


async def test_lists_all_destinations_and_filters_by_state(client, seeded):
    status, all_dest = await get(client, "/destinations")
    _, telangana = await get(client, "/destinations", state="telangana")

    assert status == 200
    assert len([d for d in all_dest if d["slug"] in {x["slug"] for x in seed.DESTINATIONS}]) == 25
    assert {d["name"] for d in telangana} >= {"Ananthagiri Hills", "Laknavaram", "Nagarjuna Sagar"}
    assert all(d["state"] == "telangana" for d in telangana)


async def test_featured_destinations_are_ranked(client, seeded):
    _, featured = await get(client, "/destinations", featured="true")

    assert [d["slug"] for d in featured][:3] == ["coorg", "munnar", "alleppey"]
    assert all(d["featured_rank"] < 1000 for d in featured)


async def test_destination_detail_includes_resort_stats(client, seeded):
    status, coorg = await get(client, "/destinations/coorg")

    assert status == 200
    assert coorg["resort_count"] == 2
    assert coorg["starting_price_paise"] == 640000
    assert coorg["location"] == {"lat": 12.4244, "lng": 75.7382}
    assert coorg["image"]["credit"]["license"]


async def test_unknown_destination_is_404(client, seeded):
    status, body = await get(client, "/destinations/atlantis")
    assert status == 404
    assert body["error"]["code"] == "NOT_FOUND"


async def test_categories_filter_by_kind(client, seeded):
    _, amenities = await get(client, "/categories", kind="amenity")
    assert {"wifi", "pool", "spa", "pet_friendly"} <= {a["slug"] for a in amenities}
    assert all(a["kind"] == "amenity" for a in amenities)


# ---------- search ----------


async def test_search_by_destination(client, seeded):
    _, result = await get(client, "/resorts/search", destination="coorg")

    assert result["total"] == 2
    assert {r["destination"]["slug"] for r in result["items"]} == {"coorg"}
    assert all(
        r["price"]["kind"] == "starting" and r["price"]["taxes_included"] is False
        for r in result["items"]
    )


async def test_search_amenities_must_all_match(client, seeded):
    _, result = await get(client, "/resorts/search", amenity=["pool", "spa"], page_size=50)

    assert result["total"] > 0
    assert all({"pool", "spa"} <= set(r["amenities"]) for r in result["items"])


async def test_search_property_types_are_alternatives(client, seeded):
    _, result = await get(client, "/resorts/search", property_type=["villa", "tent"], page_size=50)

    assert {r["property_type"] for r in result["items"]} == {"villa", "tent"}


@pytest.mark.parametrize("sort,reverse", [("price_asc", False), ("price_desc", True)])
async def test_search_sorts_by_price(client, seeded, sort, reverse):
    _, result = await get(client, "/resorts/search", sort=sort, page_size=50)
    prices = [r["price"]["per_night_paise"] for r in result["items"]]

    assert prices == sorted(prices, reverse=reverse)


async def test_search_price_range_in_rupees(client, seeded):
    _, result = await get(client, "/resorts/search", min_price=4000, max_price=6000, page_size=50)

    assert result["total"] > 0
    assert all(400000 <= r["price"]["per_night_paise"] <= 600000 for r in result["items"])


async def test_search_pagination_is_stable_and_complete(client, seeded):
    _, page1 = await get(client, "/resorts/search", page_size=10, page=1, sort="price_asc")
    _, page2 = await get(client, "/resorts/search", page_size=10, page=2, sort="price_asc")
    _, everything = await get(client, "/resorts/search", page_size=50, sort="price_asc")

    ids1, ids2 = [r["id"] for r in page1["items"]], [r["id"] for r in page2["items"]]
    assert not set(ids1) & set(ids2)
    assert ids1 + ids2 == [r["id"] for r in everything["items"]][:20]
    assert page1["total_pages"] == -(-page1["total"] // 10)


async def test_search_text_is_case_insensitive_and_regex_safe(client, seeded):
    _, mist = await get(client, "/resorts/search", q="MIST")
    _, regex = await get(client, "/resorts/search", q=".*")
    _, by_town = await get(client, "/resorts/search", q="kumarakom")

    assert mist["total"] >= 2
    assert regex["total"] == 0  # '.*' is treated as literal text, not a pattern
    assert by_town["total"] >= 1


async def test_search_distance_filter_needs_destination(client, seeded):
    _, near = await get(client, "/resorts/search", destination="munnar", max_distance_km=100)
    assert all(r["distance_from_centre_km"] <= 100 for r in near["items"])


async def test_search_unknown_destination_returns_empty_not_error(client, seeded):
    status, result = await get(client, "/resorts/search", destination="atlantis")
    assert status == 200 and result["total"] == 0 and result["items"] == []


async def test_search_reports_facets_and_applied_filters(client, seeded):
    _, result = await get(client, "/resorts/search", state="kerala", amenity="pool")

    assert result["applied_filters"] == {"state": "kerala", "amenity": ["pool"]}
    assert result["facets"]["amenities"]["pool"] == result["total"]


@pytest.mark.parametrize(
    "params",
    [
        {"min_rating": 9},
        {"page_size": 500},
        {"check_in": "2026-12-01"},
        {"sort": "cheapest"},
        {"property_type": "castle"},
        {"price_basis": "total"},
    ],
)
async def test_search_rejects_invalid_parameters(client, seeded, params):
    status, body = await get(client, "/resorts/search", **params)
    assert status == 422
    assert body["error"]["code"] == "VALIDATION_ERROR"


async def test_unpublished_resorts_are_invisible(client, db):
    listing = await make_listing(db, status="pending_review", name="Hidden Draft Resort")

    _, result = await get(client, "/resorts/search", q="Hidden Draft Resort")
    status, _ = await get(client, f"/resorts/{listing['resort']['slug']}")

    assert result["total"] == 0
    assert status == 404


# ---------- details ----------


async def test_resort_details_hide_private_fields(client, db):
    listing = await make_listing(db)

    status, detail = await get(client, f"/resorts/{listing['resort']['slug']}")

    assert status == 200
    assert detail["address"] == {
        "town": "Town",
        "district": "D",
        "state": "kerala",
        "pincode": "600001",
    }
    assert "owner_id" not in detail and "contact" not in detail
    room = detail["room_types"][0]
    assert "owner_id" not in room and "resort_id" not in room
    assert detail["is_favourite"] is False


async def test_featured_resorts_come_from_seed_ranking(client, seeded):
    _, featured = await get(client, "/resorts/featured", limit=3)
    assert [r["slug"] for r in featured] == [
        "misty-fern-estate-coorg",
        "teafold-hill-cottages-munnar",
        "kayal-drift-villas-kumarakom",
    ]
    assert all(r["is_sample"] for r in featured)


async def test_sample_owner_accounts_are_marked_sample(db, seeded):
    emails = [o["email"] for o in seed.SAMPLE_OWNERS]
    owners = await db["users"].find({"email": {"$in": emails}}).to_list(10)
    assert len(owners) == 3 and all(o["is_sample"] for o in owners)
