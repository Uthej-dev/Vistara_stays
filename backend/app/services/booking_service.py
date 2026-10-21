"""The booking engine: holds, confirmation, cancellation, expiry and completion.

Double-booking protection (docs/06-booking-engine.md §3):
1. Each night is reserved with a conditional `$inc` that only matches while a room is free.
2. All nights + the booking insert run in ONE MongoDB transaction, so a stay is all-or-nothing.
3. Status changes are conditional on the current status, so racing actions can't both win, and
   `inventory_released` guarantees rooms are given back exactly once.
"""

import hashlib
import json
import logging
import secrets
from datetime import timedelta

from bson import ObjectId
from pymongo.asynchronous.client_session import AsyncClientSession
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.models.enums import BookingMode, BookingStatus, PaymentStatus, Role
from app.repositories.inventory import InventoryRepository
from app.services.audit_service import audit
from app.services.availability_service import AvailabilityService
from app.services.email_service import EmailService
from app.utils.dates import iso, now_utc, parse_date, today_ist
from app.utils.money import format_inr, percent_of
from app.utils.text import serialize

logger = logging.getLogger("app.bookings")

REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion


def new_booking_ref() -> str:
    return "VS-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def request_hash(body: dict) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()


def refund_for(booking: dict, today, *, full: bool = False) -> dict:
    """What a cancellation today would refund, from the policy saved WITH the booking."""
    paid = booking["price"]["total_paise"] if booking["payment_status"] == PaymentStatus.PAID else 0
    days_before = (parse_date(booking["check_in"]) - today).days
    if full:
        return {"refund_pct": 100, "refund_paise": paid, "days_before_check_in": days_before}
    pct = 0
    for tier in booking["policy_snapshot"]["cancellation_policy"]["tiers"]:  # sorted descending
        if days_before >= tier["days_before_check_in"]:
            pct = tier["refund_pct"]
            break
    # The platform service fee isn't refunded on guest cancellations.
    refundable = max(0, paid - booking["price"].get("service_fee_paise", 0))
    return {
        "refund_pct": pct,
        "refund_paise": percent_of(refundable, pct),
        "days_before_check_in": days_before,
    }


