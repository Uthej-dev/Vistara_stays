"""Admin review of resort listings: approve, reject, suspend, unsuspend. Every decision is
audited and the owner is notified."""

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import BusinessRuleError, NotFoundError
from app.models.enums import ResortStatus
from app.services.audit_service import audit
from app.services.email_service import EmailService
from app.utils.dates import now_utc
from app.utils.text import serialize

TRANSITIONS = {
    "approve": ([ResortStatus.PENDING_REVIEW], ResortStatus.PUBLISHED),
    "reject": ([ResortStatus.PENDING_REVIEW], ResortStatus.REJECTED),
    "suspend": ([ResortStatus.PUBLISHED], ResortStatus.SUSPENDED),
    "unsuspend": ([ResortStatus.SUSPENDED], ResortStatus.PUBLISHED),
}

MESSAGES = {
    "approve": ("Your property is live", "{name} has been approved and is now visible to guests."),
    "reject": (
        "Changes needed for your property",
        "{name} needs changes before it can go live: {reason}",
    ),
    "suspend": ("Your property has been suspended", "{name} has been hidden from search: {reason}"),
    "unsuspend": ("Your property is live again", "{name} is visible to guests again."),
}


class ModerationService:
    def __init__(self, db: AsyncDatabase, email: EmailService | None = None):
        self.db = db
        self.resorts = db["resorts"]
        self.email = email

    async def page(self, status: str | None, page: int, page_size: int) -> dict:
        query = {"status": status} if status else {}
        total = await self.resorts.count_documents(query)
        docs = (
            await self.resorts.find(query, {"policies": 0, "nearby_attractions": 0})
            .sort([("submitted_at", 1), ("updated_at", -1)])
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        owners = {
            u["_id"]: u
            for u in await self.db["users"]
            .find({"_id": {"$in": list({d["owner_id"] for d in docs})}}, {"name": 1, "email": 1})
            .to_list(None)
        }
        items = [{**serialize(d), "owner": serialize(owners.get(d["owner_id"], {}))} for d in docs]
        return {
            "items": items,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": -(-total // page_size) if total else 0,
        }

    async def detail(self, resort_id: ObjectId) -> dict:
        resort = await self.resorts.find_one({"_id": resort_id})
        if not resort:
            raise NotFoundError("Resort not found.")
        rooms = await self.db["room_types"].find({"resort_id": resort_id}).to_list(50)
        owner = await self.db["users"].find_one(
            {"_id": resort["owner_id"]}, {"name": 1, "email": 1, "phone": 1}
        )
        return {
            **serialize(resort),
            "room_types": serialize(rooms),
            "owner": serialize(owner or {}),
        }

    async def decide(
        self, admin: dict, resort_id: ObjectId, action: str, reason: str | None
    ) -> dict:
        allowed_from, target = TRANSITIONS[action]
        if action in ("reject", "suspend") and not reason:
            raise BusinessRuleError("Please give a reason.", code="REASON_REQUIRED")
        changes: dict = {"status": target, "updated_at": now_utc(), "moderated_by": admin["_id"]}
        if action == "approve":
            changes["rejection_reason"] = None
            changes["published_at"] = now_utc()
        if action == "reject":
            changes["rejection_reason"] = reason
        if action == "suspend":
            changes["suspended_reason"] = reason
        before = await self.resorts.find_one({"_id": resort_id}, {"status": 1})
        if not before:
            raise NotFoundError("Resort not found.")
        updated = await self.resorts.find_one_and_update(
            {"_id": resort_id, "status": {"$in": allowed_from}},
            {"$set": changes},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            raise BusinessRuleError(
                f"Can't {action} a resort that is {before['status'].replace('_', ' ')}.",
                code="INVALID_STATE",
            )
        await audit(
            self.db,
            actor=admin,
            action=f"resort.{action}",
            target_type="resort",
            target_id=resort_id,
            reason=reason,
            before={"status": before["status"]},
            after={"status": target},
        )
        await self._notify(updated, action, reason)
        return serialize(updated)

    async def _notify(self, resort: dict, action: str, reason: str | None) -> None:
        title, template = MESSAGES[action]
        body = template.format(name=resort["name"], reason=reason or "")
        await self.db["notifications"].insert_one(
            {
                "user_id": resort["owner_id"],
                "type": f"resort.{action}",
                "title": title,
                "body": body,
                "link": f"/owner/resorts/{resort['_id']}",
                "read_at": None,
                "created_at": now_utc(),
            }
        )
        owner = await self.db["users"].find_one({"_id": resort["owner_id"]}, {"email": 1})
        if self.email and owner:
            await self.email.send_notification(owner["email"], title, body, f"resort.{action}")
