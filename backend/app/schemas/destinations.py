from pydantic import BaseModel, Field

from app.models.enums import CategoryKind, State
from app.schemas.common import APIModel, Image, Slug, TrimmedStr


class GeoPoint(BaseModel):
    lat: float
    lng: float


class DestinationOut(BaseModel):
    id: str
    slug: str
    name: str
    state: State
    district: str
    region: str | None = None
    types: list[str]
    best_months: list[int]
    summary: str
    location: GeoPoint
    image: Image | None = None
    featured_rank: int | None = None
    is_active: bool = True
    resort_count: int = 0
    starting_price_paise: int | None = None


class CategoryOut(BaseModel):
    id: str
    slug: str
    kind: CategoryKind
    name: str
    icon: str | None = None
    blurb: str | None = None
    sort_order: int = 0


class DestinationCreate(APIModel):
    slug: Slug
    name: TrimmedStr = Field(min_length=2, max_length=80)
    state: State
    district: TrimmedStr = Field(min_length=2, max_length=80)
    region: str | None = Field(None, max_length=80)
    types: list[Slug] = Field(min_length=1, max_length=6)
    best_months: list[int] = Field(min_length=1, max_length=12)
    summary: TrimmedStr = Field(min_length=10, max_length=400)
    lat: float = Field(ge=6, le=20)  # South India bounding box
    lng: float = Field(ge=72, le=86)
    featured_rank: int | None = Field(None, ge=1, le=100)
    is_active: bool = True
    image: Image | None = None


class DestinationUpdate(APIModel):
    name: str | None = Field(None, min_length=2, max_length=80)
    district: str | None = Field(None, min_length=2, max_length=80)
    region: str | None = Field(None, max_length=80)
    types: list[Slug] | None = Field(None, min_length=1, max_length=6)
    best_months: list[int] | None = Field(None, min_length=1, max_length=12)
    summary: str | None = Field(None, min_length=10, max_length=400)
    featured_rank: int | None = Field(None, ge=1, le=100)
    is_active: bool | None = None
    image: Image | None = None


class CategoryCreate(APIModel):
    slug: Slug
    kind: CategoryKind
    name: TrimmedStr = Field(min_length=2, max_length=60)
    icon: str | None = Field(None, max_length=40)
    blurb: str | None = Field(None, max_length=120)
    sort_order: int = Field(0, ge=0, le=1000)


class CategoryUpdate(APIModel):
    name: str | None = Field(None, min_length=2, max_length=60)
    icon: str | None = Field(None, max_length=40)
    blurb: str | None = Field(None, max_length=120)
    sort_order: int | None = Field(None, ge=0, le=1000)
    is_active: bool | None = None