class BookingService:
    def __init__(self, db: AsyncDatabase, email: EmailService | None = None, settings=None):
        self.db = db
        self.client = db.client
        self.bookings = db["bookings"]
        self.inventory = InventoryRepository(db)
        self.availability = AvailabilityService(db)
        self.email = email
        self.settings = settings

    async def _txn(self, callback):
        """Run `callback(session)` in a transaction (retried automatically on transient errors)."""
        async with self.client.start_session() as session:
            return await session.with_transaction(callback)

    # ---------- create (hold) ----------

    async def create(
        self, user: dict, body, idempotency_key: str, *, require_verified: bool
    ) -> tuple[dict, bool]:
        """Returns (booking, created). A repeated request with the same key returns the original."""
        if user["role"] != Role.CUSTOMER:
            raise ForbiddenError("Bookings are made from customer accounts.")
        if require_verified and not user.get("email_verified"):
            raise ForbiddenError(
                "Please verify your email address before booking.", code="EMAIL_NOT_VERIFIED"
            )

        payload = body.model_dump(mode="json")
        fingerprint = request_hash(payload)
        existing = await self.bookings.find_one(
            {"user_id": user["_id"], "idempotency_key": idempotency_key}
        )
        if existing:
            return self._replay(existing, fingerprint), False

        room_type_id = ObjectId(body.room_type_id)
        await self.release_expired_holds(room_type_ids=[room_type_id])
        q = await self.availability.quote_room(
            room_type_id=room_type_id,
            check_in=body.check_in,
            check_out=body.check_out,
            rooms=body.rooms,
            adults=body.adults,
            children=body.children,
            child_ages=body.child_ages,
            coupon_code=body.coupon_code,
            user_id=user["_id"],
        )
        if not q["available"]:
            raise ConflictError(
                "Sorry — this room is no longer available for your dates.", code="ROOM_UNAVAILABLE"
            )

        resort, room, nights, price, coupon = (
            q["resort"],
            q["room"],
            q["nights"],
            q["price"],
            q["coupon"],
        )
        now = now_utc()
        booking = {
            "booking_ref": new_booking_ref(),
            "user_id": user["_id"],
            "resort_id": resort["_id"],
            "room_type_id": room["_id"],
            "owner_id": resort["owner_id"],
            "check_in": body.check_in,
            "check_out": body.check_out,
            "nights": len(nights),
            "night_dates": [iso(n) for n in nights],
            "rooms": body.rooms,
            "guests": {
                "adults": body.adults,
                "children": body.children,
                "child_ages": body.child_ages,
            },
            "guest_details": body.guest_details.model_dump(),
            "special_requests": body.special_requests,
            "status": BookingStatus.PENDING_PAYMENT,
            "payment_status": PaymentStatus.UNPAID,
            "hold_expires_at": now + timedelta(minutes=q["settings"]["hold_minutes"]),
            "inventory_released": False,
            "price": price,
            "policy_snapshot": {
                "cancellation_policy": resort["policies"]["cancellation_policy"],
                "check_in_time": resort["policies"]["check_in_time"],
                "check_out_time": resort["policies"]["check_out_time"],
                "child_free_age": resort["policies"].get("child_free_age", 5),
                "meal_plan": room["meal_plan"],
                "booking_mode": resort.get("booking_mode", BookingMode.INSTANT),
            },
            "resort_snapshot": {
                "name": resort["name"],
                "slug": resort["slug"],
                "destination_name": resort["destination_name"],
                "state": resort["state"],
                "cover": (resort.get("images") or [None])[0],
                "room_type_name": room["name"],
                "is_sample": resort.get("is_sample", False),
                "address": resort.get("address"),
                "contact": resort.get("contact"),
            },
            "coupon": {"code": coupon["code"], "id": coupon["_id"]} if coupon else None,
            "idempotency_key": idempotency_key,
            "request_hash": fingerprint,
            "status_history": [
                {"status": BookingStatus.PENDING_PAYMENT, "at": now, "by": "customer"}
            ],
            "is_sample": False,
            "created_at": now,
            "updated_at": now,
        }

        # Create missing night counters first (idempotent), so the transaction only updates.
        await self.inventory.ensure_nights(room, nights)

        async def reserve_and_insert(session: AsyncClientSession):
            await self.inventory.reserve(room["_id"], nights, body.rooms, session)
            if coupon:
                await self._redeem_coupon(coupon, user["_id"], booking, session)
            await self.bookings.insert_one(booking, session=session)

        for _attempt in range(3):
            try:
                await self._txn(reserve_and_insert)
                break
            except DuplicateKeyError as exc:
                if "idempotency" in str(exc):
                    # Two identical submissions raced; the other one won. Return it.
                    winner = await self.bookings.find_one(
                        {"user_id": user["_id"], "idempotency_key": idempotency_key}
                    )
                    return self._replay(winner, fingerprint), False
                booking["booking_ref"] = new_booking_ref()  # astronomically rare ref collision
        else:
            raise ConflictError("Please try again.", code="BOOKING_RETRY")
        logger.info(
            "Booking held", extra={"booking_ref": booking["booking_ref"], "nights": len(nights)}
        )
        return booking, True

    def _replay(self, existing: dict, fingerprint: str) -> dict:
        if existing["request_hash"] != fingerprint:
            raise ConflictError(
                "This Idempotency-Key was already used for a different booking request.",
                code="IDEMPOTENCY_KEY_REUSED",
            )
        return existing

    async def _redeem_coupon(self, coupon: dict, user_id, booking: dict, session) -> None:
        limit_filter = (
            {"used_count": {"$lt": coupon["usage_limit"]}}
            if coupon.get("usage_limit") is not None
            else {}
        )
        result = await self.db["coupons"].update_one(
            {"_id": coupon["_id"], "is_active": True, **limit_filter},
            {"$inc": {"used_count": 1}},
            session=session,
        )
        if result.modified_count == 0:
            raise BusinessRuleError(
                "This coupon has just been fully redeemed.", code="COUPON_INVALID"
            )
        await self.db["coupon_redemptions"].insert_one(
            {
                "coupon_id": coupon["_id"],
                "user_id": user_id,
                "booking_ref": booking["booking_ref"],
                "at": now_utc(),
            },
            session=session,
        )

    # ---------- reads ----------

    async def get_for_user(self, user: dict, booking_id: ObjectId) -> dict:
        booking = await self.bookings.find_one({"_id": booking_id, "user_id": user["_id"]})
        if not booking:
            raise NotFoundError("Booking not found.")
        return await self.refresh_state(booking)

    async def list_for_user(self, user: dict, scope: str, page: int, page_size: int) -> dict:
        await self.complete_stays(user_id=user["_id"])
        await self.release_expired_holds(user_id=user["_id"])
        today = iso(today_ist())
        query: dict = {"user_id": user["_id"]}
        if scope == "upcoming":
            query |= {
                "status": {"$in": ["pending_payment", "pending_owner", "confirmed"]},
                "check_out": {"$gt": today},
            }
            sort = [("check_in", 1), ("_id", 1)]
        elif scope == "past":
            query |= {"status": {"$in": ["completed", "no_show"]}}
            sort = [("check_in", -1), ("_id", -1)]
        elif scope == "cancelled":
            query |= {"status": {"$in": ["cancelled", "rejected", "expired"]}}
            sort = [("created_at", -1), ("_id", -1)]
        else:
            sort = [("created_at", -1), ("_id", -1)]
        total = await self.bookings.count_documents(query)
        docs = (
            await self.bookings.find(query)
            .sort(sort)
            .skip((page - 1) * page_size)
            .limit(page_size)
            .to_list(page_size)
        )
        return {
            "items": docs,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": -(-total // page_size) if total else 0,
        }

    async def refresh_state(self, booking: dict) -> dict:
        """Apply lazy transitions (hold expiry, completion) before showing a booking."""
        if (
            booking["status"] == BookingStatus.PENDING_PAYMENT
            and booking["hold_expires_at"] <= now_utc()
        ):
            await self.expire(booking["_id"])
        elif booking["status"] == BookingStatus.CONFIRMED and booking["check_out"] <= iso(
            today_ist()
        ):
            await self.complete_stays(booking_id=booking["_id"])
        else:
            return booking
        return await self.bookings.find_one({"_id": booking["_id"]})

    # ---------- transitions ----------

    async def _transition(
        self,
        booking_id: ObjectId,
        from_statuses: list[str],
        to_status: str,
        *,
        by: str,
        release: bool = False,
        extra: dict | None = None,
        session=None,
    ) -> dict | None:
        """Conditionally move a booking between statuses; optionally give its rooms back.
        Returns the updated booking, or None if it wasn't in an allowed status (lost a race)."""
        query: dict = {"_id": booking_id, "status": {"$in": from_statuses}}
        if release:
            query["inventory_released"] = False
        now = now_utc()
        updated = await self.bookings.find_one_and_update(
            query,
            {
                "$set": {
                    "status": to_status,
                    "updated_at": now,
                    **({"inventory_released": True} if release else {}),
                    **(extra or {}),
                },
                "$push": {"status_history": {"status": to_status, "at": now, "by": by}},
            },
            return_document=True,
            session=session,
        )
        if updated and release:
            await self.inventory.release(
                updated["room_type_id"], updated["night_dates"], updated["rooms"], session
            )
        return updated

    async def expire(self, booking_id: ObjectId) -> None:
        async def run(session):
            booking = await self._transition(
                booking_id,
                [BookingStatus.PENDING_PAYMENT],
                BookingStatus.EXPIRED,
                by="system",
                release=True,
                session=session,
            )
            if booking and booking.get("coupon"):
                await self._restore_coupon(booking, session)

        await self._txn(run)

    async def _restore_coupon(self, booking: dict, session) -> None:
        deleted = await self.db["coupon_redemptions"].delete_one(
            {"booking_ref": booking["booking_ref"]}, session=session
        )
        if deleted.deleted_count:
            await self.db["coupons"].update_one(
                {"_id": booking["coupon"]["id"]}, {"$inc": {"used_count": -1}}, session=session
            )

    async def release_expired_holds(
        self, *, room_type_ids=None, user_id=None, limit: int = 200
    ) -> int:
        query: dict = {
            "status": BookingStatus.PENDING_PAYMENT,
            "hold_expires_at": {"$lte": now_utc()},
        }
        if room_type_ids:
            query["room_type_id"] = {"$in": room_type_ids}
        if user_id:
            query["user_id"] = user_id
        expired = await self.bookings.find(query, {"_id": 1}).limit(limit).to_list(limit)
        for doc in expired:
            await self.expire(doc["_id"])
        return len(expired)

    async def complete_stays(self, *, user_id=None, booking_id=None) -> int:
        """Confirmed stays whose check-out date has arrived become 'completed'."""
        query: dict = {"status": BookingStatus.CONFIRMED, "check_out": {"$lte": iso(today_ist())}}
        if user_id:
            query["user_id"] = user_id
        if booking_id:
            query["_id"] = booking_id
        now = now_utc()
        result = await self.bookings.update_many(
            query,
            {
                "$set": {"status": BookingStatus.COMPLETED, "updated_at": now},
                "$push": {
                    "status_history": {"status": BookingStatus.COMPLETED, "at": now, "by": "system"}
                },
            },
        )
        return result.modified_count

    async def auto_reject_stale_requests(self, hours: int) -> int:
        """Request-mode bookings the owner didn't answer in time are declined with a full refund."""
        cutoff = now_utc() - timedelta(hours=hours)
        stale = await self.bookings.find(
            {"status": BookingStatus.PENDING_OWNER, "paid_at": {"$lte": cutoff}}, {"_id": 1}
        ).to_list(100)
        for doc in stale:
            await self.owner_reject(
                doc["_id"], actor=None, reason="The property didn't respond in time."
            )
        return len(stale)

    async def mark_paid(self, booking: dict, payment: dict) -> dict:
        """Payment captured (simulated or verified by the provider) → confirm or await owner."""
        if (
            booking["status"] == BookingStatus.PENDING_PAYMENT
            and booking["hold_expires_at"] <= now_utc()
        ):
            await self.expire(booking["_id"])
            raise ConflictError(
                "Your hold expired before payment completed. You haven't been charged.",
                code="HOLD_EXPIRED",
            )
        instant = (
            booking["policy_snapshot"].get("booking_mode", BookingMode.INSTANT)
            == BookingMode.INSTANT
        )
        target = BookingStatus.CONFIRMED if instant else BookingStatus.PENDING_OWNER
        now = now_utc()

        async def run(session):
            updated = await self._transition(
                booking["_id"],
                [BookingStatus.PENDING_PAYMENT],
                target,
                by="payment",
                extra={"payment_status": PaymentStatus.PAID, "paid_at": now, "payment": payment},
                session=session,
            )
            if not updated:
                return None
            await self.db["payments"].update_one(
                {"booking_id": booking["_id"], "provider": payment["provider"]},
                {
                    "$set": {
                        **payment,
                        "booking_id": booking["_id"],
                        "user_id": booking["user_id"],
                        "amount_paise": booking["price"]["total_paise"],
                        "status": "captured",
                        "updated_at": now,
                    },
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
                session=session,
            )
            return updated

        updated = await self._txn(run)
        if not updated:
            current = await self.bookings.find_one({"_id": booking["_id"]})
            if current["payment_status"] == PaymentStatus.PAID:
                return current  # duplicate confirmation (e.g. webhook retry) — already done
            raise ConflictError("This booking can no longer be paid.", code="INVALID_STATE")
        await self._notify_booking(updated, "confirmed" if instant else "requested")
        return updated

    async def cancel(self, booking: dict, *, actor: dict, reason: str | None) -> dict:
        today = today_ist()
        by_customer = actor["role"] == Role.CUSTOMER
        status = booking["status"]
        if status not in (
            BookingStatus.PENDING_PAYMENT,
            BookingStatus.PENDING_OWNER,
            BookingStatus.CONFIRMED,
        ):
            raise BusinessRuleError("This booking can't be cancelled.", code="NOT_CANCELLABLE")
        if (
            by_customer
            and parse_date(booking["check_in"]) <= today
            and status == BookingStatus.CONFIRMED
        ):
            raise BusinessRuleError(
                "Cancellations close on the day of check-in. Please contact the property.",
                code="NOT_CANCELLABLE",
            )
        refund = refund_for(
            booking, today, full=not by_customer or status == BookingStatus.PENDING_OWNER
        )
        payment_status = booking["payment_status"]
        if booking["payment_status"] == PaymentStatus.PAID:
            payment_status = self._refund_status(booking, refund["refund_paise"])
        cancellation = {
            "cancelled_at": now_utc(),
            "by": actor["role"],
            "actor_id": actor["_id"],
            "reason": reason,
            **refund,
            "refund_status": "not_applicable"
            if not refund["refund_paise"]
            else ("simulated_refund" if self._is_simulated(booking) else "pending"),
        }

        async def run(session):
            updated = await self._transition(
                booking["_id"],
                [status],
                BookingStatus.CANCELLED,
                by=actor["role"],
                release=True,
                extra={"cancellation": cancellation, "payment_status": payment_status},
                session=session,
            )
            if not updated:
                return None
            if updated.get("coupon") and status == BookingStatus.PENDING_PAYMENT:
                await self._restore_coupon(updated, session)
            if not by_customer:
                await audit(
                    self.db,
                    actor=actor,
                    action="booking.cancel",
                    target_type="booking",
                    target_id=booking["_id"],
                    reason=reason,
                    session=session,
                )
            return updated

        updated = await self._txn(run)
        if not updated:
            raise ConflictError(
                "This booking changed while you were cancelling it. Please refresh.",
                code="INVALID_STATE",
            )
        if booking["payment_status"] == PaymentStatus.PAID:
            await self._notify_booking(updated, "cancelled")
        return updated

    def _is_simulated(self, booking: dict) -> bool:
        return (booking.get("payment") or {}).get("provider") == "simulated"

    def _refund_status(self, booking: dict, refund_paise: int) -> str:
        if refund_paise == 0:
            return PaymentStatus.PAID
        if self._is_simulated(booking):
            # Simulated payments: nothing real to refund, so it completes immediately (labelled).
            full = refund_paise >= booking["price"]["total_paise"]
            return PaymentStatus.REFUNDED if full else PaymentStatus.PARTIALLY_REFUNDED
        return PaymentStatus.REFUND_PENDING  # real refunds complete only when the provider confirms

    # ---------- owner actions (used by the owner dashboard) ----------

    async def owner_confirm(self, booking_id: ObjectId, actor: dict) -> dict:
        updated = await self._transition(
            booking_id, [BookingStatus.PENDING_OWNER], BookingStatus.CONFIRMED, by="owner"
        )
        if not updated:
            raise BusinessRuleError(
                "Only bookings awaiting your confirmation can be confirmed.", code="INVALID_STATE"
            )
        await self._notify_booking(updated, "confirmed")
        return updated

    async def owner_reject(self, booking_id: ObjectId, actor: dict | None, reason: str) -> dict:
        booking = await self.bookings.find_one({"_id": booking_id})
        refund = refund_for(booking, today_ist(), full=True)
        cancellation = {
            "cancelled_at": now_utc(),
            "by": actor["role"] if actor else "system",
            "actor_id": actor["_id"] if actor else None,
            "reason": reason,
            **refund,
            "refund_status": "simulated_refund" if self._is_simulated(booking) else "pending",
        }

        async def run(session):
            updated = await self._transition(
                booking_id,
                [BookingStatus.PENDING_OWNER],
                BookingStatus.REJECTED,
                by=cancellation["by"],
                release=True,
                extra={
                    "cancellation": cancellation,
                    "payment_status": self._refund_status(booking, refund["refund_paise"]),
                },
                session=session,
            )
            if updated:
                await audit(
                    self.db,
                    actor=actor,
                    action="booking.reject",
                    target_type="booking",
                    target_id=booking_id,
                    reason=reason,
                    session=session,
                )
            return updated

        updated = await self._txn(run)
        if not updated:
            raise BusinessRuleError(
                "Only bookings awaiting your confirmation can be declined.", code="INVALID_STATE"
            )
        await self._notify_booking(updated, "rejected")
        return updated

    async def owner_no_show(self, booking_id: ObjectId, actor: dict) -> dict:
        booking = await self.bookings.find_one({"_id": booking_id})
        if parse_date(booking["check_in"]) > today_ist():
            raise BusinessRuleError(
                "No-shows can only be recorded from the check-in date.", code="INVALID_STATE"
            )
        updated = await self._transition(
            booking_id, [BookingStatus.CONFIRMED], BookingStatus.NO_SHOW, by="owner"
        )
        if not updated:
            raise BusinessRuleError(
                "Only confirmed bookings can be marked as no-show.", code="INVALID_STATE"
            )
        await audit(
            self.db,
            actor=actor,
            action="booking.no_show",
            target_type="booking",
            target_id=booking_id,
        )
        return updated

    # ---------- notifications ----------

    async def _notify_booking(self, booking: dict, kind: str) -> None:
        subjects = {
            "confirmed": "Your booking is confirmed",
            "requested": "Booking request sent to the property",
            "cancelled": "Your booking has been cancelled",
            "rejected": "The property couldn't accept your booking",
        }
        snap = booking["resort_snapshot"]
        text = (
            f"{subjects[kind]} — {snap['name']} ({snap['room_type_name']}).\n"
            f"Booking reference: {booking['booking_ref']}\n"
            f"Stay: {booking['check_in']} to {booking['check_out']} ({booking['nights']} nights)\n"
            f"Total: {format_inr(booking['price']['total_paise'])}\n"
        )
        if booking.get("cancellation"):
            text += f"Refund: {format_inr(booking['cancellation']['refund_paise'])}\n"
        await self.db["notifications"].insert_one(
            {
                "user_id": booking["user_id"],
                "type": f"booking.{kind}",
                "title": subjects[kind],
                "body": f"{snap['name']} · {booking['check_in']} → {booking['check_out']}",
                "link": f"/trips/{booking['_id']}",
                "read_at": None,
                "created_at": now_utc(),
            }
        )
        if self.email:
            await self.email.send_notification(
                booking["guest_details"]["email"], subjects[kind], text, f"booking.{kind}"
            )


def booking_out(booking: dict, *, include_preview: bool = True) -> dict:
    out = serialize(booking)
    for private in ("request_hash", "idempotency_key", "night_dates", "inventory_released"):
        out.pop(private, None)
    if out.get("coupon"):
        out["coupon"] = {"code": booking["coupon"]["code"]}
    snap = out.get("resort_snapshot", {})
    # The exact address and contact are only shown once the booking is confirmed.
    if booking["status"] not in (BookingStatus.CONFIRMED, BookingStatus.COMPLETED):
        snap.pop("address", None)
        snap.pop("contact", None)
    if include_preview and booking["status"] in (
        BookingStatus.PENDING_PAYMENT,
        BookingStatus.PENDING_OWNER,
        BookingStatus.CONFIRMED,
    ):
        today = today_ist()
        refund = refund_for(booking, today, full=booking["status"] == BookingStatus.PENDING_OWNER)
        closed = (
            booking["status"] == BookingStatus.CONFIRMED
            and parse_date(booking["check_in"]) <= today
        )
        out["cancellation_preview"] = {"eligible": not closed, **refund}
    return out
