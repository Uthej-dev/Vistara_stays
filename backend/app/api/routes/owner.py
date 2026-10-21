"""Owner portal API. Role `owner` required; every operation is scoped to the owner's own data."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.api.deps import DbDep, OwnerDep
from app.models.enums import BookingStatus
from app.schemas.common import IdPath, ISODate, Pagination, oid, pagination_params
from app.schemas.owner import (
    CalendarUpdate,
    EnquiryUpdate,
    OptionalReason,
    RateRuleIn,
    ReasonBody,
    ResortCreate,
    ResortUpdate,
    RoomTypeCreate,
    RoomTypeUpdate,
)
from app.services.booking_service import BookingService
from app.services.factories import make_booking_service
from app.services.owner_service import OwnerService, owner_booking_out

router = APIRouter(prefix="/owner", tags=["owner"])


def service(request: Request, db: DbDep) -> OwnerService:
    return OwnerService(db, request.app.state.settings)


def bookings(request: Request, db: DbDep) -> BookingService:
    state = request.app.state
    return make_booking_service(db, state.settings, state.email_outbox, state.razorpay_client)


Svc = Annotated[OwnerService, Depends(service)]
Bookings = Annotated[BookingService, Depends(bookings)]


@router.get("/dashboard")
async def dashboard(owner: OwnerDep, svc: Svc):
    """Upcoming arrivals, 30-day occupancy, revenue this month, pending actions."""
    return await svc.dashboard(owner)


# ---------- properties ----------


@router.get("/resorts")
async def my_resorts(owner: OwnerDep, svc: Svc):
    return await svc.list_resorts(owner)


@router.post("/resorts", status_code=201)
async def create_resort(body: ResortCreate, owner: OwnerDep, svc: Svc):
    """Start a draft listing. It stays private until an admin approves it."""
    return await svc.create_resort(owner, body)


@router.get("/resorts/{resort_id}")
async def get_resort(resort_id: IdPath, owner: OwnerDep, svc: Svc):
    resort = await svc.own_resort(owner, oid(resort_id))
    from app.utils.text import serialize

    return {**serialize(resort), "missing": await svc.completeness(resort)}


@router.patch("/resorts/{resort_id}")
async def update_resort(resort_id: IdPath, body: ResortUpdate, owner: OwnerDep, svc: Svc):
    """Edit any part of a listing. Changing name/destination/address/location/type of a live
    listing sends it back for review."""
    return await svc.update_resort(owner, oid(resort_id), body)


@router.post("/resorts/{resort_id}/submit")
async def submit_resort(resort_id: IdPath, owner: OwnerDep, svc: Svc):
    """Draft → pending review. Fails with INCOMPLETE and a list of what's missing."""
    return await svc.submit(owner, oid(resort_id))


@router.post("/resorts/{resort_id}/archive")
async def archive_resort(resort_id: IdPath, owner: OwnerDep, svc: Svc):
    return await svc.archive(owner, oid(resort_id))


# ---------- room types ----------


@router.get("/resorts/{resort_id}/room-types")
async def list_room_types(resort_id: IdPath, owner: OwnerDep, svc: Svc):
    return await svc.list_rooms(owner, oid(resort_id))


@router.post("/resorts/{resort_id}/room-types", status_code=201)
async def create_room_type(resort_id: IdPath, body: RoomTypeCreate, owner: OwnerDep, svc: Svc):
    return await svc.create_room(owner, oid(resort_id), body)


@router.patch("/room-types/{room_id}")
async def update_room_type(room_id: IdPath, body: RoomTypeUpdate, owner: OwnerDep, svc: Svc):
    """Reducing total_units below what's already booked or blocked on a future night fails with
    UNITS_IN_USE and the affected dates."""
    return await svc.update_room(owner, oid(room_id), body)


@router.get("/room-types/{room_id}/calendar")
async def calendar(
    room_id: IdPath,
    owner: OwnerDep,
    svc: Svc,
    from_: Annotated[ISODate, Query(alias="from")],
    to: ISODate,
):
    """Per night: units, bookings, blocks, availability and the effective price (max 92 days)."""
    return await svc.calendar(owner, oid(room_id), from_, to)


