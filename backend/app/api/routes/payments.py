"""Razorpay payments. The booking is marked paid only after a signature check on our server —
never because the browser says so."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from app.api.deps import CustomerDep, DbDep, SettingsDep
from app.core.errors import NotFoundError
from app.schemas.common import APIModel, ObjectIdStr, oid
from app.services.booking_service import booking_out
from app.services.factories import make_booking_service
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments/razorpay", tags=["payments"])


class OrderRequest(APIModel):
    booking_id: ObjectIdStr


class VerifyRequest(APIModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def payment_service(request: Request, db: DbDep, settings: SettingsDep) -> PaymentService:
    if settings.payment_provider != "razorpay":
        raise NotFoundError()
    state = request.app.state
    bookings = make_booking_service(
        db, settings, state.email_outbox, state.razorpay_client, state.sms_outbox
    )
    return PaymentService(db, settings, bookings, state.razorpay_client)


Payments = Annotated[PaymentService, Depends(payment_service)]


@router.post("/order")
async def create_order(body: OrderRequest, user: CustomerDep, svc: Payments):
    """Create (or reuse) a Razorpay order for the booking's server-calculated total."""
    return await svc.create_order(user, oid(body.booking_id))


@router.post("/verify")
async def verify(body: VerifyRequest, user: CustomerDep, svc: Payments):
    """Called by the checkout after Razorpay's success callback. Verifies the HMAC signature
    with our secret before confirming anything."""
    booking = await svc.verify_checkout(
        user, body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature
    )
    return booking_out(booking)


@router.post("/webhook", status_code=200)
async def webhook(
    request: Request,
    svc: Payments,
    x_razorpay_signature: Annotated[str, Header()] = "",
    x_razorpay_event_id: Annotated[str | None, Header()] = None,
):
    """Server-to-server notifications from Razorpay (the source of truth for captures and
    refunds). Signature-verified on the raw body; each event is processed once."""
    raw = await request.body()
    return await svc.handle_webhook(raw, x_razorpay_signature, x_razorpay_event_id)
