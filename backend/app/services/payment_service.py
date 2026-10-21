"""Payment flows on top of the booking engine: create Razorpay orders, verify checkout callbacks,
process webhooks idempotently, and issue refunds for cancellations."""

import json
import logging

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import Settings
from app.core.errors import BusinessRuleError, ConflictError, ForbiddenError, NotFoundError
from app.models.enums import BookingStatus, PaymentStatus
from app.services.booking_service import BookingService
from app.services.razorpay import RazorpayClient, verify_payment_signature, verify_webhook_signature
from app.utils.dates import now_utc

logger = logging.getLogger("app.payments")


class PaymentService:
    def __init__(
        self,
        db: AsyncDatabase,
        settings: Settings,
        bookings: BookingService,
        client: RazorpayClient | None = None,
    ):
        self.db = db
        self.settings = settings
        self.bookings = bookings
        self.payments = db["payments"]
        self.client = client or RazorpayClient(
            settings.razorpay_key_id, settings.razorpay_key_secret
        )

    async def create_order(self, user: dict, booking_id: ObjectId) -> dict:
        booking = await self.bookings.get_for_user(user, booking_id)
        if booking["status"] != BookingStatus.PENDING_PAYMENT:
            raise BusinessRuleError("This booking isn't awaiting payment.", code="INVALID_STATE")
        amount = booking["price"]["total_paise"]
        existing = await self.payments.find_one(
            {"booking_id": booking["_id"], "provider": "razorpay", "status": "created"}
        )
        if existing and existing["amount_paise"] == amount:
            order_id = existing["provider_order_id"]  # reuse: retries don't create duplicate orders
        else:
            order = await self.client.create_order(
                amount_paise=amount,
                receipt=booking["booking_ref"],
                notes={"booking_id": str(booking["_id"]), "booking_ref": booking["booking_ref"]},
            )
            order_id = order["id"]
            await self.payments.insert_one(
                {
                    "booking_id": booking["_id"],
                    "user_id": user["_id"],
                    "provider": "razorpay",
                    "provider_order_id": order_id,
                    "amount_paise": amount,
                    "status": "created",
                    "refunds": [],
                    "events": [],
                    "created_at": now_utc(),
                }
            )
        guest = booking["guest_details"]
        return {
            "order_id": order_id,
            "amount_paise": amount,
            "currency": "INR",
            "key_id": self.client.key_id,
            "booking_ref": booking["booking_ref"],
            "prefill": {"name": guest["name"], "email": guest["email"], "contact": guest["phone"]},
        }

    async def verify_checkout(
        self, user: dict, order_id: str, payment_id: str, signature: str
    ) -> dict:
        if not verify_payment_signature(
            order_id, payment_id, signature, self.settings.razorpay_key_secret
        ):
            raise ForbiddenError("Payment verification failed.", code="SIGNATURE_INVALID")
        payment = await self.payments.find_one({"provider_order_id": order_id})
        if not payment or payment["user_id"] != user["_id"]:
            raise NotFoundError("Payment not found.")
        return await self._captured(payment, payment_id)

    async def _captured(self, payment: dict, payment_id: str) -> dict:
        """A verified capture (from checkout or webhook). Safe to call more than once."""
        await self.payments.update_one(
            {"_id": payment["_id"]},
            {
                "$set": {
                    "provider_payment_id": payment_id,
                    "status": "captured",
                    "captured_at": now_utc(),
                }
            },
        )
        booking = await self.db["bookings"].find_one({"_id": payment["booking_id"]})
        if booking["payment_status"] == PaymentStatus.PAID:
            return booking  # already processed (e.g. webhook arrived first)
        details = {
            "provider": "razorpay",
            "simulated": False,
            "provider_order_id": payment["provider_order_id"],
            "provider_payment_id": payment_id,
        }
        try:
            return await self.bookings.mark_paid(booking, details, allow_late=True)
        except ConflictError as exc:
            if exc.code == "HOLD_LOST":
                # The money arrived but the room is gone: refund in full automatically.
                await self.refund(
                    booking["_id"], booking["price"]["total_paise"], reason="hold_expired"
                )
            raise

    async def refund(self, booking_id: ObjectId, amount_paise: int, *, reason: str) -> None:
        """Ask Razorpay for a refund. The booking shows 'refund pending' until the provider's
        refund.processed webhook confirms it — we never claim a refund we haven't seen."""
        payment = await self.payments.find_one(
            {
                "booking_id": booking_id,
                "provider": "razorpay",
                "status": {"$in": ["captured", "refund_pending", "partially_refunded"]},
            }
        )
        if not payment or amount_paise <= 0:
            return
        try:
            refund = await self.client.refund(
                payment_id=payment["provider_payment_id"],
                amount_paise=amount_paise,
                notes={"reason": reason},
            )
            await self.payments.update_one(
                {"_id": payment["_id"]},
                {
                    "$push": {
                        "refunds": {
                            "provider_refund_id": refund["id"],
                            "amount_paise": amount_paise,
                            "status": "pending",
                            "requested_at": now_utc(),
                        }
                    },
                    "$set": {"status": "refund_pending"},
                },
            )
        except Exception:
            logger.exception(
                "Refund request failed; it stays pending for an admin to retry",
                extra={"booking_id": str(booking_id)},
            )
        await self.db["bookings"].update_one(
            {"_id": booking_id}, {"$set": {"payment_status": PaymentStatus.REFUND_PENDING}}
        )

    async def handle_webhook(self, raw_body: bytes, signature: str, event_id: str | None) -> dict:
        if not verify_webhook_signature(raw_body, signature, self.settings.razorpay_webhook_secret):
            raise ForbiddenError("Invalid webhook signature.", code="SIGNATURE_INVALID")
        event = json.loads(raw_body)
        event_id = event_id or event.get("id") or f"{event.get('event')}:{event.get('created_at')}"
        try:
            await self.db["processed_webhook_events"].insert_one(
                {"event_id": event_id, "type": event.get("event"), "received_at": now_utc()}
            )
        except DuplicateKeyError:
            return {"status": "duplicate"}  # Razorpay retries: already handled

        kind = event.get("event")
        payload = event.get("payload", {})
        if kind == "payment.captured":
            entity = payload["payment"]["entity"]
            payment = await self.payments.find_one({"provider_order_id": entity["order_id"]})
            if payment:
                try:
                    await self._captured(payment, entity["id"])
                except ConflictError:
                    pass  # recorded + refunded where needed; nothing more to do for the webhook
        elif kind == "payment.failed":
            entity = payload["payment"]["entity"]
            await self.payments.update_one(
                {"provider_order_id": entity.get("order_id")},
                {
                    "$push": {
                        "events": {
                            "type": "failed",
                            "reason": entity.get("error_description"),
                            "at": now_utc(),
                        }
                    }
                },
            )
        elif kind in ("refund.processed", "refund.failed"):
            entity = payload["refund"]["entity"]
            status = "processed" if kind == "refund.processed" else "failed"
            payment = await self.payments.find_one_and_update(
                {"refunds.provider_refund_id": entity["id"]},
                {"$set": {"refunds.$.status": status, "refunds.$.updated_at": now_utc()}},
                return_document=True,
            )
            if payment and status == "processed":
                refunded = sum(
                    r["amount_paise"] for r in payment["refunds"] if r["status"] == "processed"
                )
                full = refunded >= payment["amount_paise"]
                await self.payments.update_one(
                    {"_id": payment["_id"]},
                    {"$set": {"status": "refunded" if full else "partially_refunded"}},
                )
                await self.db["bookings"].update_one(
                    {"_id": payment["booking_id"]},
                    {
                        "$set": {
                            "payment_status": PaymentStatus.REFUNDED
                            if full
                            else PaymentStatus.PARTIALLY_REFUNDED,
                            "cancellation.refund_status": "refunded",
                        }
                    },
                )
        return {"status": "processed", "event": kind}