@router.put("/room-types/{room_id}/calendar")
async def update_calendar(room_id: IdPath, body: CalendarUpdate, owner: OwnerDep, svc: Svc):
    """Set a date-specific price, block units or close nights for a date range. Blocks never
    override existing bookings — nights where they wouldn't fit are listed in `conflicts`."""
    return await svc.update_calendar(owner, oid(room_id), body)


@router.get("/room-types/{room_id}/rate-rules")
async def list_rules(room_id: IdPath, owner: OwnerDep, svc: Svc):
    return await svc.list_rules(owner, oid(room_id))


@router.post("/room-types/{room_id}/rate-rules", status_code=201)
async def create_rule(room_id: IdPath, body: RateRuleIn, owner: OwnerDep, svc: Svc):
    return await svc.create_rule(owner, oid(room_id), body)


@router.put("/rate-rules/{rule_id}")
async def update_rule(rule_id: IdPath, body: RateRuleIn, owner: OwnerDep, svc: Svc):
    return await svc.update_rule(owner, oid(rule_id), body)


@router.delete("/rate-rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: IdPath, owner: OwnerDep, svc: Svc):
    await svc.delete_rule(owner, oid(rule_id))
    return Response(status_code=204)


# ---------- reservations ----------


@router.get("/bookings")
async def list_bookings(
    owner: OwnerDep,
    svc: Svc,
    pagination: Annotated[Pagination, Depends(pagination_params)],
    resort_id: Annotated[str | None, Query(pattern=r"^[0-9a-f]{24}$")] = None,
    status: BookingStatus | None = None,
    from_: Annotated[ISODate | None, Query(alias="from")] = None,
    to: ISODate | None = None,
):
    return await svc.list_bookings(
        owner,
        resort_id=oid(resort_id) if resort_id else None,
        status=status,
        start=from_,
        end=to,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/bookings/{booking_id}")
async def get_booking(booking_id: IdPath, owner: OwnerDep, svc: Svc):
    return owner_booking_out(await svc.own_booking(owner, oid(booking_id)))


@router.post("/bookings/{booking_id}/confirm")
async def confirm_booking(booking_id: IdPath, owner: OwnerDep, svc: Svc, engine: Bookings):
    booking = await svc.own_booking(owner, oid(booking_id))
    return owner_booking_out(await engine.owner_confirm(booking["_id"], owner))


@router.post("/bookings/{booking_id}/reject")
async def reject_booking(
    booking_id: IdPath, body: ReasonBody, owner: OwnerDep, svc: Svc, engine: Bookings
):
    booking = await svc.own_booking(owner, oid(booking_id))
    return owner_booking_out(await engine.owner_reject(booking["_id"], owner, body.reason))


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: IdPath, body: ReasonBody, owner: OwnerDep, svc: Svc, engine: Bookings
):
    """Owner-initiated cancellations always refund the guest in full and are audited."""
    booking = await svc.own_booking(owner, oid(booking_id))
    return owner_booking_out(await engine.cancel(booking, actor=owner, reason=body.reason))


@router.post("/bookings/{booking_id}/no-show")
async def no_show(
    booking_id: IdPath,
    owner: OwnerDep,
    svc: Svc,
    engine: Bookings,
    body: OptionalReason | None = None,
):
    booking = await svc.own_booking(owner, oid(booking_id))
    return owner_booking_out(await engine.owner_no_show(booking["_id"], owner))


# ---------- enquiries ----------


@router.get("/enquiries")
async def enquiries(
    owner: OwnerDep, svc: Svc, status: str | None = Query(None, pattern="^(open|closed)$")
):
    return await svc.enquiries(owner, status)


@router.patch("/enquiries/{enquiry_id}")
async def update_enquiry(enquiry_id: IdPath, body: EnquiryUpdate, owner: OwnerDep, svc: Svc):
    return await svc.update_enquiry(owner, oid(enquiry_id), body.status)
