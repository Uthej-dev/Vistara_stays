"""Room inventory: one document per (room type, night). See docs/06-booking-engine.md.

Invariant on every write: reserved_units + blocked_units <= total_units.
"""

from datetime import date

from bson import ObjectId
from pymongo import UpdateOne
from pymongo.asynchronous.client_session import AsyncClientSession
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import BulkWriteError

from app.core.errors import ConflictError
from app.utils.dates import iso, now_utc


class InventoryRepository:
    def __init__(self, db: AsyncDatabase):
        self.col = db["inventory"]

    async def for_room_types(
        self, room_type_ids: list[ObjectId], start: str, end_exclusive: str
    ) -> list[dict]:
        query = {
            "room_type_id": {"$in": room_type_ids},
            "date": {"$gte": start, "$lt": end_exclusive},
        }
        return await self.col.find(query).to_list(None)

    async def ensure_nights(
        self, room: dict, nights: list[date], session: AsyncClientSession | None = None
    ) -> None:
        """Create missing night documents (idempotent thanks to the unique index)."""
        ops = [
            UpdateOne(
                {"room_type_id": room["_id"], "date": iso(n)},
                {
                    "$setOnInsert": {
                        "resort_id": room["resort_id"],
                        "total_units": room["total_units"],
                        "reserved_units": 0,
                        "blocked_units": 0,
                        "version": 0,
                        "created_at": now_utc(),
                    }
                },
                upsert=True,
            )
            for n in nights
        ]
        if not ops:
            return
        try:
            await self.col.bulk_write(ops, ordered=False, session=session)
        except BulkWriteError as exc:
            # A concurrent request created the same night first (duplicate key) — that's fine.
            if any(e.get("code") != 11000 for e in exc.details.get("writeErrors", [])):
                raise

    async def reserve(
        self, room_type_id: ObjectId, nights: list[date], units: int, session: AsyncClientSession
    ) -> None:
        """Atomically take `units` rooms on every night, or raise ROOM_UNAVAILABLE.

        Each update only matches if enough units remain AFTER the reservation, so two requests can
        never both take the last room. Called inside a transaction: a failure on any night aborts
        the whole transaction, undoing the nights already taken.
        """
        for night in nights:
            result = await self.col.update_one(
                {
                    "room_type_id": room_type_id,
                    "date": iso(night),
                    "closed": {"$ne": True},
                    "$expr": {
                        "$lte": [
                            {"$add": ["$reserved_units", "$blocked_units", units]},
                            "$total_units",
                        ]
                    },
                },
                {"$inc": {"reserved_units": units, "version": 1}},
                session=session,
            )
            if result.modified_count == 0:
                raise ConflictError(
                    f"Sorry — this room just sold out for the night of {iso(night)}.",
                    code="ROOM_UNAVAILABLE",
                    details={"date": iso(night)},
                )

    async def release(
        self, room_type_id: ObjectId, nights: list[str], units: int, session: AsyncClientSession
    ) -> None:
        await self.col.update_many(
            {
                "room_type_id": room_type_id,
                "date": {"$in": nights},
                "reserved_units": {"$gte": units},
            },
            {"$inc": {"reserved_units": -units, "version": 1}},
            session=session,
        )
