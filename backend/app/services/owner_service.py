"""Owner portal: resorts, room types, calendar & pricing, reservations, enquiries, dashboard.

Every query here includes `owner_id` — an owner can't read or change anything they don't own,
and "not yours" looks exactly like "doesn't exist" (404) so ids can't be probed.
"""

from datetime import date, timedelta

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import Settings
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.models.enums import ACTIVE_BOOKING_STATUSES, BookingStatus, ResortStatus, RoomTypeStatus
from app.repositories.catalog import CategoryRepository
from app.repositories.inventory import InventoryRepository
from app.services.audit_service import audit
from app.services.platform_settings import get_platform_settings
from app.services.pricing import nightly_rate
from app.utils.dates import iso, iter_nights, now_utc, parse_date, today_ist
from app.utils.geo import geo_point, haversine_km
from app.utils.text import serialize, slugify, unique_suffix

# Changing these on a published resort sends it back for review.
REVIEWED_FIELDS = {"name", "destination", "address", "location", "property_type"}
NOT_FEATURED = 1000

DEFAULT_POLICIES = {
    "check_in_time": "14:00",
    "check_out_time": "11:00",
    "cancellation_policy": {
        "code": "flexible",
        "description": "Full refund up to 7 days before check-in; 50% up to 2 days before.",
        "tiers": [
            {"days_before_check_in": 7, "refund_pct": 100},
            {"days_before_check_in": 2, "refund_pct": 50},
            {"days_before_check_in": 0, "refund_pct": 0},
        ],
    },
    "child_free_age": 5,
    "pets_allowed": False,
    "smoking_allowed": False,
    "house_rules": [],
    "accessibility": [],
    "id_required": True,
    "meals_note": None,
}


