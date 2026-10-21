"""Customer bookings: create (hold), list, view, cancel. Simulated payments for development."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Request, Response

from app.api.deps import CustomerDep, DbDep, SettingsDep, rate_limit
from app.core.errors import NotFoundError
from app.schemas.bookings import BookingCreate, BookingOut, BookingPage, CancelRequest
from app.schemas.common import IdPath, Pagination, oid, pagination_params
from app.services.booking_service import BookingService, booking_out
from app.services.factories import make_booking_service

router = APIRouter(tags=["bookings"])

IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        pattern=r"^[A-Za-z0-9-]{8,100}$",
        description="Unique per booking attempt (the frontend sends a UUID). Retries with the same "
        "key return the original booking instead of creating a second one.",
    ),
]


def get_booking_service(request: Request, db: DbDep) -> BookingService:
    state = request.app.state
    return make_booking_service(db, state.settings, state.email_outbox, state.razorpay_client)


BookingServiceDep = Annotated[BookingService, Depends(get_booking_service)]


async def decorate(db, booking: dict) -> dict:
    out = booking_out(booking)
    if booking["status"] == "completed":
        review = await db["reviews"].find_one({"booking_id": booking["_id"]}, {"_id": 1})
        out["review_id"] = str(review["_id"]) if review else None
        out["can_review"] = review is None
    return out


@router.post(
    "/bookings",
    response_model=BookingOut,
    status_code=201,
    dependencies=[rate_limit("booking", 10, 60, per="user")],
)
async def create_booking(
    body: BookingCreate,
    user: CustomerDep,
    response: Response,
    svc: BookingServiceDep,
    settings: SettingsDep,
    idempotency_key: IdempotencyKey,
):
    """Hold the room(s) and create a booking awaiting payment. The price is recalculated here —
    nothing price-related is accepted from the browser."""
    booking, created = await svc.create(
        user, body, idempotency_key, require_verified=settings.require_email_verification
    )
    if not created:
        response.status_code = 200
    return booking_out(booking)


@router.get("/bookings", response_model=BookingPage)
async def my_bookings(
    user: CustomerDep,
    svc: BookingServiceDep,
    db: DbDep,
    pagination: Annotated[Pagination, Depends(pagination_params)],
    scope: Literal["all", "upcoming", "past", "cancelled"] = "all",
):
    page = await svc.list_for_user(user, scope, pagination.page, pagination.page_size)
    page["items"] = [await decorate(db, b) for b in page["items"]]
    return page


@router.get("/bookings/{booking_id}", response_model=BookingOut)
async def get_booking(booking_id: IdPath, user: CustomerDep, svc: BookingServiceDep, db: DbDep):
    return await decorate(db, await svc.get_for_user(user, oid(booking_id)))


@router.post("/bookings/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: IdPath, body: CancelRequest, user: CustomerDep, svc: BookingServiceDep, db: DbDep
):
    booking = await svc.get_for_user(user, oid(booking_id))
    return await decorate(db, await svc.cancel(booking, actor=user, reason=body.reason))


# ---------- simulated payments (development only) ----------


def require_simulated(settings: SettingsDep) -> None:
    if settings.payment_provider != "simulated":
        raise NotFoundError()


@router.post(
    "/payments/simulated/{booking_id}/succeed",
    response_model=BookingOut,
    dependencies=[Depends(require_simulated)],
    tags=["payments"],
)
async def simulated_success(
    booking_id: IdPath, user: CustomerDep, svc: BookingServiceDep, db: DbDep
):
    """DEVELOPMENT ONLY. Marks the booking as paid without moving any money. Clearly labelled
    as simulated everywhere it's shown."""
    booking = await svc.get_for_user(user, oid(booking_id))
    payment = {
        "provider": "simulated",
        "simulated": True,
        "reference": f"SIM-{booking['booking_ref']}",
    }
    return await decorate(db, await svc.mark_paid(booking, payment))


@router.post(
    "/payments/simulated/{booking_id}/fail",
    response_model=BookingOut,
    dependencies=[Depends(require_simulated)],
    tags=["payments"],
)
async def simulated_failure(
    booking_id: IdPath, user: CustomerDep, svc: BookingServiceDep, db: DbDep
):
    """DEVELOPMENT ONLY. A failed payment releases the held rooms immediately."""
    booking = await svc.get_for_user(user, oid(booking_id))
    await svc.expire(booking["_id"])
    return await decorate(db, await svc.get_for_user(user, booking["_id"]))


@router.get("/payments/config", tags=["payments"])
async def payment_config(settings: SettingsDep):
    """Which payment flow the checkout page should show. Only the public Razorpay key id is
    ever exposed; the secret stays on the server."""
    return {
        "provider": settings.payment_provider,
        "simulated": settings.payment_provider == "simulated",
        "razorpay_key_id": settings.razorpay_key_id
        if settings.payment_provider == "razorpay"
        else None,
    }
