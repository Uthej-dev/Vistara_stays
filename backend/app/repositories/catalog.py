"""Database access for destinations and categories."""

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase

from app.models.enums import ResortStatus


class DestinationRepository:
    def __init__(self, db: AsyncDatabase):
        self.col = db["destinations"]
        self.resorts = db["resorts"]

    async def find_all(self, *, state: str | None, dest_type: str | None, include_inactive=False):
        query: dict = {}
        if not include_inactive:
            query["is_active"] = True
        if state:
            query["state"] = state
        if dest_type:
            query["types"] = dest_type
        cursor = self.col.find(query).sort([("featured_rank", 1), ("name", 1)])
        return await cursor.to_list(length=500)

    async def by_slug(self, slug: str, *, include_inactive=False):
        query: dict = {"slug": slug}
        if not include_inactive:
            query["is_active"] = True
        return await self.col.find_one(query)

    async def by_id(self, destination_id: ObjectId):
        return await self.col.find_one({"_id": destination_id})

    async def resort_stats(self, destination_ids: list[ObjectId] | None = None) -> dict:
        """{destination_id: {"count": n, "min_price": paise}} over published resorts."""
        match: dict = {"status": ResortStatus.PUBLISHED}
        if destination_ids is not None:
            match["destination_id"] = {"$in": destination_ids}
        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": "$destination_id",
                    "count": {"$sum": 1},
                    "min_price": {"$min": "$starting_price_paise"},
                }
            },
        ]
        rows = await (await self.resorts.aggregate(pipeline)).to_list(length=None)
        return {row["_id"]: row for row in rows}


class CategoryRepository:
    def __init__(self, db: AsyncDatabase):
        self.col = db["categories"]

    async def find_all(self, kind: str | None = None, include_inactive=False):
        query: dict = {}
        if kind:
            query["kind"] = kind
        if not include_inactive:
            query["is_active"] = {"$ne": False}
        return await self.col.find(query).sort([("kind", 1), ("sort_order", 1)]).to_list(None)

    async def slugs(self, kind: str) -> set[str]:
        return {c["slug"] for c in await self.find_all(kind)}
