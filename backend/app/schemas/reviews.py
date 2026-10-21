from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.common import APIModel, ObjectIdStr

Stars = Annotated[int, Field(ge=1, le=5)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=2000)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


class SubRatings(APIModel):
    cleanliness: Stars | None = None
    location: Stars | None = None
    service: Stars | None = None
    facilities: Stars | None = None


class ReviewCreate(APIModel):
    booking_id: ObjectIdStr
    rating: Stars
    sub_ratings: SubRatings | None = None
    title: Title | None = None
    body: Body


class ReviewUpdate(APIModel):
    rating: Stars | None = None
    sub_ratings: SubRatings | None = None
    title: Title | None = None
    body: Body | None = None


class ReportCreate(APIModel):
    reason: Literal["spam", "offensive", "not_genuine", "private_info", "other"]
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class ReplyBody(APIModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=1500)]
