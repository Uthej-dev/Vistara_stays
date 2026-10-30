"""AI booking assistant: chat requests, the remembered search criteria, and result cards."""

from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import MealPlan, PropertyType, State
from app.schemas.common import APIModel, Image, ISODate, Slug
from app.schemas.resorts import DestinationRef, RatingSummary, SortOption


class StayCriteria(APIModel):
    """What the guest has told the assistant so far. The browser sends it back with every
    message so the conversation is remembered without server-side sessions; it is re-validated
    on every request and only ever used as search input."""

    destination: Slug | None = None
    destination_name: str | None = Field(None, max_length=80)
    state: State | None = None
    check_in: ISODate | None = None
    check_out: ISODate | None = None
    adults: int | None = Field(None, ge=1, le=20)
    children: int | None = Field(None, ge=0, le=10)
    rooms: int | None = Field(None, ge=1, le=5)
    min_price_per_night: int | None = Field(None, ge=0, le=10_000_000, description="Rupees")
    max_price_per_night: int | None = Field(None, ge=0, le=10_000_000, description="Rupees")
    amenities: list[Slug] = Field(default_factory=list, max_length=12)
    sort: SortOption = "recommended"


class ChatTurn(APIModel):
    # Only plain text from earlier turns. Tool calls and their results are never accepted from
    # the browser, so a client can't feed the model invented prices or availability.
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(APIModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=30)
    criteria: StayCriteria = Field(default_factory=StayCriteria)


class RoomOption(BaseModel):
    room_type_id: str
    name: str
    available_units: int
    meal_plan: MealPlan
    per_night_paise: int
    total_paise: int


class AssistantResort(BaseModel):
    id: str
    slug: str
    name: str
    is_sample: bool
    destination: DestinationRef
    property_type: PropertyType
    amenities: list[str]
    cover_image: Image | None = None
    rating: RatingSummary
    rooms: list[RoomOption]
    per_night_paise: int
    total_paise: int
    nights: int


class AssistantResults(BaseModel):
    resorts: list[AssistantResort]
    total: int
    # Set when nothing matched exactly and the cards come from a relaxed search.
    relaxed: str | None = None


class ChatResponse(BaseModel):
    reply: str
    criteria: StayCriteria
    missing: list[str]
    results: AssistantResults | None = None


class AssistantStatus(BaseModel):
    enabled: bool
