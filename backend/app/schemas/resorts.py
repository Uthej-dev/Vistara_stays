"""Public resort schemas (search results and the details page)."""

from typing import Annotated, Literal

from fastapi import Query
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.models.enums import BookingMode, MealPlan, PropertyType, State
from app.schemas.common import Image, ISODate, Slug
from app.schemas.destinations import GeoPoint


class RatingSummary(BaseModel):
    avg: float = 0
    count: int = 0
    cleanliness: float | None = None
    location: float | None = None
    service: float | None = None
    facilities: float | None = None


class DestinationRef(BaseModel):
    id: str
    slug: str
    name: str
    state: State


class CardPrice(BaseModel):
    """`kind=starting`: lowest base rate, no dates. `kind=stay`: real price for the dates."""

    kind: Literal["starting", "stay"]
    per_night_paise: int
    total_paise: int | None = None
    nights: int | None = None
    rooms: int | None = None
    taxes_included: bool
    meal_plan: MealPlan
    room_type_name: str | None = None


class ResortCard(BaseModel):
    id: str
    slug: str
    name: str
    is_sample: bool
    destination: DestinationRef
    property_type: PropertyType
    categories: list[str]
    amenities: list[str]
    surroundings: list[str]
    cover_image: Image | None = None
    rating: RatingSummary
    price: CardPrice
    available: bool | None = None
    distance_from_centre_km: float | None = None


class Bed(BaseModel):
    type: Literal["king", "queen", "double", "twin", "single", "sofa_bed", "bunk"]
    count: int = Field(ge=1, le=10)


class RoomTypePublic(BaseModel):
    id: str
    name: str
    description: str | None = None
    max_adults: int
    max_children: int
    max_occupancy: int
    base_occupancy: int
    beds: list[Bed]
    size_sqft: int | None = None
    amenities: list[str] = []
    images: list[Image] = []
    base_rate_paise: int
    weekend_rate_paise: int | None = None
    extra_adult_paise: int = 0
    extra_child_paise: int = 0
    meal_plan: MealPlan
    total_units: int


class CancellationTier(BaseModel):
    days_before_check_in: int = Field(ge=0, le=365)
    refund_pct: int = Field(ge=0, le=100)


class CancellationPolicy(BaseModel):
    code: str = "custom"
    description: str | None = None
    tiers: list[CancellationTier] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def sort_tiers(self) -> "CancellationPolicy":
        self.tiers.sort(key=lambda t: t.days_before_check_in, reverse=True)
        return self


class Policies(BaseModel):
    check_in_time: str = Field("14:00", pattern=r"^\d{2}:\d{2}$")
    check_out_time: str = Field("11:00", pattern=r"^\d{2}:\d{2}$")
    cancellation_policy: CancellationPolicy
    child_free_age: int = Field(5, ge=0, le=12)
    pets_allowed: bool = False
    smoking_allowed: bool = False
    house_rules: list[str] = Field(default_factory=list, max_length=20)
    accessibility: list[str] = Field(default_factory=list, max_length=20)
    id_required: bool = True
    meals_note: str | None = Field(None, max_length=300)


class Attraction(BaseModel):
    name: str = Field(max_length=80)
    distance_km: float | None = Field(None, ge=0, le=500)
    note: str | None = Field(None, max_length=200)


class PublicAddress(BaseModel):
    town: str
    district: str
    state: State
    pincode: str | None = None


class ResortDetail(BaseModel):
    id: str
    slug: str
    name: str
    is_sample: bool
    status: str
    destination: DestinationRef
    property_type: PropertyType
    categories: list[str]
    amenities: list[str]
    surroundings: list[str]
    description: str
    highlights: list[str]
    images: list[Image]
    address: PublicAddress
    location: GeoPoint
    distance_from_centre_km: float | None = None
    policies: Policies
    nearby_attractions: list[Attraction]
    booking_mode: BookingMode
    starting_price_paise: int
    rating: RatingSummary
    room_types: list[RoomTypePublic]
    is_favourite: bool = False


SortOption = Literal["recommended", "price_asc", "price_desc", "rating", "reviews"]


class ResortSearchParams(BaseModel):
    q: str | None = Field(None, max_length=80)
    destination: Slug | None = None
    state: State | None = None
    check_in: ISODate | None = None
    check_out: ISODate | None = None
    adults: int = Field(2, ge=1, le=20)
    children: int = Field(0, ge=0, le=10)
    rooms: int = Field(1, ge=1, le=5)
    min_price: int | None = Field(None, ge=0, le=10_000_000, description="Rupees")
    max_price: int | None = Field(None, ge=0, le=10_000_000, description="Rupees")
    price_basis: Literal["night", "total"] = "night"
    min_rating: float | None = Field(None, ge=1, le=5)
    property_type: list[PropertyType] = []
    category: list[Slug] = []
    amenity: list[Slug] = []
    surrounding: list[Slug] = []
    max_distance_km: float | None = Field(None, gt=0, le=200)
    available_only: bool | None = None
    sort: SortOption = "recommended"
    page: int = Field(1, ge=1, le=1000)
    page_size: int = Field(12, ge=1, le=50)

    @model_validator(mode="after")
    def check_dates(self) -> "ResortSearchParams":
        if bool(self.check_in) != bool(self.check_out):
            raise ValueError("check_in and check_out must be given together")
        if self.price_basis == "total" and not self.check_in:
            raise ValueError("price_basis=total requires dates")
        return self

    @property
    def has_dates(self) -> bool:
        return bool(self.check_in and self.check_out)


def search_params(
    q: Annotated[str | None, Query(max_length=80)] = None,
    destination: Annotated[str | None, Query(max_length=80)] = None,
    state: State | None = None,
    check_in: str | None = None,
    check_out: str | None = None,
    adults: int = 2,
    children: int = 0,
    rooms: int = 1,
    min_price: int | None = None,
    max_price: int | None = None,
    price_basis: Literal["night", "total"] = "night",
    min_rating: float | None = None,
    property_type: Annotated[list[PropertyType], Query()] = [],  # noqa: B006
    category: Annotated[list[str], Query()] = [],  # noqa: B006
    amenity: Annotated[list[str], Query()] = [],  # noqa: B006
    surrounding: Annotated[list[str], Query()] = [],  # noqa: B006
    max_distance_km: float | None = None,
    available_only: bool | None = None,
    sort: SortOption = "recommended",
    page: int = 1,
    page_size: int = 12,
) -> ResortSearchParams:
    """Collect query parameters into one validated model (repeated params become lists)."""
    try:
        return ResortSearchParams(**dict(locals()))
    except ValidationError as exc:
        # Raised inside a dependency, so convert it to the standard 422 response ourselves.
        raise RequestValidationError(
            [{**e, "loc": ("query", *e["loc"])} for e in exc.errors(include_url=False)]
        ) from exc


class Facets(BaseModel):
    amenities: dict[str, int] = {}
    categories: dict[str, int] = {}
    property_types: dict[str, int] = {}
    surroundings: dict[str, int] = {}


class SearchResponse(BaseModel):
    items: list[ResortCard]
    page: int
    page_size: int
    total: int
    total_pages: int
    applied_filters: dict
    facets: Facets
    nights: int | None = None
