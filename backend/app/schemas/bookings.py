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
