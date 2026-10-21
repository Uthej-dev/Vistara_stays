"""Availability, quotes and enquiries for a specific resort."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbDep, OptionalUserDep, rate_limit
from app.core.errors import NotFoundError
from app.models.enums import ResortStatus
from app.schemas.bookings import EnquiryRequest, QuoteRequest, QuoteResponse, ResortAvailability
from app.schemas.common import IdPath, ISODate, oid
from app.services.availability_service import AvailabilityService
from app.utils.dates import now_utc

router = APIRouter(tags=["availability"])


@router.get("/resorts/{resort_id}/availability", response_model=ResortAvailability)
async def resort_availability(
    resort_id: IdPath,
    db: DbDep,
    check_in: ISODate,
    check_out: ISODate,
    rooms: Annotated[int, Query(ge=1, le=5)] = 1,
    adults: Annotated[int, Query(ge=1, le=20)] = 2,
    children: Annotated[int, Query(ge=0, le=10)] = 0,
    child_ages: Annotated[list[int] | None, Query()] = None,
):
    """Availability and full price for every room type at a resort for the given stay."""
    if child_ages is not None and any(not 0 <= a <= 17 for a in child_ages):
        child_ages = None
    return await AvailabilityService(db).resort_availability(
        oid(resort_id),
        check_in=check_in,
        check_out=check_out,
        rooms=rooms,
        adults=adults,
        children=children,
        child_ages=child_ages,
    )


@router.post(
    "/bookings/quote", response_model=QuoteResponse, dependencies=[rate_limit("quote", 60, 60)]
)
async def quote(body: QuoteRequest, db: DbDep, user: OptionalUserDep):
    """Price a stay without reserving anything. The booking endpoint recalculates this on its
    own — totals sent by the browser are never trusted."""
    result = await AvailabilityService(db).quote_room(
        room_type_id=oid(body.room_type_id),
        check_in=body.check_in,
        check_out=body.check_out,
        rooms=body.rooms,
        adults=body.adults,
        children=body.children,
        child_ages=body.child_ages,
        coupon_code=body.coupon_code,
        user_id=user["_id"] if user else None,
    )
    return {
        "available": result["available"],
        "available_units": result["available_units"],
        "price": result["price"],
        "hold_minutes": result["settings"]["hold_minutes"],
    }


@router.post(
    "/resorts/{resort_id}/enquiries", status_code=201, dependencies=[rate_limit("enquiry", 3, 3600)]
)
async def create_enquiry(resort_id: IdPath, body: EnquiryRequest, db: DbDep, user: OptionalUserDep):
    """Send a question to the property. The owner sees it in their dashboard."""
    resort = await db["resorts"].find_one({"_id": oid(resort_id), "status": ResortStatus.PUBLISHED})
    if not resort:
        raise NotFoundError("Resort not found.")
    await db["enquiries"].insert_one(
        {
            "resort_id": resort["_id"],
            "owner_id": resort["owner_id"],
            "user_id": user["_id"] if user else None,
            **body.model_dump(),
            "status": "open",
            "created_at": now_utc(),
        }
    )
    return {"message": "Your enquiry has been sent to the property."}
