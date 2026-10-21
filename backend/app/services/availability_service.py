"""Stay validation, availability and quotes (prices computed only on the server)."""

import math
from datetime import date, timedelta

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import BusinessRuleError, NotFoundError
from app.models.enums import ResortStatus, RoomTypeStatus
from app.repositories.inventory import InventoryRepository
from app.repositories.resorts import ResortRepository, RoomTypeRepository
from app.services.mappers import resort_card
from app.services.platform_settings import get_platform_settings
from app.services.pricing import Guests, occupancy_problem, quote
from app.utils.dates import iso, iter_nights, now_utc, parse_date, today_ist


class AvailabilityService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.resorts = ResortRepository(db)
        self.room_types = RoomTypeRepository(db)
        self.inventory = InventoryRepository(db)

    # ---------- validation ----------

    async def stay_nights(
        self, check_in: str, check_out: str, settings: dict | None = None
    ) -> list[date]:
        settings = settings or await get_platform_settings(self.db)
        try:
            start, end = parse_date(check_in), parse_date(check_out)
        except ValueError as exc:
            raise BusinessRuleError(
                "Dates must be valid YYYY-MM-DD dates.", code="INVALID_DATES"
            ) from exc
        today = today_ist()
        if end <= start:
            raise BusinessRuleError("Check-out must be after check-in.", code="INVALID_DATES")
        if start < today:
            raise BusinessRuleError("Check-in can't be in the past.", code="INVALID_DATES")
        if start > today + timedelta(days=settings["max_advance_days"]):
            raise BusinessRuleError(
                f"Bookings open up to {settings['max_advance_days']} days ahead.",
                code="INVALID_DATES",
            )
        nights = list(iter_nights(start, end))
        if len(nights) > settings["max_nights"]:
            raise BusinessRuleError(
                f"Stays can be up to {settings['max_nights']} nights.", code="INVALID_DATES"
            )
        return nights

    @staticmethod
    def guests_from(adults: int, children: int, child_ages: list[int] | None) -> Guests:
        if child_ages is not None and len(child_ages) != children:
            raise BusinessRuleError(
                "Please give an age for each child.", code="CHILD_AGES_REQUIRED"
            )
        return Guests(adults, children, tuple(child_ages) if child_ages is not None else None)

    # ---------- data loading ----------

    async def _context(self, room_type_ids: list[ObjectId], nights: list[date]):
        start, end = iso(nights[0]), iso(nights[-1] + timedelta(days=1))
        inventory = await self.inventory.for_room_types(room_type_ids, start, end)
        inv = {(d["room_type_id"], d["date"]): d for d in inventory}
        rules_cursor = self.db["rate_rules"].find(
            {
                "room_type_id": {"$in": room_type_ids},
                "is_active": {"$ne": False},
                "start_date": {"$lt": end},
                "end_date": {"$gte": start},
            }
        )
        rules: dict[ObjectId, list[dict]] = {}
        for rule in await rules_cursor.to_list(None):
            rules.setdefault(rule["room_type_id"], []).append(rule)
        return inv, rules

    @staticmethod
    def units_available(room: dict, inv: dict, nights: list[date]) -> int:
        available = math.inf
        for night in nights:
            doc = inv.get((room["_id"], iso(night)))
            if doc is None:
                available = min(available, room["total_units"])
            elif doc.get("closed"):
                return 0
            else:
                available = min(
                    available, doc["total_units"] - doc["reserved_units"] - doc["blocked_units"]
                )
        return max(0, int(available)) if available != math.inf else 0

    # ---------- coupons ----------

    async def validate_coupon(
        self, code: str | None, resort: dict, subtotal_hint: int | None, user_id=None
    ) -> dict | None:
        if not code:
            return None
        coupon = await self.db["coupons"].find_one(
            {"code": code.strip().upper(), "is_active": True}
        )
        today = iso(today_ist())
        problem = None
        if not coupon:
            problem = "This coupon code isn't valid."
        elif coupon.get("valid_from") and today < coupon["valid_from"]:
            problem = "This coupon isn't active yet."
        elif coupon.get("valid_to") and today > coupon["valid_to"]:
            problem = "This coupon has expired."
        elif coupon.get("resort_ids") and resort["_id"] not in coupon["resort_ids"]:
            problem = "This coupon can't be used at this property."
        elif (
            coupon.get("usage_limit") is not None
            and coupon.get("used_count", 0) >= coupon["usage_limit"]
        ):
            problem = "This coupon has been fully redeemed."
        elif subtotal_hint is not None and subtotal_hint < coupon.get("min_subtotal_paise", 0):
            problem = "Your booking is below this coupon's minimum amount."
        elif user_id is not None and coupon.get("per_user_limit"):
            used = await self.db["coupon_redemptions"].count_documents(
                {"coupon_id": coupon["_id"], "user_id": user_id}
            )
            if used >= coupon["per_user_limit"]:
                problem = "You've already used this coupon."
        if problem:
            raise BusinessRuleError(problem, code="COUPON_INVALID")
        return coupon

    # ---------- quotes ----------

    async def quote_room(
        self,
        *,
        room_type_id: ObjectId,
        check_in: str,
        check_out: str,
        rooms: int,
        adults: int,
        children: int,
        child_ages: list[int] | None,
        coupon_code: str | None = None,
        user_id=None,
    ) -> dict:
        """Validate a stay request and price it. Raises a clear error for every problem."""
        settings = await get_platform_settings(self.db)
        room = await self.room_types.by_id(room_type_id, {"status": RoomTypeStatus.ACTIVE})
        if not room:
            raise NotFoundError("Room type not found.")
        resort = await self.resorts.by_id(room["resort_id"], {"status": ResortStatus.PUBLISHED})
        if not resort:
            raise NotFoundError("Resort not found.")
        nights = await self.stay_nights(check_in, check_out, settings)
        if rooms > settings["max_rooms_per_booking"]:
            raise BusinessRuleError(
                f"Up to {settings['max_rooms_per_booking']} rooms per booking.",
                code="TOO_MANY_ROOMS",
            )
        guests = self.guests_from(adults, children, child_ages)
        child_free_age = resort["policies"].get("child_free_age", 5)
        problem = occupancy_problem(room, rooms, guests, child_free_age)
        if problem:
            raise BusinessRuleError(problem, code="OCCUPANCY_EXCEEDED")

        inv, rules = await self._context([room["_id"]], nights)
        available = self.units_available(room, inv, nights)
        price_args = {
            "room": room,
            "nights": nights,
            "rooms": rooms,
            "guests": guests,
            "child_free_age": child_free_age,
            "inventory_by_date": {d: doc for (_, d), doc in inv.items()},
            "rules": rules.get(room["_id"], []),
            "settings": settings,
        }
        coupon = None
        if coupon_code:
            subtotal = quote(**price_args)["room_subtotal_paise"]
            coupon = await self.validate_coupon(coupon_code, resort, subtotal, user_id)
        price = quote(**price_args, coupon=coupon)
        return {
            "resort": resort,
            "room": room,
            "nights": nights,
            "guests": guests,
            "coupon": coupon,
            "available_units": available,
            "available": available >= rooms,
            "price": price,
            "settings": settings,
        }

    async def resort_availability(
        self, resort_id: ObjectId, *, check_in, check_out, rooms, adults, children, child_ages
    ):
        resort = await self.resorts.by_id(resort_id, {"status": ResortStatus.PUBLISHED})
        if not resort:
            raise NotFoundError("Resort not found.")
        settings = await get_platform_settings(self.db)
        nights = await self.stay_nights(check_in, check_out, settings)
        guests = self.guests_from(adults, children, child_ages)
        child_free_age = resort["policies"].get("child_free_age", 5)
        room_types = await self.room_types.active_for_resort(resort["_id"])
        inv, rules = await self._context([r["_id"] for r in room_types], nights)
        results = []
        for room in room_types:
            problem = occupancy_problem(room, rooms, guests, child_free_age)
            units = self.units_available(room, inv, nights)
            price = None
            if not problem:
                price = quote(
                    room=room,
                    nights=nights,
                    rooms=rooms,
                    guests=guests,
                    child_free_age=child_free_age,
                    inventory_by_date={
                        d: doc for (rid, d), doc in inv.items() if rid == room["_id"]
                    },
                    rules=rules.get(room["_id"], []),
                    settings=settings,
                )
            results.append(
                {
                    "room_type_id": str(room["_id"]),
                    "name": room["name"],
                    "available_units": units,
                    "fits": problem is None,
                    "unavailable_reason": problem
                    or (None if units >= rooms else "Sold out for these dates."),
                    "bookable": problem is None and units >= rooms,
                    "price": price,
                }
            )
        return {
            "check_in": check_in,
            "check_out": check_out,
            "nights": len(nights),
            "rooms": rooms,
            "adults": adults,
            "children": children,
            "room_types": results,
            "checked_at": now_utc(),
        }

    # ---------- search with dates ----------

    async def search_with_dates(self, p, query: dict, applied: dict, facets: dict, respond):
        settings = await get_platform_settings(self.db)
        nights = await self.stay_nights(p.check_in, p.check_out, settings)
        candidates = await self.resorts.search_all(
            query, "recommended" if p.sort.startswith("price") else p.sort
        )
        resort_ids = [r["_id"] for r in candidates]
        room_types = await self.room_types.active_for_resorts(resort_ids)
        guests = Guests(p.adults, p.children, None)  # ages unknown in search: count every child
        inv, rules = (
            await self._context([r["_id"] for r in room_types], nights) if room_types else ({}, {})
        )

        by_resort: dict[ObjectId, list[dict]] = {}
        for room in room_types:
            by_resort.setdefault(room["resort_id"], []).append(room)

        priced = []
        for resort in candidates:
            best = None
            for room in by_resort.get(resort["_id"], []):
                child_free_age = 5  # irrelevant here: without ages every child is counted
                if occupancy_problem(room, p.rooms, guests, child_free_age):
                    continue
                if self.units_available(room, inv, nights) < p.rooms:
                    continue
                price = quote(
                    room=room,
                    nights=nights,
                    rooms=p.rooms,
                    guests=guests,
                    child_free_age=child_free_age,
                    inventory_by_date={
                        d: doc for (rid, d), doc in inv.items() if rid == room["_id"]
                    },
                    rules=rules.get(room["_id"], []),
                    settings=settings,
                )
                if best is None or price["total_paise"] < best[1]["total_paise"]:
                    best = (room, price)
            available = best is not None
            if not available and p.available_only is not False:
                continue
            card_price = None
            if best:
                room, price = best
                card_price = {
                    "kind": "stay",
                    "per_night_paise": price["avg_per_night_paise"],
                    "total_paise": price["total_paise"],
                    "nights": len(nights),
                    "rooms": p.rooms,
                    "taxes_included": True,
                    "meal_plan": room["meal_plan"],
                    "room_type_name": room["name"],
                }
            priced.append((resort, card_price, available))

        def within_budget(item):
            _, price, _ = item
            if price is None:
                return p.min_price is None and p.max_price is None
            amount = price["total_paise"] if p.price_basis == "total" else price["per_night_paise"]
            if p.min_price is not None and amount < p.min_price * 100:
                return False
            return not (p.max_price is not None and amount > p.max_price * 100)

        priced = [item for item in priced if within_budget(item)]
        if p.sort in ("price_asc", "price_desc"):
            missing = math.inf if p.sort == "price_asc" else -math.inf
            priced.sort(
                key=lambda item: item[1]["total_paise"] if item[1] else missing,
                reverse=p.sort == "price_desc",
            )
        total = len(priced)
        start = (p.page - 1) * p.page_size
        items = [
            resort_card(resort, price=price, available=available)
            for resort, price, available in priced[start : start + p.page_size]
        ]
        return respond(items, p, total, applied, facets, nights=len(nights))
