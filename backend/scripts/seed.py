"""Seed development data: destinations, categories, sample owners/customers, fictional resorts.

Usage (from backend/, venv active):
    python -m scripts.seed            # idempotent: safe to run again (upserts by slug/email)
    python -m scripts.seed --reset    # first deletes SAMPLE data only (refused in production)

All resorts, owners and customers created here are fictional and marked `is_sample: true`.
Destinations and categories are real reference data and are never deleted by --reset.
Sample account password: SEED_PASSWORD env var (default below — development only).
"""

import argparse
import asyncio
import json
import os
import random
from pathlib import Path

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.indexes import ensure_indexes
from app.db.mongodb import create_client, get_database, ping
from app.models.enums import ResortStatus, Role, RoomTypeStatus, UserStatus
from app.services.platform_settings import ensure_platform_settings
from app.utils.dates import now_utc
from app.utils.geo import geo_point, haversine_km
from scripts.seed_data.attractions import ATTRACTIONS
from scripts.seed_data.destinations import CATEGORIES, DESTINATIONS
from scripts.seed_data.resorts import RESORTS, ROOM_TEMPLATES, SAMPLE_OWNERS

DEFAULT_SEED_PASSWORD = "Vistara#Demo2026"
NOT_FEATURED = 1000
FEATURED_RESORTS = [
    "misty-fern-estate-coorg",
    "teafold-hill-cottages-munnar",
    "kayal-drift-villas-kumarakom",
    "laterite-cliff-retreat-varkala",
    "banyan-trail-camp-kabini",
    "nilgiri-pine-lodge-ooty",
    "shoreline-sands-gokarna",
    "coffee-ridge-homestay-araku",
]
IMAGES = json.loads((Path(__file__).parent / "seed_data" / "destination_images.json").read_text())

CANCELLATION_POLICIES = [
    {
        "code": "flexible",
        "description": "Full refund up to 7 days before check-in; 50% up to 2 days before.",
        "tiers": [
            {"days_before_check_in": 7, "refund_pct": 100},
            {"days_before_check_in": 2, "refund_pct": 50},
            {"days_before_check_in": 0, "refund_pct": 0},
        ],
    },
    {
        "code": "moderate",
        "description": "Full refund up to 14 days before check-in; 50% up to 5 days before.",
        "tiers": [
            {"days_before_check_in": 14, "refund_pct": 100},
            {"days_before_check_in": 5, "refund_pct": 50},
            {"days_before_check_in": 0, "refund_pct": 0},
        ],
    },
    {
        "code": "strict",
        "description": "50% refund up to 21 days before check-in; no refund after.",
        "tiers": [
            {"days_before_check_in": 21, "refund_pct": 50},
            {"days_before_check_in": 0, "refund_pct": 0},
        ],
    },
]

TYPE_WORDS = {
    "cottage": "cottage stay",
    "villa": "villa retreat",
    "tent": "tented camp",
    "homestay": "family-run homestay",
    "treehouse": "treehouse retreat",
    "houseboat": "houseboat stay",
    "resort": "resort",
    "boutique_hotel": "boutique hotel",
}
AMENITY_HIGHLIGHTS = {
    "pool": "Outdoor swimming pool",
    "spa": "Spa treatments on request",
    "ayurveda": "Ayurveda therapies",
    "campfire": "Evening campfires",
    "kids_play_area": "Play area for children",
    "pet_friendly": "Pets welcome",
    "restaurant": "On-site kitchen serving regional food",
    "airport_transfer": "Airport transfers on request",
    "wheelchair_access": "Step-free access to common areas",
}


def image_for(slug: str, purpose: str) -> dict:
    img = IMAGES[slug]
    return {**img, "alt": f"{img['alt']} ({purpose})"}


async def upsert(col, key: dict, doc: dict) -> dict:
    now = now_utc()
    return await col.find_one_and_update(
        key,
        {"$set": {**doc, "updated_at": now}, "$setOnInsert": {"created_at": now}},
        upsert=True,
        return_document=True,
    )


async def seed_reference_data(db) -> dict:
    for i, (kind, slug, name, icon, blurb) in enumerate(CATEGORIES):
        await upsert(
            db["categories"],
            {"slug": slug},
            {
                "kind": kind,
                "name": name,
                "icon": icon,
                "blurb": blurb,
                "sort_order": i,
                "is_active": True,
            },
        )
    destinations = {}
    for d in DESTINATIONS:
        doc = {k: v for k, v in d.items() if k not in ("lat", "lng")}
        doc.update(
            {
                "location": geo_point(d["lat"], d["lng"]),
                "image": IMAGES[d["slug"]],
                "is_active": True,
                "featured_rank": d.get("featured_rank", NOT_FEATURED),
            }
        )
        destinations[d["slug"]] = await upsert(db["destinations"], {"slug": d["slug"]}, doc)
    await ensure_platform_settings(db)
    return destinations


