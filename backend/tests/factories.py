"""Helpers that insert test data directly into MongoDB, so each test can set up exactly the
scenario it needs (a user with a role, a resort owned by someone, a room with N units...)."""

import uuid

from bson import ObjectId

from app.core.security import create_access_token, hash_password
from app.models.enums import ResortStatus, Role, RoomTypeStatus, UserStatus
from app.utils.dates import now_utc
from app.utils.geo import geo_point

PASSWORD = "Correct-Horse-42"
_PASSWORD_HASH = hash_password(PASSWORD)  # hashing is slow on purpose; do it once


def unique(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


async def make_user(db, role: Role = Role.CUSTOMER, **overrides) -> dict:
    doc = {
        "email": f"{unique(role)}@example.test",
        "name": "Test User",
        "role": role,
        "status": UserStatus.ACTIVE,
        "email_verified": True,
        "password_hash": _PASSWORD_HASH,
        "token_version": 0,
        "phone": "+919876543210",
        "created_at": now_utc(),
        **overrides,
    }
    doc["_id"] = (await db["users"].insert_one(doc)).inserted_id
    return doc


def auth_headers(user: dict, secret: str = "test-secret-not-for-production") -> dict:
    token, _ = create_access_token(
        user_id=str(user["_id"]),
        role=user["role"],
        token_version=user.get("token_version", 0),
        secret=secret,
        ttl_minutes=15,
    )
    return {"Authorization": f"Bearer {token}"}


async def make_destination(db, **overrides) -> dict:
    slug = overrides.pop("slug", unique("dest"))
    doc = {
        "slug": slug,
        "name": slug.title(),
        "state": "kerala",
        "district": "Test District",
        "region": "Test Region",
        "types": ["hill_station"],
        "best_months": [1, 2],
        "summary": "A test destination.",
        "location": geo_point(10.0, 77.0),
        "is_active": True,
        "featured_rank": 1000,
        **overrides,
    }
    doc["_id"] = (await db["destinations"].insert_one(doc)).inserted_id
    return doc


CANCELLATION = {
    "code": "flexible",
    "tiers": [
        {"days_before_check_in": 7, "refund_pct": 100},
        {"days_before_check_in": 2, "refund_pct": 50},
        {"days_before_check_in": 0, "refund_pct": 0},
    ],
}


async def make_resort(db, owner: dict, destination: dict, **overrides) -> dict:
    slug = overrides.pop("slug", unique("resort"))
    doc = {
        "name": f"Resort {slug}",
        "slug": slug,
        "status": ResortStatus.PUBLISHED,
        "is_sample": False,
        "owner_id": owner["_id"],
        "manager_ids": [],
        "destination_id": destination["_id"],
        "destination_slug": destination["slug"],
        "destination_name": destination["name"],
        "state": destination["state"],
        "property_type": "resort",
        "categories": ["mountain_retreat"],
        "amenities": ["wifi"],
        "surroundings": ["mountain"],
        "description": "A test resort used by automated tests.",
        "highlights": [],
        "images": [{"src": "https://example.test/a.jpg", "alt": "a"} for _ in range(3)],
        "address": {
            "line1": "1 Secret Lane",
            "town": "Town",
            "district": "D",
            "state": destination["state"],
            "pincode": "600001",
        },
        "location": geo_point(10.01, 77.01),
        "distance_from_centre_km": 1.5,
        "policies": {
            "check_in_time": "14:00",
            "check_out_time": "11:00",
            "cancellation_policy": CANCELLATION,
            "child_free_age": 5,
            "pets_allowed": False,
            "smoking_allowed": False,
            "house_rules": [],
            "accessibility": [],
            "id_required": True,
        },
        "nearby_attractions": [],
        "contact": {"email": owner["email"], "phone": None},
        "booking_mode": "instant",
        "starting_price_paise": 500000,
        "meal_plan": "breakfast",
        "rating": {"avg": 0, "count": 0},
        "featured_rank": 1000,
        "created_at": now_utc(),
        "updated_at": now_utc(),
        **overrides,
    }
    doc["_id"] = (await db["resorts"].insert_one(doc)).inserted_id
    return doc


async def make_room_type(db, resort: dict, **overrides) -> dict:
    doc = {
        "resort_id": resort["_id"],
        "owner_id": resort["owner_id"],
        "name": unique("Room"),
        "description": "Test room",
        "max_adults": 2,
        "max_children": 1,
        "max_occupancy": 3,
        "base_occupancy": 2,
        "beds": [{"type": "king", "count": 1}],
        "size_sqft": 300,
        "amenities": [],
        "images": [],
        "total_units": 3,
        "base_rate_paise": 500000,
        "weekend_rate_paise": 600000,
        "extra_adult_paise": 100000,
        "extra_child_paise": 50000,
        "meal_plan": "breakfast",
        "status": RoomTypeStatus.ACTIVE,
        "created_at": now_utc(),
        **overrides,
    }
    doc["_id"] = (await db["room_types"].insert_one(doc)).inserted_id
    return doc


async def make_listing(db, *, units=3, owner=None, **resort_overrides):
    """Owner + destination + published resort + one room type, in one call."""
    owner = owner or await make_user(db, Role.OWNER)
    destination = await make_destination(db)
    resort = await make_resort(db, owner, destination, **resort_overrides)
    room = await make_room_type(db, resort, total_units=units)
    return {"owner": owner, "destination": destination, "resort": resort, "room": room}


def oid() -> ObjectId:
    return ObjectId()
