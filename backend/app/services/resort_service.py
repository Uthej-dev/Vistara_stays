"""Public resort reads (details page)."""

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import NotFoundError
from app.repositories.resorts import ResortRepository, RoomTypeRepository
from app.services.mappers import resort_detail


class ResortService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.resorts = ResortRepository(db)
        self.room_types = RoomTypeRepository(db)

    async def get_published(self, slug: str, user_id: ObjectId | None = None) -> dict:
        resort = await self.resorts.published_by_slug(slug)
        if not resort:
            raise NotFoundError("Resort not found.")
        rooms = await self.room_types.active_for_resort(resort["_id"])
        is_favourite = False
        if user_id is not None:
            is_favourite = bool(
                await self.db["favourites"].find_one(
                    {"user_id": user_id, "resort_id": resort["_id"]}, {"_id": 1}
                )
            )
        return resort_detail(resort, rooms, is_favourite=is_favourite)
