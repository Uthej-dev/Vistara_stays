"""In-app notifications (booking updates, listing decisions, new reservations for owners)."""

from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.api.deps import CurrentUserDep, DbDep
from app.core.errors import NotFoundError
from app.schemas.common import IdPath, oid
from app.utils.dates import now_utc
from app.utils.text import serialize

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    user: CurrentUserDep, db: DbDep, limit: Annotated[int, Query(ge=1, le=50)] = 20
):
    docs = (
        await db["notifications"]
        .find({"user_id": user["_id"]})
        .sort("created_at", -1)
        .limit(limit)
        .to_list(limit)
    )
    unread = await db["notifications"].count_documents({"user_id": user["_id"], "read_at": None})
    items = [{k: v for k, v in serialize(d).items() if k != "user_id"} for d in docs]
    return {"items": items, "unread": unread}


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(notification_id: IdPath, user: CurrentUserDep, db: DbDep):
    result = await db["notifications"].update_one(
        {"_id": oid(notification_id), "user_id": user["_id"]}, {"$set": {"read_at": now_utc()}}
    )
    if not result.matched_count:
        raise NotFoundError()
    return Response(status_code=204)


@router.post("/read-all", status_code=204)
async def mark_all_read(user: CurrentUserDep, db: DbDep):
    await db["notifications"].update_many(
        {"user_id": user["_id"], "read_at": None}, {"$set": {"read_at": now_utc()}}
    )
    return Response(status_code=204)
