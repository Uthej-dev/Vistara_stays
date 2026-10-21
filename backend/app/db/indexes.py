"""All MongoDB indexes, declared in one place (mirrors docs/04-data-model.md).

`ensure_indexes` is idempotent: MongoDB skips an index that already exists with the same
definition, so it is safe to run on every startup and from `scripts/ensure_indexes.py`.
Unique indexes are not just for speed — they are the database-level guarantees the booking
engine relies on (e.g. one inventory counter per room type per night).
"""

from pymongo import ASCENDING as ASC
from pymongo import DESCENDING as DESC
from pymongo import GEOSPHERE, IndexModel
from pymongo.asynchronous.database import AsyncDatabase

INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("email", ASC)], unique=True, name="uniq_email"),
        IndexModel([("role", ASC), ("status", ASC)], name="role_status"),
    ],
    "sessions": [
        IndexModel([("token_hash", ASC)], unique=True, name="uniq_token_hash"),
        IndexModel([("user_id", ASC)], name="user"),
        IndexModel([("family_id", ASC)], name="family"),
        IndexModel([("expires_at", ASC)], expireAfterSeconds=0, name="ttl_expires"),
    ],
    "auth_tokens": [
        IndexModel([("token_hash", ASC)], unique=True, name="uniq_token_hash"),
        IndexModel([("user_id", ASC), ("purpose", ASC)], name="user_purpose"),
        IndexModel([("expires_at", ASC)], expireAfterSeconds=0, name="ttl_expires"),
    ],
    "destinations": [
        IndexModel([("slug", ASC)], unique=True, name="uniq_slug"),
        IndexModel([("state", ASC), ("is_active", ASC)], name="state_active"),
        IndexModel([("location", GEOSPHERE)], name="geo"),
    ],
    "categories": [
        IndexModel([("slug", ASC)], unique=True, name="uniq_slug"),
        IndexModel([("kind", ASC), ("sort_order", ASC)], name="kind_order"),
    ],
    "resorts": [
        IndexModel([("slug", ASC)], unique=True, name="uniq_slug"),
        IndexModel(
            [("status", ASC), ("destination_id", ASC), ("starting_price_paise", ASC)],
            name="search_destination_price",
        ),
        IndexModel(
            [("status", ASC), ("featured_rank", ASC), ("rating.avg", DESC)], name="search_featured"
        ),
        IndexModel([("status", ASC), ("rating.avg", DESC)], name="search_rating"),
        IndexModel([("status", ASC), ("rating.count", DESC)], name="search_reviews"),
        IndexModel([("owner_id", ASC), ("status", ASC)], name="owner_status"),
        IndexModel([("location", GEOSPHERE)], name="geo"),
    ],
    "room_types": [
        IndexModel([("resort_id", ASC), ("status", ASC)], name="resort_status"),
        IndexModel([("owner_id", ASC)], name="owner"),
    ],
    "rate_rules": [
        IndexModel(
            [("room_type_id", ASC), ("start_date", ASC), ("end_date", ASC)], name="room_dates"
        ),
    ],
    "inventory": [
        # THE double-booking guard: exactly one counter document per room type per night.
        IndexModel([("room_type_id", ASC), ("date", ASC)], unique=True, name="uniq_room_night"),
        IndexModel([("resort_id", ASC), ("date", ASC)], name="resort_night"),
    ],
    "bookings": [
        IndexModel([("booking_ref", ASC)], unique=True, name="uniq_ref"),
        # Duplicate submissions with the same Idempotency-Key collapse into one booking.
        IndexModel(
            [("user_id", ASC), ("idempotency_key", ASC)], unique=True, name="uniq_idempotency"
        ),
        IndexModel([("user_id", ASC), ("created_at", DESC)], name="user_recent"),
        IndexModel([("owner_id", ASC), ("check_in", ASC)], name="owner_checkin"),
        IndexModel([("resort_id", ASC), ("check_in", ASC)], name="resort_checkin"),
        IndexModel([("status", ASC), ("hold_expires_at", ASC)], name="hold_expiry"),
        IndexModel([("status", ASC), ("check_out", ASC)], name="completion"),
    ],
    "payments": [
        IndexModel([("booking_id", ASC)], name="booking"),
        IndexModel(
            [("provider_order_id", ASC)],
            unique=True,
            partialFilterExpression={"provider_order_id": {"$type": "string"}},
            name="uniq_provider_order",
        ),
    ],
    "processed_webhook_events": [
        IndexModel([("event_id", ASC)], unique=True, name="uniq_event"),
        IndexModel([("received_at", ASC)], expireAfterSeconds=30 * 24 * 3600, name="ttl_30d"),
    ],
    "reviews": [
        IndexModel([("booking_id", ASC)], unique=True, name="uniq_booking"),
        IndexModel(
            [("resort_id", ASC), ("status", ASC), ("created_at", DESC)], name="resort_recent"
        ),
        IndexModel([("user_id", ASC)], name="user"),
    ],
    "review_reports": [
        IndexModel([("review_id", ASC), ("reporter_id", ASC)], unique=True, name="uniq_report"),
        IndexModel([("status", ASC), ("created_at", DESC)], name="queue"),
    ],
    "favourites": [
        IndexModel([("user_id", ASC), ("resort_id", ASC)], unique=True, name="uniq_user_resort"),
        IndexModel([("user_id", ASC), ("created_at", DESC)], name="user_recent"),
    ],
    "coupons": [
        IndexModel([("code", ASC)], unique=True, name="uniq_code"),
    ],
    "coupon_redemptions": [
        IndexModel([("booking_id", ASC)], unique=True, name="uniq_booking"),
        IndexModel([("coupon_id", ASC), ("user_id", ASC)], name="coupon_user"),
    ],
    "enquiries": [
        IndexModel([("owner_id", ASC), ("created_at", DESC)], name="owner_recent"),
    ],
    "notifications": [
        IndexModel([("user_id", ASC), ("read_at", ASC), ("created_at", DESC)], name="user_unread"),
        IndexModel([("created_at", ASC)], expireAfterSeconds=180 * 24 * 3600, name="ttl_180d"),
    ],
    "audit_logs": [
        IndexModel([("target_type", ASC), ("target_id", ASC), ("at", DESC)], name="target_recent"),
        IndexModel([("actor_id", ASC), ("at", DESC)], name="actor_recent"),
        IndexModel([("at", DESC)], name="recent"),
    ],
}


# Indexes from earlier versions that are no longer used; dropped if present.
OBSOLETE_INDEXES = {"resorts": ["text_search"]}


async def ensure_indexes(db: AsyncDatabase) -> dict[str, list[str]]:
    """Create every declared index. Returns {collection: [index names]} for logging."""
    for collection, names in OBSOLETE_INDEXES.items():
        existing = await db[collection].index_information()
        for name in names:
            if name in existing:
                await db[collection].drop_index(name)
    created: dict[str, list[str]] = {}
    for collection, models in INDEXES.items():
        created[collection] = await db[collection].create_indexes(models)
    return created
