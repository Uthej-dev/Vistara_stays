"""Platform-wide settings (single document `platform_settings/_id=global`), editable by admins."""

from pymongo.asynchronous.database import AsyncDatabase

# Hotel accommodation GST as revised in September 2025: 5% when the room value per night is
# ≤ ₹7,500, 18% above. Tax law changes — admins can edit these, and they must be verified with a
# tax professional before any real use.
DEFAULT_SETTINGS = {
    "tax_slabs": [
        {"up_to_paise_per_night": 750000, "rate_pct": 5},
        {"up_to_paise_per_night": None, "rate_pct": 18},
    ],
    "service_fee_pct": 2,
    "hold_minutes": 15,
    "max_advance_days": 365,
    "max_nights": 30,
    "max_rooms_per_booking": 5,
    "owner_confirmation_hours": 24,
}


async def get_platform_settings(db: AsyncDatabase) -> dict:
    doc = await db["platform_settings"].find_one({"_id": "global"}) or {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in doc.items() if k != "_id"}}


async def ensure_platform_settings(db: AsyncDatabase) -> None:
    await db["platform_settings"].update_one(
        {"_id": "global"}, {"$setOnInsert": DEFAULT_SETTINGS}, upsert=True
    )