async def seed_users(db, password_hash: str) -> list[dict]:
    owners = []
    for o in SAMPLE_OWNERS:
        owners.append(
            await upsert(
                db["users"],
                {"email": o["email"]},
                {
                    "name": o["name"],
                    "role": Role.OWNER,
                    "status": UserStatus.ACTIVE,
                    "email_verified": True,
                    "password_hash": password_hash,
                    "token_version": 0,
                    "is_sample": True,
                    "owner_profile": {"business_name": o["business_name"]},
                },
            )
        )
    await upsert(
        db["users"],
        {"email": "demo.customer@example.com"},
        {
            "name": "Demo Customer",
            "role": Role.CUSTOMER,
            "status": UserStatus.ACTIVE,
            "email_verified": True,
            "password_hash": password_hash,
            "token_version": 0,
            "is_sample": True,
            "phone": "+919000000001",
        },
    )
    return owners


def build_resort(
    spec: dict, i: int, destination: dict, owner: dict, all_destinations: dict
) -> dict:
    rng = random.Random(spec["slug"])  # deterministic per resort, so reruns don't move things
    lng, lat = destination["location"]["coordinates"]
    r_lat, r_lng = lat + rng.uniform(-0.04, 0.04), lng + rng.uniform(-0.04, 0.04)
    # Gallery: this destination's photo plus two from destinations with a shared type.
    related = [
        s
        for s, d in all_destinations.items()
        if s != destination["slug"] and set(d["types"]) & set(destination["types"])
    ]
    rng.shuffle(related)
    gallery = [destination["slug"], *related[:2]]
    type_word = TYPE_WORDS[spec["property_type"]]
    highlights = [AMENITY_HIGHLIGHTS[a] for a in spec["amenities"] if a in AMENITY_HIGHLIGHTS][:4]
    return {
        "name": spec["name"],
        "status": ResortStatus.PUBLISHED,
        "is_sample": True,
        "owner_id": owner["_id"],
        "manager_ids": [],
        "destination_id": destination["_id"],
        "destination_slug": destination["slug"],
        "destination_name": destination["name"],
        "state": destination["state"],
        "property_type": spec["property_type"],
        "categories": spec["categories"],
        "amenities": spec["amenities"],
        "surroundings": spec["surroundings"],
        "description": (
            f"{spec['name']} is a fictional {type_word} near {destination['name']}, created as "
            f"sample data for this demo — it is not a real business. {destination['summary']} "
            "Photos show the destination, not the property."
        ),
        "highlights": highlights or ["Quiet setting away from main roads"],
        "images": [
            image_for(s, "illustrative destination photo, not the property") for s in gallery
        ],
        "address": {
            "line1": "Sample property — no real street address",
            "town": destination["name"],
            "district": destination["district"],
            "state": destination["state"],
            "pincode": None,
        },
        "location": geo_point(round(r_lat, 5), round(r_lng, 5)),
        "distance_from_centre_km": haversine_km(lat, lng, r_lat, r_lng),
        "policies": {
            "check_in_time": "14:00",
            "check_out_time": "11:00",
            "cancellation_policy": CANCELLATION_POLICIES[i % len(CANCELLATION_POLICIES)],
            "child_free_age": 5,
            "pets_allowed": "pet_friendly" in spec["amenities"],
            "smoking_allowed": False,
            "house_rules": [
                "Quiet hours 10 pm – 7 am",
                "Valid photo ID required at check-in for all adults",
            ],
            "accessibility": ["Step-free access to common areas"]
            if "wheelchair_access" in spec["amenities"]
            else [],
            "id_required": True,
            "meals_note": None,
        },
        "nearby_attractions": [
            {"name": n, "distance_km": None, "note": None} for n in ATTRACTIONS[destination["slug"]]
        ],
        "contact": {"email": owner["email"], "phone": None},
        "booking_mode": spec["booking_mode"],
        "featured_rank": FEATURED_RESORTS.index(spec["slug"]) + 1
        if spec["slug"] in FEATURED_RESORTS
        else NOT_FEATURED,
        "rejection_reason": None,
        "published_at": now_utc(),
    }