class OwnerService:
    def __init__(self, db: AsyncDatabase, settings: Settings | None = None):
        self.db = db
        self.settings = settings
        self.resorts = db["resorts"]
        self.rooms = db["room_types"]
        self.bookings = db["bookings"]
        self.rules = db["rate_rules"]
        self.inventory = InventoryRepository(db)

    # ---------- helpers ----------

    async def own_resort(self, owner: dict, resort_id: ObjectId) -> dict:
        resort = await self.resorts.find_one({"_id": resort_id, "owner_id": owner["_id"]})
        if not resort:
            raise NotFoundError("Property not found.")
        return resort

    async def own_room(self, owner: dict, room_id: ObjectId) -> dict:
        room = await self.rooms.find_one({"_id": room_id, "owner_id": owner["_id"]})
        if not room:
            raise NotFoundError("Room type not found.")
        return room

    async def own_booking(self, owner: dict, booking_id: ObjectId) -> dict:
        booking = await self.bookings.find_one({"_id": booking_id, "owner_id": owner["_id"]})
        if not booking:
            raise NotFoundError("Booking not found.")
        return booking

    def _allowed_image(self, src: str) -> bool:
        prefixes = [
            "/api/v1/media/",
            "https://upload.wikimedia.org/",
            "https://thumb.wikimedia.org/",
        ]
        if self.settings and self.settings.cloudinary_cloud_name:
            prefixes.append(f"https://res.cloudinary.com/{self.settings.cloudinary_cloud_name}/")
        return any(src.startswith(p) for p in prefixes)

    def _check_images(self, images: list[dict]) -> None:
        for image in images:
            urls = [image["src"], *((image.get("srcSet") or {}).values())]
            if not all(self._allowed_image(u) for u in urls):
                raise BusinessRuleError(
                    "Images must be uploaded through Vistara Stays.", code="IMAGE_NOT_ALLOWED"
                )

    async def _check_slugs(self, data: dict) -> None:
        repo = CategoryRepository(self.db)
        for field, kind in (
            ("categories", "category"),
            ("amenities", "amenity"),
            ("surroundings", "surrounding"),
        ):
            if data.get(field) is not None:
                unknown = set(data[field]) - await repo.slugs(kind)
                if unknown:
                    raise BusinessRuleError(
                        f"Unknown {field}: {', '.join(sorted(unknown))}", code="UNKNOWN_OPTION"
                    )

    async def _destination(self, slug: str) -> dict:
        destination = await self.db["destinations"].find_one({"slug": slug, "is_active": True})
        if not destination:
            raise BusinessRuleError(
                "Choose a destination from the list.", code="UNKNOWN_DESTINATION"
            )
        return destination

    async def refresh_starting_price(self, resort_id: ObjectId) -> None:
        cheapest = await self.rooms.find_one(
            {"resort_id": resort_id, "status": RoomTypeStatus.ACTIVE}, sort=[("base_rate_paise", 1)]
        )
        changes = (
            {
                "starting_price_paise": cheapest["base_rate_paise"],
                "meal_plan": cheapest["meal_plan"],
            }
            if cheapest
            else {"starting_price_paise": 0}
        )
        await self.resorts.update_one({"_id": resort_id}, {"$set": changes})

    # ---------- resorts ----------

    async def list_resorts(self, owner: dict) -> list[dict]:
        docs = (
            await self.resorts.find({"owner_id": owner["_id"]}).sort("updated_at", -1).to_list(100)
        )
        counts = {
            row["_id"]: row["n"]
            for row in await (
                await self.rooms.aggregate(
                    [
                        {"$match": {"owner_id": owner["_id"], "status": RoomTypeStatus.ACTIVE}},
                        {"$group": {"_id": "$resort_id", "n": {"$sum": 1}}},
                    ]
                )
            ).to_list(None)
        }
        return [{**serialize(d), "room_type_count": counts.get(d["_id"], 0)} for d in docs]

    async def create_resort(self, owner: dict, data) -> dict:
        destination = await self._destination(data.destination)
        base_slug = slugify(f"{data.name}-{destination['slug']}")
        now = now_utc()
        doc = {
            "name": data.name,
            "status": ResortStatus.DRAFT,
            "is_sample": False,
            "owner_id": owner["_id"],
            "manager_ids": [],
            "destination_id": destination["_id"],
            "destination_slug": destination["slug"],
            "destination_name": destination["name"],
            "state": destination["state"],
            "property_type": data.property_type,
            "categories": [],
            "amenities": [],
            "surroundings": [],
            "description": "",
            "highlights": [],
            "images": [],
            "address": {
                "line1": "",
                "town": destination["name"],
                "district": destination["district"],
                "state": destination["state"],
                "pincode": None,
            },
            "location": None,
            "distance_from_centre_km": None,
            "policies": DEFAULT_POLICIES,
            "nearby_attractions": [],
            "contact": {"email": owner["email"], "phone": owner.get("phone")},
            "booking_mode": "instant",
            "starting_price_paise": 0,
            "meal_plan": "room_only",
            "rating": {"avg": 0, "count": 0},
            "featured_rank": NOT_FEATURED,
            "rejection_reason": None,
            "created_at": now,
            "updated_at": now,
        }
        slug = base_slug
        for _ in range(5):
            if await self.resorts.find_one({"slug": slug}, {"_id": 1}):
                slug = f"{base_slug}-{unique_suffix()}"
                continue
            try:
                doc["slug"] = slug
                doc["_id"] = (await self.resorts.insert_one(doc)).inserted_id
                break
            except DuplicateKeyError:  # another request took the slug a moment ago
                doc.pop("_id", None)
                slug = f"{base_slug}-{unique_suffix()}"
        else:
            raise ConflictError("Please try again.", code="SLUG_RETRY")
        return serialize(doc)

    async def update_resort(self, owner: dict, resort_id: ObjectId, data) -> dict:
        resort = await self.own_resort(owner, resort_id)
        if resort["status"] == ResortStatus.ARCHIVED:
            raise BusinessRuleError("Archived properties can't be edited.", code="ARCHIVED")
        changes = data.model_dump(exclude_unset=True, mode="json")
        await self._check_slugs(changes)
        if "images" in changes:
            self._check_images(changes["images"])
        if "destination" in changes:
            destination = await self._destination(changes.pop("destination"))
            changes.update(
                {
                    "destination_id": destination["_id"],
                    "destination_slug": destination["slug"],
                    "destination_name": destination["name"],
                    "state": destination["state"],
                }
            )
            changes["_touched_reviewed"] = True
        if "address" in changes:
            changes["address"] = {
                **changes["address"],
                "state": changes.get("state", resort["state"]),
            }
        if "location" in changes:
            loc = changes.pop("location")
            changes["location"] = geo_point(loc["lat"], loc["lng"])
            dest = await self.db["destinations"].find_one(
                {"_id": changes.get("destination_id", resort["destination_id"])}
            )
            d_lng, d_lat = dest["location"]["coordinates"]
            changes["distance_from_centre_km"] = haversine_km(d_lat, d_lng, loc["lat"], loc["lng"])
            if changes["distance_from_centre_km"] > 150:
                raise BusinessRuleError(
                    "The map pin is too far from the chosen destination.", code="LOCATION_TOO_FAR"
                )
        touched_reviewed = changes.pop("_touched_reviewed", False) or bool(
            REVIEWED_FIELDS & set(changes)
        )
        if resort["status"] == ResortStatus.PUBLISHED and touched_reviewed:
            # Identity/location changes are re-checked by an admin before going live again.
            changes["status"] = ResortStatus.PENDING_REVIEW
            changes["resubmitted_at"] = now_utc()
        changes["updated_at"] = now_utc()
        updated = await self.resorts.find_one_and_update(
            {"_id": resort_id, "owner_id": owner["_id"]},
            {"$set": changes},
            return_document=ReturnDocument.AFTER,
        )
        return serialize(updated)

    async def completeness(self, resort: dict) -> list[str]:
        missing = []
        if len(resort.get("description") or "") < 50:
            missing.append("A description of at least 50 characters")
        if len(resort.get("images") or []) < 3:
            missing.append("At least 3 photos")
        if not resort.get("location"):
            missing.append("A map location")
        if not (resort.get("address") or {}).get("line1"):
            missing.append("A street address")
        if not resort.get("amenities"):
            missing.append("At least one amenity")
        if not await self.rooms.count_documents(
            {"resort_id": resort["_id"], "status": RoomTypeStatus.ACTIVE}, limit=1
        ):
            missing.append("At least one active room type")
        return missing

    async def submit(self, owner: dict, resort_id: ObjectId) -> dict:
        resort = await self.own_resort(owner, resort_id)
        if resort["status"] not in (ResortStatus.DRAFT, ResortStatus.REJECTED):
            raise BusinessRuleError(
                "Only drafts or properties needing changes can be submitted.", code="INVALID_STATE"
            )
        missing = await self.completeness(resort)
        if missing:
            raise BusinessRuleError(
                "Your listing isn't complete yet.", code="INCOMPLETE", details={"missing": missing}
            )
        updated = await self.resorts.find_one_and_update(
            {"_id": resort_id, "owner_id": owner["_id"], "status": resort["status"]},
            {
                "$set": {
                    "status": ResortStatus.PENDING_REVIEW,
                    "submitted_at": now_utc(),
                    "updated_at": now_utc(),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return serialize(updated)

    async def archive(self, owner: dict, resort_id: ObjectId) -> dict:
        await self.own_resort(owner, resort_id)
        upcoming = await self.bookings.count_documents(
            {
                "resort_id": resort_id,
                "status": {"$in": list(ACTIVE_BOOKING_STATUSES)},
                "check_out": {"$gt": iso(today_ist())},
            },
            limit=1,
        )
        if upcoming:
            raise ConflictError(
                "This property has upcoming bookings. Cancel or complete them first.",
                code="HAS_BOOKINGS",
            )
        updated = await self.resorts.find_one_and_update(
            {"_id": resort_id, "owner_id": owner["_id"]},
            {"$set": {"status": ResortStatus.ARCHIVED, "updated_at": now_utc()}},
            return_document=ReturnDocument.AFTER,
        )
        return serialize(updated)

    # ---------- room types ----------

    async def list_rooms(self, owner: dict, resort_id: ObjectId) -> list[dict]:
        await self.own_resort(owner, resort_id)
        return [
            serialize(r)
            for r in await self.rooms.find({"resort_id": resort_id})
            .sort("base_rate_paise", 1)
            .to_list(50)
        ]

    async def create_room(self, owner: dict, resort_id: ObjectId, data) -> dict:
        resort = await self.own_resort(owner, resort_id)
        if resort["status"] == ResortStatus.ARCHIVED:
            raise BusinessRuleError("Archived properties can't be edited.", code="ARCHIVED")
        doc = data.model_dump(mode="json")
        await self._check_slugs({"amenities": doc["amenities"]})
        self._check_images(doc["images"])
        doc.update(
            {
                "resort_id": resort_id,
                "owner_id": owner["_id"],
                "status": RoomTypeStatus.ACTIVE,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
        )
        doc["_id"] = (await self.rooms.insert_one(doc)).inserted_id
        await self.refresh_starting_price(resort_id)
        return serialize(doc)

    async def update_room(self, owner: dict, room_id: ObjectId, data) -> dict:
        room = await self.own_room(owner, room_id)
        changes = data.model_dump(exclude_unset=True, mode="json")
        if "amenities" in changes:
            await self._check_slugs({"amenities": changes["amenities"]})
        if "images" in changes:
            self._check_images(changes["images"])
        merged = {**room, **changes}
        if (
            not merged["max_adults"]
            <= merged["max_occupancy"]
            <= merged["max_adults"] + merged["max_children"]
        ):
            raise BusinessRuleError("Occupancy limits don't add up.", code="INVALID_OCCUPANCY")
        if "total_units" in changes and changes["total_units"] != room["total_units"]:
            await self._resize_inventory(room, changes["total_units"])
        changes["updated_at"] = now_utc()
        updated = await self.rooms.find_one_and_update(
            {"_id": room_id, "owner_id": owner["_id"]},
            {"$set": changes},
            return_document=ReturnDocument.AFTER,
        )
        await self.refresh_starting_price(room["resort_id"])
        return serialize(updated)

    async def _resize_inventory(self, room: dict, new_total: int) -> None:
        """Change unit count on future nights — but never below what's already booked/blocked."""
        today = iso(today_ist())
        too_full = (
            await self.db["inventory"]
            .find(
                {
                    "room_type_id": room["_id"],
                    "date": {"$gte": today},
                    "$expr": {"$gt": [{"$add": ["$reserved_units", "$blocked_units"]}, new_total]},
                },
                {"date": 1},
            )
            .sort("date", 1)
            .to_list(20)
        )
        if too_full:
            raise ConflictError(
                f"You can't reduce to {new_total} rooms: some nights already have more booked or blocked.",
                code="UNITS_IN_USE",
                details={"dates": [d["date"] for d in too_full]},
            )
        await self.db["inventory"].update_many(
            {
                "room_type_id": room["_id"],
                "date": {"$gte": today},
                "$expr": {"$lte": [{"$add": ["$reserved_units", "$blocked_units"]}, new_total]},
            },
            {"$set": {"total_units": new_total}, "$inc": {"version": 1}},
        )

    # ---------- calendar & pricing ----------

    async def calendar(self, owner: dict, room_id: ObjectId, start: str, end: str) -> dict:
        room = await self.own_room(owner, room_id)
        first, last = self._range(start, end, max_days=92)
        nights = list(iter_nights(first, last + timedelta(days=1)))
        docs = await self.inventory.for_room_types(
            [room_id], iso(first), iso(last + timedelta(days=1))
        )
        inv = {d["date"]: d for d in docs}
        rules = await self.rules.find(
            {"room_type_id": room_id, "is_active": {"$ne": False}}
        ).to_list(200)
        days = []
        for night in nights:
            doc = inv.get(iso(night))
            rate, source = nightly_rate(room, night, doc, rules)
            total = doc["total_units"] if doc else room["total_units"]
            reserved = doc["reserved_units"] if doc else 0
            blocked = doc["blocked_units"] if doc else 0
            days.append(
                {
                    "date": iso(night),
                    "total_units": total,
                    "reserved_units": reserved,
                    "blocked_units": blocked,
                    "available_units": 0
                    if (doc or {}).get("closed")
                    else max(0, total - reserved - blocked),
                    "closed": bool((doc or {}).get("closed")),
                    "rate_paise": rate,
                    "rate_source": source,
                    "price_override_paise": (doc or {}).get("price_override_paise"),
                }
            )
        return {"room_type": serialize(room), "days": days}

    @staticmethod
    def _range(start: str, end: str, max_days: int) -> tuple[date, date]:
        try:
            first, last = parse_date(start), parse_date(end)
        except ValueError as exc:
            raise BusinessRuleError("Use YYYY-MM-DD dates.", code="INVALID_DATES") from exc
        if last < first or (last - first).days >= max_days:
            raise BusinessRuleError(
                f"Choose a range of up to {max_days} days.", code="INVALID_DATES"
            )
        return first, last

    async def update_calendar(self, owner: dict, room_id: ObjectId, data) -> dict:
        room = await self.own_room(owner, room_id)
        first, last = self._range(data.from_date, data.to_date, max_days=366)
        if first < today_ist():
            raise BusinessRuleError("Past dates can't be changed.", code="INVALID_DATES")
        nights = list(iter_nights(first, last + timedelta(days=1)))
        await self.inventory.ensure_nights(room, nights)
        dates = [iso(n) for n in nights]
        conflicts: list[str] = []
        base_filter = {"room_type_id": room_id, "date": {"$in": dates}}

        simple: dict = {}
        if data.price_override_paise is not None:
            simple["price_override_paise"] = data.price_override_paise
        if data.closed is not None:
            simple["closed"] = data.closed
        update: dict = {}
        if simple:
            update["$set"] = simple
        if data.clear_price_override:
            update["$unset"] = {"price_override_paise": ""}
        if update:
            update["$inc"] = {"version": 1}
            await self.db["inventory"].update_many(base_filter, update)

        if data.blocked_units is not None:
            blocked = data.blocked_units
            # Only nights where the block still fits alongside existing bookings are changed.
            await self.db["inventory"].update_many(
                {
                    **base_filter,
                    "$expr": {"$lte": [{"$add": ["$reserved_units", blocked]}, "$total_units"]},
                },
                {"$set": {"blocked_units": blocked}, "$inc": {"version": 1}},
            )
            rejected = (
                await self.db["inventory"]
                .find(
                    {
                        **base_filter,
                        "$expr": {"$gt": [{"$add": ["$reserved_units", blocked]}, "$total_units"]},
                    },
                    {"date": 1},
                )
                .to_list(400)
            )
            conflicts = sorted(d["date"] for d in rejected)
        await audit(
            self.db,
            actor=owner,
            action="calendar.update",
            target_type="room_type",
            target_id=room_id,
            after={**data.model_dump(mode="json", by_alias=True), "conflicts": conflicts},
        )
        return {"updated_nights": len(dates) - len(conflicts), "conflicts": conflicts}

    async def list_rules(self, owner: dict, room_id: ObjectId) -> list[dict]:
        await self.own_room(owner, room_id)
        return [
            serialize(r)
            for r in await self.rules.find({"room_type_id": room_id})
            .sort("start_date", 1)
            .to_list(200)
        ]

    def _rule_doc(self, data) -> dict:
        d = data.model_dump()
        return {
            "name": d["name"],
            "start_date": d["start_date"],
            "end_date": d["end_date"],
            "adjustment": {"type": d["adjustment_type"], "value": d["value"]},
            "days_of_week": d["days_of_week"] or None,
            "priority": d["priority"],
            "is_active": d["is_active"],
        }

    async def create_rule(self, owner: dict, room_id: ObjectId, data) -> dict:
        room = await self.own_room(owner, room_id)
        doc = {
            **self._rule_doc(data),
            "room_type_id": room_id,
            "owner_id": owner["_id"],
            "resort_id": room["resort_id"],
            "created_at": now_utc(),
        }
        doc["_id"] = (await self.rules.insert_one(doc)).inserted_id
        return serialize(doc)

    async def update_rule(self, owner: dict, rule_id: ObjectId, data) -> dict:
        updated = await self.rules.find_one_and_update(
            {"_id": rule_id, "owner_id": owner["_id"]},
            {"$set": {**self._rule_doc(data), "updated_at": now_utc()}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            raise NotFoundError("Rule not found.")
        return serialize(updated)

    async def delete_rule(self, owner: dict, rule_id: ObjectId) -> None:
        result = await self.rules.delete_one({"_id": rule_id, "owner_id": owner["_id"]})
        if not result.deleted_count:
            raise NotFoundError("Rule not found.")

    # ---------- reservations ----------

    async def list_bookings(
        self,
        owner: dict,
        *,
        resort_id=None,
        status=None,
        start=None,
        end=None,
        page=1,
        page_size=20,
    ):
        query: dict = {"owner_id": owner["_id"], "status": {"$ne": BookingStatus.EXPIRED}}
        if resort_id:
            query["resort_id"] = resort_id
        if status:
            query["status"] = status
        if start or end:
            query["check_in"] = {
                **({"$gte": start} if start else {}),
                **({"$lte": end} if end else {}),
            }
        total = await self.bookings.count_documents(query)
        docs = (
            await self.bookings.find(query)
            .sort([("check_in", 1), ("_id", 1)])
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        return {
            "items": [owner_booking_out(b) for b in docs],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": -(-total // page_size) if total else 0,
        }

    # ---------- enquiries ----------

    async def enquiries(self, owner: dict, status: str | None) -> list[dict]:
        query: dict = {"owner_id": owner["_id"]}
        if status:
            query["status"] = status
        docs = await self.db["enquiries"].find(query).sort("created_at", -1).to_list(100)
        names = {
            r["_id"]: r["name"]
            for r in await self.resorts.find({"owner_id": owner["_id"]}, {"name": 1}).to_list(100)
        }
        return [{**serialize(e), "resort_name": names.get(e["resort_id"])} for e in docs]

    async def update_enquiry(self, owner: dict, enquiry_id: ObjectId, status: str) -> dict:
        updated = await self.db["enquiries"].find_one_and_update(
            {"_id": enquiry_id, "owner_id": owner["_id"]},
            {"$set": {"status": status, "updated_at": now_utc()}},
            return_document=ReturnDocument.AFTER,
        )
        if not updated:
            raise NotFoundError("Enquiry not found.")
        return serialize(updated)

    # ---------- dashboard ----------

    async def dashboard(self, owner: dict) -> dict:
        today = today_ist()
        horizon = today + timedelta(days=30)
        resorts = await self.resorts.find(
            {"owner_id": owner["_id"]}, {"status": 1, "name": 1}
        ).to_list(100)
        by_status: dict[str, int] = {}
        for r in resorts:
            by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        live_ids = [r["_id"] for r in resorts if r["status"] == ResortStatus.PUBLISHED]

        arrivals = (
            await self.bookings.find(
                {
                    "owner_id": owner["_id"],
                    "status": {"$in": [BookingStatus.CONFIRMED, BookingStatus.PENDING_OWNER]},
                    "check_in": {"$gte": iso(today), "$lt": iso(horizon)},
                }
            )
            .sort("check_in", 1)
            .to_list(10)
        )

        # Occupancy over the next 30 nights across active rooms at live resorts.
        rooms = await self.rooms.find(
            {"resort_id": {"$in": live_ids}, "status": RoomTypeStatus.ACTIVE}
        ).to_list(None)
        inv = await self.inventory.for_room_types(
            [r["_id"] for r in rooms], iso(today), iso(horizon)
        )
        inv_map = {(d["room_type_id"], d["date"]): d for d in inv}
        sellable = sold = 0
        for room in rooms:
            for night in iter_nights(today, horizon):
                doc = inv_map.get((room["_id"], iso(night)))
                total = doc["total_units"] if doc else room["total_units"]
                blocked = doc["blocked_units"] if doc else 0
                sellable += max(0, total - blocked) if not (doc or {}).get("closed") else 0
                sold += doc["reserved_units"] if doc else 0
        month_start = today.replace(day=1)
        revenue_rows = await (
            await self.bookings.aggregate(
                [
                    {
                        "$match": {
                            "owner_id": owner["_id"],
                            "status": {"$in": ["confirmed", "completed", "pending_owner"]},
                            "check_in": {"$gte": iso(month_start)},
                        }
                    },
                    {
                        "$group": {
                            "_id": None,
                            "gross": {"$sum": "$price.taxable_paise"},
                            "n": {"$sum": 1},
                        }
                    },
                ]
            )
        ).to_list(1)
        pending = await self.bookings.count_documents(
            {"owner_id": owner["_id"], "status": BookingStatus.PENDING_OWNER}
        )
        open_enquiries = await self.db["enquiries"].count_documents(
            {"owner_id": owner["_id"], "status": "open"}
        )
        platform = await get_platform_settings(self.db)
        return {
            "resorts_by_status": by_status,
            "upcoming_arrivals": [owner_booking_out(b) for b in arrivals],
            "occupancy_next_30_days_pct": round(100 * sold / sellable, 1) if sellable else 0.0,
            "room_nights_sold_next_30_days": sold,
            "revenue_this_month_paise": revenue_rows[0]["gross"] if revenue_rows else 0,
            "bookings_this_month": revenue_rows[0]["n"] if revenue_rows else 0,
            "pending_confirmations": pending,
            "open_enquiries": open_enquiries,
            "owner_confirmation_hours": platform["owner_confirmation_hours"],
        }


def owner_booking_out(booking: dict) -> dict:
    """What a property sees about a reservation. Guest contact details are shown only around the
    stay (from 30 days before check-in until 90 days after check-out) — privacy by default."""
    from app.services.booking_service import booking_out

    out = booking_out(booking, include_preview=False)
    for private in ("payment", "coupon", "status_history"):
        out.pop(private, None)
    today = today_ist()
    visible_from = parse_date(booking["check_in"]) - timedelta(days=30)
    visible_until = parse_date(booking["check_out"]) + timedelta(days=90)
    if not visible_from <= today <= visible_until:
        details = out["guest_details"]
        out["guest_details"] = {
            "name": details["name"],
            "email": None,
            "phone": None,
            "age": None,
            "nationality": details.get("nationality"),
            "arrival_time": details.get("arrival_time"),
            "contact_hidden_until": iso(visible_from) if today < visible_from else None,
        }
    return out
