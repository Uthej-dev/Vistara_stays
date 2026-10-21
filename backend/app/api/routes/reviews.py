"""Reviews: public reading, customer writing/reporting, owner replies."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import CurrentUserDep, CustomerDep, DbDep, OwnerDep, rate_limit
from app.schemas.common import IdPath, Pagination, oid, pagination_params
from app.schemas.reviews import ReplyBody, ReportCreate, ReviewCreate, ReviewUpdate
from app.services.review_service import ReviewService

router = APIRouter(tags=["reviews"])


@router.get("/resorts/{resort_id}/reviews")
async def resort_reviews(
    resort_id: IdPath,
    db: DbDep,
    pagination: Annotated[Pagination, Depends(pagination_params)],
    sort: Literal["recent", "highest", "lowest"] = "recent",
):
    """Published reviews plus the rating summary and a 1–5 star histogram."""
    return await ReviewService(db).for_resort(
        oid(resort_id), sort, pagination.page, min(pagination.page_size, 20)
    )


@router.get("/reviews/recent")
async def recent_reviews(db: DbDep, limit: Annotated[int, Query(ge=1, le=12)] = 3):
    """A few recent, highly rated reviews for the home page (sample reviews are flagged)."""
    return await ReviewService(db).recent(limit)


@router.post("/reviews", status_code=201, dependencies=[rate_limit("review", 10, 3600, per="user")])
async def create_review(body: ReviewCreate, user: CustomerDep, db: DbDep):
    """Only the guest of a completed booking can review it, once."""
    return await ReviewService(db).create(user, body)


@router.patch("/reviews/{review_id}")
async def update_review(review_id: IdPath, body: ReviewUpdate, user: CustomerDep, db: DbDep):
    return await ReviewService(db).update(user, oid(review_id), body)


@router.post(
    "/reviews/{review_id}/report",
    status_code=204,
    dependencies=[rate_limit("report", 20, 3600, per="user")],
)
async def report_review(review_id: IdPath, body: ReportCreate, user: CurrentUserDep, db: DbDep):
    await ReviewService(db).report(user, oid(review_id), body)
    return Response(status_code=204)


@router.get("/owner/reviews", tags=["owner"])
async def owner_reviews(
    owner: OwnerDep, db: DbDep, pagination: Annotated[Pagination, Depends(pagination_params)]
):
    return await ReviewService(db).for_owner(owner, pagination.page, pagination.page_size)


@router.put("/owner/reviews/{review_id}/reply", tags=["owner"])
async def reply_to_review(review_id: IdPath, body: ReplyBody, owner: OwnerDep, db: DbDep):
    """One public reply per review (sending again replaces it)."""
    return await ReviewService(db).reply(owner, oid(review_id), body.body)
