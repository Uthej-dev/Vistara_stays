"""Owner portal request bodies. Fields like owner_id, status, rating and slug are never accepted
from the client — the server sets them."""

from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints, model_validator

from app.models.enums import BookingMode, MealPlan, PropertyType, RoomTypeStatus
from app.schemas.auth import Phone
from app.schemas.common import APIModel, Image, ISODate, Slug
from app.schemas.resorts import Attraction, Bed, Policies

Text = Annotated[str, StringConstraints(strip_whitespace=True)]


class GeoInput(APIModel):
    # Bounding box around the five southern states.
    lat: float = Field(ge=6.0, le=20.0)
    lng: float = Field(ge=72.0, le=86.0)


class AddressInput(APIModel):
    line1: Text = Field(min_length=3, max_length=120)
    line2: Text | None = Field(None, max_length=120)
    town: Text = Field(min_length=2, max_length=80)
    district: Text = Field(min_length=2, max_length=80)
    pincode: Annotated[str, StringConstraints(pattern=r"^[1-9]\d{5}$")] | None = None


class ContactInput(APIModel):
    email: EmailStr | None = None
    phone: Phone | None = None


class ResortCreate(APIModel):
    name: Text = Field(min_length=3, max_length=100)
    destination: Slug
    property_type: PropertyType


class ResortUpdate(APIModel):
    name: Text | None = Field(None, min_length=3, max_length=100)
    destination: Slug | None = None
    property_type: PropertyType | None = None
    description: Text | None = Field(None, max_length=3000)
    highlights: (
        list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]]
        | None
    ) = Field(None, max_length=8)
    categories: list[Slug] | None = Field(None, max_length=6)
    amenities: list[Slug] | None = Field(None, max_length=30)
    surroundings: list[Slug] | None = Field(None, max_length=6)
    address: AddressInput | None = None
    location: GeoInput | None = None
    policies: Policies | None = None
    nearby_attractions: list[Attraction] | None = Field(None, max_length=12)
    contact: ContactInput | None = None
    booking_mode: BookingMode | None = None
    images: list[Image] | None = Field(None, max_length=20)


class RoomTypeCreate(APIModel):
    name: Text = Field(min_length=2, max_length=80)
    description: Text | None = Field(None, max_length=1000)
    max_adults: int = Field(ge=1, le=10)
    max_children: int = Field(0, ge=0, le=6)
    max_occupancy: int = Field(ge=1, le=12)
    base_occupancy: int = Field(ge=1, le=10)
    beds: list[Bed] = Field(min_length=1, max_length=6)
    size_sqft: int | None = Field(None, ge=50, le=20000)
    amenities: list[Slug] = Field(default_factory=list, max_length=20)
    images: list[Image] = Field(default_factory=list, max_length=10)
    total_units: int = Field(ge=1, le=200)
    base_rate_paise: int = Field(ge=50000, le=100_000_000)  # ₹500 – ₹10,00,000 per night
    weekend_rate_paise: int | None = Field(None, ge=50000, le=100_000_000)
    extra_adult_paise: int = Field(0, ge=0, le=10_000_000)
    extra_child_paise: int = Field(0, ge=0, le=10_000_000)
    meal_plan: MealPlan = MealPlan.ROOM_ONLY

    @model_validator(mode="after")
    def occupancy_is_consistent(self):
        if self.max_occupancy < self.max_adults:
            raise ValueError("max_occupancy can't be lower than max_adults")
        if self.max_occupancy > self.max_adults + self.max_children:
            raise ValueError("max_occupancy can't exceed max_adults + max_children")
        if self.base_occupancy > self.max_occupancy:
            raise ValueError("base_occupancy can't exceed max_occupancy")
        return self


class RoomTypeUpdate(APIModel):
    name: Text | None = Field(None, min_length=2, max_length=80)
    description: Text | None = Field(None, max_length=1000)
    max_adults: int | None = Field(None, ge=1, le=10)
    max_children: int | None = Field(None, ge=0, le=6)
    max_occupancy: int | None = Field(None, ge=1, le=12)
    base_occupancy: int | None = Field(None, ge=1, le=10)
    beds: list[Bed] | None = Field(None, min_length=1, max_length=6)
    size_sqft: int | None = Field(None, ge=50, le=20000)
    amenities: list[Slug] | None = Field(None, max_length=20)
    images: list[Image] | None = Field(None, max_length=10)
    total_units: int | None = Field(None, ge=1, le=200)
    base_rate_paise: int | None = Field(None, ge=50000, le=100_000_000)
    weekend_rate_paise: int | None = Field(None, ge=50000, le=100_000_000)
    extra_adult_paise: int | None = Field(None, ge=0, le=10_000_000)
    extra_child_paise: int | None = Field(None, ge=0, le=10_000_000)
    meal_plan: MealPlan | None = None
    status: RoomTypeStatus | None = None


class CalendarUpdate(APIModel):
    """Apply to every night from `from_date` up to and including `to_date`."""

    from_date: ISODate = Field(alias="from")
    to_date: ISODate = Field(alias="to")
    price_override_paise: int | None = Field(None, ge=50000, le=100_000_000)
    clear_price_override: bool = False
    blocked_units: int | None = Field(None, ge=0, le=200)
    closed: bool | None = None

    model_config = APIModel.model_config | {"populate_by_name": True}


class RateRuleIn(APIModel):
    name: Text = Field(min_length=2, max_length=60)
    start_date: ISODate
    end_date: ISODate
    adjustment_type: Literal["percent", "fixed_rate"]
    value: int = Field(ge=-90, le=100_000_000)
    days_of_week: list[Annotated[int, Field(ge=0, le=6)]] | None = None
    priority: int = Field(1, ge=0, le=100)
    is_active: bool = True

    @model_validator(mode="after")
    def check(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.adjustment_type == "percent" and not -90 <= self.value <= 300:
            raise ValueError("Percent adjustments must be between -90 and 300")
        if self.adjustment_type == "fixed_rate" and self.value < 50000:
            raise ValueError("Fixed rates must be at least ₹500")
        return self


class ReasonBody(APIModel):
    reason: Text = Field(min_length=3, max_length=500)


class OptionalReason(APIModel):
    reason: Text | None = Field(None, max_length=500)


class EnquiryUpdate(APIModel):
    status: Literal["open", "closed"]


class Missing(BaseModel):
    missing: list[str]
