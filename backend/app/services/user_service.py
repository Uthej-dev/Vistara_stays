"""Customer/owner profile operations on the current user."""

from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import ConflictError
from app.models.enums import ACTIVE_BOOKING_STATUSES, Role, UserStatus
from app.services.auth_service import user_out
from app.utils.dates import now_utc
from app.utils.text import serialize


class UserService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.users = db["users"]

    async def update_profile(self, user: dict, data) -> dict:
        changes = data.model_dump(exclude_unset=True)
        if "owner_profile" in changes and user["role"] != Role.OWNER:
            changes.pop("owner_profile")
        if changes:
            changes["updated_at"] = now_utc()
            await self.users.update_one({"_id": user["_id"]}, {"$set": changes})
        return user_out(await self.users.find_one({"_id": user["_id"]}))

    async def sessions(self, user: dict) -> list[dict]:
        cursor = self.db["sessions"].find(
            {"user_id": user["_id"], "revoked_at": None, "expires_at": {"$gt": now_utc()}},
            {"created_at": 1, "last_used_at": 1, "user_agent": 1},
        )
        return [serialize(s) for s in await cursor.sort("last_used_at", -1).to_list(50)]

    async def delete_account(self, user: dict) -> None:
        """Anonymise the account. Bookings and payments are kept (financial records) but no longer
        identify the person beyond what the booking itself required."""
        upcoming = await self.db["bookings"].count_documents(
            {"user_id": user["_id"], "status": {"$in": list(ACTIVE_BOOKING_STATUSES)}}, limit=1
        )
        if upcoming:
            raise ConflictError(
                "Cancel or complete your upcoming bookings before deleting your account.",
                code="HAS_ACTIVE_BOOKINGS",
            )
        if user["role"] == Role.OWNER and await self.db["resorts"].count_documents(
            {"owner_id": user["_id"], "status": {"$ne": "archived"}}, limit=1
        ):
            raise ConflictError("Archive your properties before deleting your account.", code="HAS_PROPERTIES")
        uid = str(user["_id"])
        await self.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "email": f"deleted+{uid}@invalid.local",
                    "name": "Deleted user",
                    "status": UserStatus.DELETED,
                    "password_hash": None,
                    "deleted_at": now_utc(),
                },
                "$unset": {"phone": "", "preferences": "", "owner_profile": ""},
                "$inc": {"token_version": 1},
            },
        )
        await self.db["sessions"].delete_many({"user_id": user["_id"]})
        await self.db["favourites"].delete_many({"user_id": user["_id"]})
