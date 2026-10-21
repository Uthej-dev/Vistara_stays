"""Database access for resorts and room types."""

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.models.enums import ResortStatus, RoomTypeStatus
from app.utils.dates import now_utc

SORTS = {
    # Every sort ends with _id so paging is stable when values tie.
    "recommended": [("featured_rank", 1), ("rating.avg", -1), ("rating.count", -1), ("_id", 1)],
    "price_asc": [("starting_price_paise", 1), ("_id", 1)],
    "price_desc": [("starting_price_paise", -1), ("_id", 1)],
    "rating": [("rating.avg", -1), ("rating.count", -1), ("_id", 1)],
    "reviews": [("rating.count", -1), ("rating.avg", -1), ("_id", 1)],
}

# Fields search results need (keeps result payloads small).
CARD_PROJECTION = {
    "slug": 1,
    "name": 1,
    "is_sample": 1,
    "destination_id": 1,
    "destination_slug": 1,
    "destination_name": 1,
    "state": 1,
    "property_type": 1,
    "categories": 1,
    "amenities": 1,
    "surroundings": 1,
    "images": {"$slice": 1},
    "rating": 1,
    "starting_price_paise": 1,
    "meal_plan": 1,
    "distance_from_centre_km": 1,
    "featured_rank": 1,
}


class ResortRepository:
    def __init__(self, db: AsyncDatabase):
        self.col = db["resorts"]

    async def search_page(self, query: dict, sort: str, skip: int, limit: int):
        cursor = self.col.find(query, CARD_PROJECTION).sort(SORTS[sort]).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def search_all(self, query: dict, sort: str, cap: int = 500):
        return await self.col.find(query, CARD_PROJECTION).sort(SORTS[sort]).to_list(cap)

    async def count(self, query: dict) -> int:
        return await self.col.count_documents(query)

    async def facets(self, query: dict) -> dict:
        def counts(field):
            return [{"$unwind": f"${field}"}, {"$group": {"_id": f"${field}", "n": {"$sum": 1}}}]

        pipeline = [
            {"$match": query},
            {
                "$facet": {
                    "amenities": counts("amenities"),
                    "categories": counts("categories"),
                    "surroundings": counts("surroundings"),
                    "property_types": [{"$group": {"_id": "$property_type", "n": {"$sum": 1}}}],
                }
            },
        ]
        rows = await (await self.col.aggregate(pipeline)).to_list(1)
        facet = rows[0] if rows else {}
        return {k: {r["_id"]: r["n"] for r in v} for k, v in facet.items()}

    async def featured(self, limit: int):
        query = {"status": ResortStatus.PUBLISHED}
        cursor = self.col.find(query, CARD_PROJECTION).sort(SORTS["recommended"]).limit(limit)
        return await cursor.to_list(limit)

    async def published_by_slug(self, slug: str):
        return await self.col.find_one({"slug": slug, "status": ResortStatus.PUBLISHED})

    async def by_id(self, resort_id: ObjectId, extra: dict | None = None):
        return await self.col.find_one({"_id": resort_id, **(extra or {})})

    async def update(self, query: dict, changes: dict, unset: list[str] | None = None):
        update: dict = {"$set": {**changes, "updated_at": now_utc()}}
        if unset:
            update["$unset"] = {k: "" for k in unset}
        return await self.col.find_one_and_update(
            query, update, return_document=ReturnDocument.AFTER
        )

    async def slug_exists(self, slug: str) -> bool:
        return await self.col.count_documents({"slug": slug}, limit=1) > 0


class RoomTypeRepository:
    def __init__(self, db: AsyncDatabase):
        self.col = db["room_types"]

    async def active_for_resort(self, resort_id: ObjectId):
        query = {"resort_id": resort_id, "status": RoomTypeStatus.ACTIVE}
        return await self.col.find(query).sort("base_rate_paise", 1).to_list(50)

    async def active_for_resorts(self, resort_ids: list[ObjectId]):
        query = {"resort_id": {"$in": resort_ids}, "status": RoomTypeStatus.ACTIVE}
        return await self.col.find(query).to_list(None)

    async def all_for_resort(self, resort_id: ObjectId):
        return await self.col.find({"resort_id": resort_id}).sort("base_rate_paise", 1).to_list(50)

    async def by_id(self, room_type_id: ObjectId, extra: dict | None = None):
        return await self.col.find_one({"_id": room_type_id, **(extra or {})})
