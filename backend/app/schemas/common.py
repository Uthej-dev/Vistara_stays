"""Types shared by many schemas: ObjectId strings, pagination, images, money."""

import math
from typing import Annotated, Generic, TypeVar

from bson import ObjectId
from fastapi import Path, Query
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.core.errors import NotFoundError

T = TypeVar("T")

# A 24-character hex MongoDB id. Anything else fails validation with 422 (never a 500).
ObjectIdStr = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{24}$")]
IdPath = Annotated[str, Path(pattern=r"^[0-9a-f]{24}$", description="MongoDB ObjectId")]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$", max_length=80)]
ISODate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]


def oid(value: str) -> ObjectId:
    """Convert a validated id string to ObjectId; invalid ids are treated as 'not found'."""
    if not ObjectId.is_valid(value):
        raise NotFoundError()
    return ObjectId(value)


def _strip(value: str) -> str:
    return value.strip()


TrimmedStr = Annotated[str, AfterValidator(_strip)]


class APIModel(BaseModel):
    """Base for request bodies: unknown fields are rejected, so clients can't sneak in
    `role`, `owner_id`, `total_paise`, etc."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ImageCredit(BaseModel):
    author: str
    license: str | None = None
    licenseUrl: str | None = None
    sourceUrl: str | None = None


class Image(BaseModel):
    src: str
    srcSet: dict[str, str] | None = None
    alt: str = ""
    width: int | None = None
    height: int | None = None
    public_id: str | None = None
    credit: ImageCredit | None = None


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    total_pages: int

    @classmethod
    def build(cls, items: list, page: int, page_size: int, total: int) -> "Page":
        return cls(
            items=items,
            page=page,
            page_size=page_size,
            total=total,
            total_pages=max(1, math.ceil(total / page_size)) if total else 0,
        )


class Pagination(BaseModel):
    page: int = Field(1, ge=1, le=1000)
    page_size: int = Field(20, ge=1, le=50)

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.page_size


def pagination_params(
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
) -> Pagination:
    return Pagination(page=page, page_size=page_size)


class Message(BaseModel):
    message: str
