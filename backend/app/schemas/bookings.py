from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints, model_validator

from app.schemas.auth import Phone
from app.schemas.common import APIModel, ISODate, ObjectIdStr

ChildAge = Annotated[int, Field(ge=0, le=17)]


class StayRequest(APIModel):
    room_type_id: ObjectIdStr
    check_in: ISODate
    check_out: ISODate
    rooms: int = Field(1, ge=1, le=5)
    adults: int = Field(2, ge=1, le=20)
    children: int = Field(0, ge=0, le=10)
    child_ages: list[ChildAge] = Field(default_factory=list, max_length=10)
    coupon_code: (
        Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, max_length=30)]
        | None
    ) = None

    @model_validator(mode="after")
    def ages_match_children(self) -> "StayRequest":
        if len(self.child_ages) != self.children:
            raise ValueError("Give one age for each child")
        return self


class QuoteRequest(StayRequest):
    pass


class NightLine(BaseModel):
    date: str
    rate_paise: int
    source: str


class TaxLine(BaseModel):
    label: str
    rate_pct: float
    amount_paise: int


class PriceBreakdown(BaseModel):
    currency: Literal["INR"]
    nights: list[NightLine]
    nights_count: int
    rooms: int
    extra_adults: int
    extra_children: int
    room_subtotal_paise: int
    extra_guest_paise: int
    discount_paise: int
    coupon_code: str | None
    taxable_paise: int
    taxes: list[TaxLine]
    tax_total_paise: int
    service_fee_pct: float
    service_fee_paise: int
    total_paise: int
    avg_per_night_paise: int
    meal_plan: str
    summary: str


class QuoteResponse(BaseModel):
    available: bool
    available_units: int
    price: PriceBreakdown
    hold_minutes: int


class RoomAvailability(BaseModel):
    room_type_id: str
    name: str
    available_units: int
    fits: bool
    bookable: bool
    unavailable_reason: str | None
    price: PriceBreakdown | None


class ResortAvailability(BaseModel):
    check_in: str
    check_out: str
    nights: int
    rooms: int
    adults: int
    children: int
    room_types: list[RoomAvailability]
    checked_at: datetime


GuestName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]


class GuestDetails(APIModel):
    """Lead guest. Must be an adult. ID documents are checked at the property, never collected here."""

    name: GuestName
    email: EmailStr
    phone: Phone
    age: int = Field(ge=18, le=120)
    nationality: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")] = "IN"
    arrival_time: Annotated[str, StringConstraints(pattern=r"^\d{2}:\d{2}$")] | None = None


class EnquiryRequest(APIModel):
    name: GuestName
    email: EmailStr
    phone: Phone | None = None
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=10, max_length=1000)
    ]


class BookingCreate(StayRequest):
    guest_details: GuestDetails
    special_requests: (
        Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None
    ) = None


class CancelRequest(APIModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class CancellationPreview(BaseModel):
    eligible: bool
    refund_pct: int
    refund_paise: int
    days_before_check_in: int


class BookingOut(BaseModel):
    """A booking as its guest (or the property/admin) sees it. Prices and policies are the
    snapshot taken when it was made, so later changes by the property never alter it."""

    id: str
    booking_ref: str
    status: str
    payment_status: str
    resort_id: str
    room_type_id: str
    check_in: str
    check_out: str
    nights: int
    rooms: int
    guests: dict
    guest_details: dict
    special_requests: str | None = None
    hold_expires_at: datetime
    price: PriceBreakdown
    policy_snapshot: dict
    resort_snapshot: dict
    coupon: dict | None = None
    payment: dict | None = None
    cancellation: dict | None = None
    cancellation_preview: CancellationPreview | None = None
    status_history: list[dict] = []
    created_at: datetime
    can_review: bool = False
    review_id: str | None = None


class BookingPage(BaseModel):
    items: list[BookingOut]
    page: int
    page_size: int
    total: int
    total_pages: int
