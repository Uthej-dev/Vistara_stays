"""Administrator operations. Every mutation is audited."""

from datetime import timedelta

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.models.enums import ReviewStatus, Role, UserStatus
from app.services.audit_service import audit
from app.services.platform_settings import get_platform_settings
from app.services.review_service import review_out
from app.utils.dates import now_utc
from app.utils.geo import geo_point
from app.utils.text import safe_regex, serialize


def page_of(items, page, page_size, total):
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": -(-total // page_size) if total else 0,
    }


def admin_user_out(user: dict) -> dict:
    out = serialize(user)
    for private in ("password_hash", "token_version"):
        out.pop(private, None)
    return out


class AdminService:
    def __init__(self, db: AsyncDatabase):
        self.db = db

    # ---------- metrics ----------

    async def metrics(self) -> dict:
        async def group_count(collection, field, match=None):
            rows = await (
                await self.db[collection].aggregate(
                    [
                        {"$match": match or {}},
                        {"$group": {"_id": f"${field}", "n": {"$sum": 1}}},
                    ]
                )
            ).to_list(None)
            return {row["_id"]: row["n"] for row in rows}

        since = now_utc() - timedelta(days=30)
        gmv = await (
            await self.db["bookings"].aggregate(
                [
                    {
                        "$match": {
                            "status": {"$in": ["confirmed", "completed"]},
                            "is_sample": {"$ne": True},
                        }
                    },
                    {
                        "$group": {
                            "_id": None,
                            "total": {"$sum": "$price.total_paise"},
                            "n": {"$sum": 1},
                        }
                    },
                ]
            )
        ).to_list(1)
        return {
            "users_by_role": await group_count(
                "users", "role", {"status": {"$ne": UserStatus.DELETED}}
            ),
            "bookings_by_status": await group_count(
                "bookings", "status", {"is_sample": {"$ne": True}}
            ),
            "resorts_by_status": await group_count("resorts", "status"),
            "bookings_last_30_days": await self.db["bookings"].count_documents(
                {"created_at": {"$gte": since}, "is_sample": {"$ne": True}}
            ),
            "new_users_last_30_days": await self.db["users"].count_documents(
                {"created_at": {"$gte": since}}
            ),
            "gross_booking_value_paise": gmv[0]["total"] if gmv else 0,
            "paid_bookings": gmv[0]["n"] if gmv else 0,
            "pending_approvals": await self.db["resorts"].count_documents(
                {"status": "pending_review"}
            ),
            "open_reports": await self.db["review_reports"].count_documents({"status": "open"}),
        }

    # ---------- users ----------

    async def users(self, *, role=None, status=None, q=None, page=1, page_size=20) -> dict:
        query: dict = {}
        if role:
            query["role"] = role
        if status:
            query["status"] = status
        if q:
            pattern = {"$regex": safe_regex(q), "$options": "i"}
            query["$or"] = [{"email": pattern}, {"name": pattern}]
        total = await self.db["users"].count_documents(query)
        docs = (
            await self.db["users"]
            .find(query)
            .sort("created_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        return page_of([admin_user_out(u) for u in docs], page, page_size, total)

    async def set_user_status(
        self, admin: dict, user_id: ObjectId, action: str, reason: str | None
    ) -> dict:
        if user_id == admin["_id"]:
            raise BusinessRuleError(
                "You can't change your own account status.", code="INVALID_STATE"
            )
        user = await self.db["users"].find_one({"_id": user_id})
        if not user:
            raise NotFoundError("User not found.")
        if user["role"] == Role.ADMIN:
            raise BusinessRuleError(
                "Administrator accounts are managed with the admin script.", code="INVALID_STATE"
            )
        if action == "suspend":
            if not reason:
                raise BusinessRuleError("Please give a reason.", code="REASON_REQUIRED")
            update = {
                "$set": {"status": UserStatus.SUSPENDED, "suspended_reason": reason},
                "$inc": {"token_version": 1},
            }
            await self.db["sessions"].update_many(
                {"user_id": user_id, "revoked_at": None},
                {"$set": {"revoked_at": now_utc(), "revoked_reason": "suspended"}},
            )
        else:
            update = {"$set": {"status": UserStatus.ACTIVE}, "$unset": {"suspended_reason": ""}}
        updated = await self.db["users"].find_one_and_update(
            {"_id": user_id}, update, return_document=ReturnDocument.AFTER
        )
        await audit(
            self.db,
            actor=admin,
            action=f"user.{action}",
            target_type="user",
            target_id=user_id,
            reason=reason,
            before={"status": user["status"]},
            after={"status": updated["status"]},
        )
        return admin_user_out(updated)

    # ---------- bookings ----------

    async def bookings(self, *, status=None, q=None, page=1, page_size=20) -> dict:
        query: dict = {}
        if status:
            query["status"] = status
        if q:
            query["booking_ref"] = {"$regex": safe_regex(q.upper()), "$options": "i"}
        total = await self.db["bookings"].count_documents(query)
        docs = (
            await self.db["bookings"]
            .find(query)
            .sort("created_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        from app.services.booking_service import booking_out

        return page_of(
            [booking_out(b, include_preview=False) for b in docs], page, page_size, total
        )

    # ---------- reviews ----------

    async def reviews(self, *, status=None, reported=False, page=1, page_size=20) -> dict:
        query: dict = {}
        if status:
            query["status"] = status
        if reported:
            query["report_count"] = {"$gt": 0}
        total = await self.db["reviews"].count_documents(query)
        docs = (
            await self.db["reviews"]
            .find(query)
            .sort([("report_count", -1), ("created_at", -1)])
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        names = {
            r["_id"]: r["name"]
            for r in await self.db["resorts"]
            .find({"_id": {"$in": [d["resort_id"] for d in docs]}}, {"name": 1})
            .to_list(None)
        }
        return page_of(
            [
                {**review_out(d, include_private=True), "resort_name": names.get(d["resort_id"])}
                for d in docs
            ],
            page,
            page_size,
            total,
        )

    async def reports(self, *, status="open", page=1, page_size=20) -> dict:
        query = {"status": status} if status else {}
        total = await self.db["review_reports"].count_documents(query)
        docs = (
            await self.db["review_reports"]
            .find(query)
            .sort("created_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        reviews = {
            r["_id"]: r
            for r in await self.db["reviews"]
            .find({"_id": {"$in": [d["review_id"] for d in docs]}})
            .to_list(None)
        }
        items = [
            {
                **serialize(d),
                "review": review_out(reviews[d["review_id"]], include_private=True)
                if d["review_id"] in reviews
                else None,
            }
            for d in docs
        ]
        return page_of(items, page, page_size, total)

    async def dismiss_report(self, admin: dict, report_id: ObjectId) -> dict:
        report = await self.db["review_reports"].find_one_and_update(
            {"_id": report_id, "status": "open"},
            {"$set": {"status": "dismissed", "handled_by": admin["_id"], "handled_at": now_utc()}},
            return_document=ReturnDocument.AFTER,
        )
        if not report:
            raise NotFoundError("Open report not found.")
        await audit(
            self.db,
            actor=admin,
            action="report.dismiss",
            target_type="review_report",
            target_id=report_id,
        )
        return serialize(report)

    # ---------- destinations & categories ----------

    async def destinations(self) -> list[dict]:
        from app.services.mappers import destination_out

        return [
            destination_out(d)
            for d in await self.db["destinations"].find().sort("name", 1).to_list(None)
        ]

    async def create_destination(self, admin: dict, data) -> dict:
        doc = data.model_dump(mode="json")
        lat, lng = doc.pop("lat"), doc.pop("lng")
        doc.update(
            {
                "location": geo_point(lat, lng),
                "featured_rank": doc.get("featured_rank") or 1000,
                "created_at": now_utc(),
            }
        )
        try:
            doc["_id"] = (await self.db["destinations"].insert_one(doc)).inserted_id
        except DuplicateKeyError as exc:
            raise ConflictError(
                "A destination with this slug already exists.", code="SLUG_TAKEN"
            ) from exc
        await audit(
            self.db,
            actor=admin,
            action="destination.create",
            target_type="destination",
            target_id=doc["_id"],
            after={"slug": doc["slug"]},
        )
        from app.services.mappers import destination_out

        return destination_out(doc)

    async def update_destination(self, admin: dict, destination_id: ObjectId, data) -> dict:
        changes = data.model_dump(exclude_unset=True, mode="json")
        if "featured_rank" in changes and changes["featured_rank"] is None:
            changes["featured_rank"] = 1000
        before = await self.db["destinations"].find_one({"_id": destination_id})
        if not before:
            raise NotFoundError("Destination not found.")
        updated = await self.db["destinations"].find_one_and_update(
            {"_id": destination_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
        )
        if "name" in changes:
            # Keep the denormalised copy on resorts in sync.
            await self.db["resorts"].update_many(
                {"destination_id": destination_id}, {"$set": {"destination_name": changes["name"]}}
            )
        await audit(
            self.db,
            actor=admin,
            action="destination.update",
            target_type="destination",
            target_id=destination_id,
            before={k: before.get(k) for k in changes},
            after=changes,
        )
        from app.services.mappers import destination_out

        return destination_out(updated)

    async def create_category(self, admin: dict, data) -> dict:
        doc = {**data.model_dump(), "is_active": True}
        try:
            doc["_id"] = (await self.db["categories"].insert_one(doc)).inserted_id
        except DuplicateKeyError as exc:
            raise ConflictError(
                "A category with this slug already exists.", code="SLUG_TAKEN"
            ) from exc
        await audit(
            self.db,
            actor=admin,
            action="category.create",
            target_type="category",
            target_id=doc["_id"],
        )
        return serialize(doc)

    async def update_category(self, admin: dict, category_id: ObjectId, data) -> dict:
        changes = data.model_dump(exclude_unset=True)
        updated = await self.db["categories"].find_one_and_update(
            {"_id": category_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
        )
        if not updated:
            raise NotFoundError("Category not found.")
        await audit(
            self.db,
            actor=admin,
            action="category.update",
            target_type="category",
            target_id=category_id,
            after=changes,
        )
        return serialize(updated)

    # ---------- coupons ----------

    async def coupons(self) -> list[dict]:
        return [serialize(c) for c in await self.db["coupons"].find().sort("code", 1).to_list(None)]

    def _coupon_doc(self, data) -> dict:
        doc = data.model_dump()
        doc["resort_ids"] = [ObjectId(r) for r in doc["resort_ids"]] if doc["resort_ids"] else None
        return doc

    async def create_coupon(self, admin: dict, data) -> dict:
        doc = {**self._coupon_doc(data), "used_count": 0, "created_at": now_utc()}
        try:
            doc["_id"] = (await self.db["coupons"].insert_one(doc)).inserted_id
        except DuplicateKeyError as exc:
            raise ConflictError(
                "A coupon with this code already exists.", code="CODE_TAKEN"
            ) from exc
        await audit(
            self.db,
            actor=admin,
            action="coupon.create",
            target_type="coupon",
            target_id=doc["_id"],
            after={"code": doc["code"]},
        )
        return serialize(doc)

    async def update_coupon(self, admin: dict, coupon_id: ObjectId, data) -> dict:
        doc = self._coupon_doc(data)
        updated = await self.db["coupons"].find_one_and_update(
            {"_id": coupon_id}, {"$set": doc}, return_document=ReturnDocument.AFTER
        )
        if not updated:
            raise NotFoundError("Coupon not found.")
        await audit(
            self.db,
            actor=admin,
            action="coupon.update",
            target_type="coupon",
            target_id=coupon_id,
            after=serialize(doc),
        )
        return serialize(updated)

    # ---------- settings ----------

    async def update_settings(self, admin: dict, data) -> dict:
        before = await get_platform_settings(self.db)
        changes = data.model_dump(exclude_unset=True)
        if not changes:
            return before
        await self.db["platform_settings"].update_one(
            {"_id": "global"}, {"$set": changes}, upsert=True
        )
        await audit(
            self.db,
            actor=admin,
            action="settings.update",
            target_type="platform_settings",
            target_id="global",
            before={k: before.get(k) for k in changes},
            after=changes,
        )
        return await get_platform_settings(self.db)

    # ---------- audit log ----------

    async def audit_logs(self, *, action=None, target_id=None, before=None, limit=50) -> dict:
        query: dict = {}
        if action:
            query["action"] = action
        if target_id:
            query["target_id"] = ObjectId(target_id) if ObjectId.is_valid(target_id) else target_id
        if before:
            query["_id"] = {
                "$lt": ObjectId(before)
            }  # keyset pagination: stable as new entries arrive
        docs = (
            await self.db["audit_logs"]
            .find(query)
            .sort("_id", -1)
            .limit(limit + 1)
            .to_list(limit + 1)
        )
        has_more = len(docs) > limit
        docs = docs[:limit]
        return {"items": serialize(docs), "next_before": str(docs[-1]["_id"]) if has_more else None}

    async def review_counts(self) -> dict:
        return {s: await self.db["reviews"].count_documents({"status": s}) for s in ReviewStatus}
