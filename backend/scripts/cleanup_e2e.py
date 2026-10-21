"""Remove records created by the browser E2E suite (listings named "E2E …" and their data).

Usage (from backend/, venv active):  python -m scripts.cleanup_e2e
Refuses to run in production.
"""

import asyncio

from app.core.config import get_settings
from app.db.mongodb import create_client, get_database


async def main() -> None:
    settings = get_settings()
    if settings.is_production:
        raise SystemExit("Refusing to run in production.")
    client = create_client(settings)
    try:
        db = get_database(client, settings)
        ids = await db["resorts"].distinct("_id", {"name": {"$regex": "^E2E "}})
        counts = {}
        for name in ("room_types", "inventory", "rate_rules", "bookings", "reviews", "enquiries"):
            counts[name] = (await db[name].delete_many({"resort_id": {"$in": ids}})).deleted_count
        counts["resorts"] = (await db["resorts"].delete_many({"_id": {"$in": ids}})).deleted_count
        # Guest accounts created by the visitor-checkout journey (their bookings are cancelled).
        users = await db["users"].distinct("_id", {"email": {"$regex": r"^e2e\+"}})
        bookings = await db["bookings"].distinct("_id", {"user_id": {"$in": users}})
        linked = {"$or": [{"user_id": {"$in": users}}, {"booking_id": {"$in": bookings}}]}
        for name in ("payments", "notifications", "auth_tokens", "refresh_tokens"):
            counts[name] = (await db[name].delete_many(linked)).deleted_count
        counts["guest_bookings"] = (
            await db["bookings"].delete_many({"_id": {"$in": bookings}})
        ).deleted_count
        counts["users"] = (await db["users"].delete_many({"_id": {"$in": users}})).deleted_count
        print("Removed:", counts)
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
