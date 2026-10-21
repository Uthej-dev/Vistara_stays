"""Reviews: eligibility (completed stays only, one per booking), reporting, owner replies,
moderation, and rating aggregates derived only from published reviews."""

from datetime import timedelta

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.errors import BusinessRuleError, ConflictError, ForbiddenError, NotFoundError
from app.models.enums import BookingStatus, ReviewStatus
from app.services.audit_service import audit
from app.services.booking_service import BookingService
from app.utils.dates import now_utc
from app.utils.text import serialize

SUB_RATINGS = ("cleanliness", "location", "service", "facilities")
EDIT_WINDOW = timedelta(days=30)


def public_author(name: str) -> str:
    """'Asha Rao' → 'Asha R.' — enough to feel human, not enough to identify."""
    parts = [p for p in (name or "").split() if p]
    if not parts:
        return "Guest"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."


def review_out(review: dict, *, include_private: bool = False) -> dict:
    out = {
        "id": str(review["_id"]),
        "resort_id": str(review["resort_id"]),
        "rating": review["rating"],
        "sub_ratings": review.get("sub_ratings") or {},
        "title": review.get("title"),
        "body": review["body"],
        "author": review.get("author_display", "Guest"),
        "stay_month": review.get("stay_month"),
        "room_type_name": review.get("room_type_name"),
        "created_at": review["created_at"],
        "updated_at": review.get("updated_at"),
        "owner_reply": review.get("owner_reply"),
        "is_sample": review.get("is_sample", False),
    }
    if include_private:
        out.update(
            {
                "status": review["status"],
                "booking_id": str(review["booking_id"]),
                "user_id": str(review["user_id"]),
                "report_count": review.get("report_count", 0),
                "moderation": serialize(review.get("moderation")),
            }
        )
    return out


async def recompute_rating(db: AsyncDatabase, resort_id: ObjectId) -> dict:
    """Aggregate rating from PUBLISHED reviews only (hidden/removed reviews don't count)."""
    rows = await (
        await db["reviews"].aggregate(
            [
                {"$match": {"resort_id": resort_id, "status": ReviewStatus.PUBLISHED}},
                {
                    "$group": {
                        "_id": None,
                        "avg": {"$avg": "$rating"},
                        "count": {"$sum": 1},
                        **{k: {"$avg": f"$sub_ratings.{k}"} for k in SUB_RATINGS},
                    }
                },
            ]
        )
    ).to_list(1)
    if rows:
        row = rows[0]
        rating = {
            "avg": round(row["avg"], 1),
            "count": row["count"],
            **{k: round(row[k], 1) if row[k] is not None else None for k in SUB_RATINGS},
        }
    else:
        rating = {"avg": 0, "count": 0}
    await db["resorts"].update_one({"_id": resort_id}, {"$set": {"rating": rating}})
    return rating


