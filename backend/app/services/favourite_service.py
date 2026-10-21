"""Saved resorts. The unique index on (user_id, resort_id) makes saving idempotent."""

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import NotFoundError
from app.models.enums import ResortStatus
from app.repositories.resorts import CARD_PROJECTION
from app.services.mappers import resort_card
from app.utils.dates import now_utc


class FavouriteService:
    def __init__(self, db: AsyncDatabase):
        self.favourites = db["favourites"]
        self.resorts = db["resorts"]

    async def ids(self, user_id: ObjectId) -> list[str]:
        docs = await self.favourites.find({"user_id": user_id}, {"resort_id": 1}).to_list(500)
        return [str(d["resort_id"]) for d in docs]

    async def page(self, user_id: ObjectId, page: int, page_size: int) -> dict:
        favs = await self.favourites.find({"user_id": user_id}).sort("created_at", -1).to_list(500)
        order = [f["resort_id"] for f in favs]
        resorts = await self.resorts.find(
            {"_id": {"$in": order}, "status": ResortStatus.PUBLISHED}, CARD_PROJECTION
        ).to_list(500)
        by_id = {r["_id"]: r for r in resorts}
        # Resorts that were unpublished since saving simply drop out of the list.
        visible = [by_id[i] for i in order if i in by_id]
        start = (page - 1) * page_size
        items = [resort_card(r) for r in visible[start : start + page_size]]
        total = len(visible)
        return {
            "items": items,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": -(-total // page_size) if total else 0,
        }

    async def add(self, user_id: ObjectId, resort_id: ObjectId) -> None:
        if not await self.resorts.find_one(
            {"_id": resort_id, "status": ResortStatus.PUBLISHED}, {"_id": 1}
        ):
            raise NotFoundError("Resort not found.")
        await self.favourites.update_one(
            {"user_id": user_id, "resort_id": resort_id},
            {"$setOnInsert": {"created_at": now_utc()}},
            upsert=True,
        )

    async def remove(self, user_id: ObjectId, resort_id: ObjectId) -> None:
        await self.favourites.delete_one({"user_id": user_id, "resort_id": resort_id})