def build_room_types(spec: dict, resort: dict) -> list[dict]:
    rooms = []
    for name, max_a, max_c, base_occ, mult, units, beds, sqft in ROOM_TEMPLATES[
        spec["property_type"]
    ]:
        base = int(round(spec["base_rate_paise"] * mult, -4))  # round to ₹100
        rooms.append(
            {
                "resort_id": resort["_id"],
                "owner_id": resort["owner_id"],
                "name": name,
                "description": f"{name} with {', '.join(f'{c} {t.replace("_", " ")}' for t, c in beds)} bed(s).",
                "max_adults": max_a,
                "max_children": max_c,
                "max_occupancy": max_a + max_c,
                "base_occupancy": base_occ,
                "beds": [{"type": t, "count": c} for t, c in beds],
                "size_sqft": sqft,
                "amenities": [],
                "images": [],
                "total_units": units,
                "base_rate_paise": base,
                "weekend_rate_paise": int(round(base * 1.15, -4)),
                "extra_adult_paise": 120000,
                "extra_child_paise": 60000,
                "meal_plan": spec["meal_plan"],
                "status": RoomTypeStatus.ACTIVE,
                "is_sample": True,
            }
        )
    return rooms


async def seed_resorts(db, owners: list[dict], destinations: dict) -> int:
    for i, spec in enumerate(RESORTS):
        destination = destinations[spec["destination"]]
        owner = owners[i % len(owners)]
        doc = build_resort(spec, i, destination, owner, destinations)
        resort = await upsert(db["resorts"], {"slug": spec["slug"]}, doc)
        # Keep existing ratings (derived from reviews) when re-running the seed.
        if "rating" not in resort:
            await db["resorts"].update_one(
                {"_id": resort["_id"]}, {"$set": {"rating": {"avg": 0, "count": 0}}}
            )
        rooms = build_room_types(spec, resort)
        for room in rooms:
            await upsert(db["room_types"], {"resort_id": resort["_id"], "name": room["name"]}, room)
        cheapest = min(rooms, key=lambda r: r["base_rate_paise"])
        await db["resorts"].update_one(
            {"_id": resort["_id"]},
            {
                "$set": {
                    "starting_price_paise": cheapest["base_rate_paise"],
                    "meal_plan": cheapest["meal_plan"],
                }
            },
        )
    return len(RESORTS)


async def reset_samples(db) -> None:
    sample_resort_ids = await db["resorts"].distinct("_id", {"is_sample": True})
    for name in (
        "bookings",
        "reviews",
        "payments",
        "favourites",
        "enquiries",
        "inventory",
        "rate_rules",
        "notifications",
    ):
        await db[name].delete_many(
            {"$or": [{"is_sample": True}, {"resort_id": {"$in": sample_resort_ids}}]}
        )
    await db["room_types"].delete_many({"resort_id": {"$in": sample_resort_ids}})
    await db["resorts"].delete_many({"is_sample": True})
    sample_users = await db["users"].distinct("_id", {"is_sample": True})
    await db["sessions"].delete_many({"user_id": {"$in": sample_users}})
    await db["users"].delete_many({"is_sample": True})


async def main(reset: bool) -> None:
    settings = get_settings()
    if reset and settings.is_production:
        raise SystemExit("Refusing to --reset in production.")
    client = create_client(settings)
    try:
        db = get_database(client, settings)
        await ping(db)
        await ensure_indexes(db)
        if reset:
            await reset_samples(db)
            print("Deleted existing sample data.")
        destinations = await seed_reference_data(db)
        password = os.environ.get("SEED_PASSWORD", DEFAULT_SEED_PASSWORD)
        owners = await seed_users(db, hash_password(password))
        count = await seed_resorts(db, owners, destinations)
        print(
            f"Seeded into '{settings.mongodb_db}': {len(destinations)} destinations, "
            f"{len(CATEGORIES)} categories, {len(owners)} sample owners, 1 demo customer, "
            f"{count} fictional resorts."
        )
        print(
            f"Sample logins (password: {'SEED_PASSWORD' if 'SEED_PASSWORD' in os.environ else DEFAULT_SEED_PASSWORD}): "
            "demo.customer@example.com, " + ", ".join(o["email"] for o in SAMPLE_OWNERS)
        )
    finally:
        await client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--reset", action="store_true", help="delete sample data first")
    asyncio.run(main(parser.parse_args().reset))