class ReviewService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.reviews = db["reviews"]

    async def create(self, user: dict, data) -> dict:
        booking = await self.db["bookings"].find_one(
            {"_id": ObjectId(data.booking_id), "user_id": user["_id"]}
        )
        if not booking:
            raise NotFoundError("Booking not found.")
        booking = await BookingService(self.db).refresh_state(booking)  # apply lazy completion
        if booking["status"] != BookingStatus.COMPLETED:
            raise ForbiddenError(
                "You can review a stay after you've checked out.", code="NOT_ELIGIBLE"
            )
        now = now_utc()
        doc = {
            "booking_id": booking["_id"],
            "user_id": user["_id"],
            "resort_id": booking["resort_id"],
            "rating": data.rating,
            "sub_ratings": data.sub_ratings.model_dump(exclude_none=True)
            if data.sub_ratings
            else {},
            "title": data.title,
            "body": data.body,
            "author_display": public_author(user["name"]),
            "stay_month": booking["check_in"][:7],
            "room_type_name": booking["resort_snapshot"]["room_type_name"],
            "status": ReviewStatus.PUBLISHED,
            "report_count": 0,
            "owner_reply": None,
            "is_sample": booking.get("is_sample", False),  # reviews of sample stays are samples
            "created_at": now,
            "updated_at": now,
        }
        try:
            doc["_id"] = (await self.reviews.insert_one(doc)).inserted_id
        except DuplicateKeyError as exc:
            raise ConflictError(
                "You've already reviewed this stay.", code="ALREADY_REVIEWED"
            ) from exc
        await recompute_rating(self.db, booking["resort_id"])
        return review_out(doc)

    async def update(self, user: dict, review_id: ObjectId, data) -> dict:
        review = await self.reviews.find_one({"_id": review_id, "user_id": user["_id"]})
        if not review:
            raise NotFoundError("Review not found.")
        if now_utc() - review["created_at"] > EDIT_WINDOW:
            raise BusinessRuleError("Reviews can be edited for 30 days.", code="EDIT_WINDOW_CLOSED")
        if review["status"] == ReviewStatus.REMOVED:
            raise BusinessRuleError("This review was removed by moderators.", code="INVALID_STATE")
        changes = data.model_dump(exclude_unset=True)
        if "sub_ratings" in changes and data.sub_ratings is not None:
            changes["sub_ratings"] = data.sub_ratings.model_dump(exclude_none=True)
        changes["updated_at"] = now_utc()
        updated = await self.reviews.find_one_and_update(
            {"_id": review_id}, {"$set": changes}, return_document=ReturnDocument.AFTER
        )
        await recompute_rating(self.db, review["resort_id"])
        return review_out(updated)

    async def for_resort(self, resort_id: ObjectId, sort: str, page: int, page_size: int) -> dict:
        resort = await self.db["resorts"].find_one(
            {"_id": resort_id, "status": "published"}, {"rating": 1}
        )
        if not resort:
            raise NotFoundError("Resort not found.")
        query = {"resort_id": resort_id, "status": ReviewStatus.PUBLISHED}
        order = {
            "recent": [("created_at", -1)],
            "highest": [("rating", -1), ("created_at", -1)],
            "lowest": [("rating", 1), ("created_at", -1)],
        }[sort]
        total = await self.reviews.count_documents(query)
        docs = (
            await self.reviews.find(query)
            .sort(order)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        histogram_rows = await (
            await self.reviews.aggregate(
                [
                    {"$match": query},
                    {"$group": {"_id": "$rating", "n": {"$sum": 1}}},
                ]
            )
        ).to_list(None)
        histogram = {str(star): 0 for star in range(5, 0, -1)}
        for row in histogram_rows:
            histogram[str(row["_id"])] = row["n"]
        return {
            "items": [review_out(r) for r in docs],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": -(-total // page_size) if total else 0,
            "summary": resort.get("rating") or {"avg": 0, "count": 0},
            "histogram": histogram,
        }

    async def recent(self, limit: int) -> list[dict]:
        docs = await self.reviews.aggregate(
            [
                {
                    "$match": {
                        "status": ReviewStatus.PUBLISHED,
                        "rating": {"$gte": 4},
                        "body": {"$exists": True},
                    }
                },
                {"$sort": {"created_at": -1}},
                {"$limit": 60},
                {"$sample": {"size": limit}},
                {
                    "$lookup": {
                        "from": "resorts",
                        "localField": "resort_id",
                        "foreignField": "_id",
                        "as": "resort",
                        "pipeline": [
                            {"$match": {"status": "published"}},
                            {"$project": {"name": 1, "slug": 1, "destination_name": 1}},
                        ],
                    }
                },
                {"$unwind": "$resort"},
            ]
        )
        out = []
        for r in await docs.to_list(limit):
            item = review_out(r)
            item["resort"] = {
                "name": r["resort"]["name"],
                "slug": r["resort"]["slug"],
                "destination_name": r["resort"]["destination_name"],
            }
            out.append(item)
        return out

    async def report(self, user: dict, review_id: ObjectId, data) -> None:
        review = await self.reviews.find_one({"_id": review_id, "status": ReviewStatus.PUBLISHED})
        if not review:
            raise NotFoundError("Review not found.")
        if review["user_id"] == user["_id"]:
            raise BusinessRuleError("You can't report your own review.", code="INVALID_STATE")
        try:
            await self.db["review_reports"].insert_one(
                {
                    "review_id": review_id,
                    "reporter_id": user["_id"],
                    "reason": data.reason,
                    "note": data.note,
                    "status": "open",
                    "created_at": now_utc(),
                }
            )
        except DuplicateKeyError as exc:
            raise ConflictError(
                "You've already reported this review.", code="ALREADY_REPORTED"
            ) from exc
        await self.reviews.update_one({"_id": review_id}, {"$inc": {"report_count": 1}})

    # ---------- owner ----------

    async def for_owner(self, owner: dict, page: int, page_size: int) -> dict:
        resort_ids = await self.db["resorts"].distinct("_id", {"owner_id": owner["_id"]})
        query = {"resort_id": {"$in": resort_ids}, "status": ReviewStatus.PUBLISHED}
        total = await self.reviews.count_documents(query)
        docs = (
            await self.reviews.find(query)
            .sort("created_at", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        names = {
            r["_id"]: r["name"]
            for r in await self.db["resorts"]
            .find({"_id": {"$in": resort_ids}}, {"name": 1})
            .to_list(None)
        }
        return {
            "items": [{**review_out(d), "resort_name": names.get(d["resort_id"])} for d in docs],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": -(-total // page_size) if total else 0,
        }

    async def reply(self, owner: dict, review_id: ObjectId, body: str) -> dict:
        review = await self.reviews.find_one({"_id": review_id, "status": ReviewStatus.PUBLISHED})
        resort = review and await self.db["resorts"].find_one(
            {"_id": review["resort_id"], "owner_id": owner["_id"]}, {"_id": 1}
        )
        if not review or not resort:
            raise NotFoundError("Review not found.")
        reply = {"body": body, "at": now_utc()}
        updated = await self.reviews.find_one_and_update(
            {"_id": review_id},
            {"$set": {"owner_reply": reply}},
            return_document=ReturnDocument.AFTER,
        )
        return review_out(updated)

    # ---------- admin moderation ----------

    async def moderate(
        self, admin: dict, review_id: ObjectId, action: str, reason: str | None
    ) -> dict:
        target = {
            "hide": ReviewStatus.HIDDEN,
            "restore": ReviewStatus.PUBLISHED,
            "remove": ReviewStatus.REMOVED,
        }[action]
        review = await self.reviews.find_one({"_id": review_id})
        if not review:
            raise NotFoundError("Review not found.")
        if action in ("hide", "remove") and not reason:
            raise BusinessRuleError("Please give a reason.", code="REASON_REQUIRED")
        updated = await self.reviews.find_one_and_update(
            {"_id": review_id},
            {
                "$set": {
                    "status": target,
                    "moderation": {
                        "action": action,
                        "reason": reason,
                        "by": admin["_id"],
                        "at": now_utc(),
                    },
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        # Reports about this review are resolved by the decision.
        await self.db["review_reports"].update_many(
            {"review_id": review_id, "status": "open"},
            {
                "$set": {
                    "status": "actioned" if action != "restore" else "dismissed",
                    "handled_by": admin["_id"],
                    "handled_at": now_utc(),
                }
            },
        )
        await recompute_rating(self.db, review["resort_id"])
        await audit(
            self.db,
            actor=admin,
            action=f"review.{action}",
            target_type="review",
            target_id=review_id,
            reason=reason,
            before={"status": review["status"]},
            after={"status": target},
        )
        return review_out(updated, include_private=True)
