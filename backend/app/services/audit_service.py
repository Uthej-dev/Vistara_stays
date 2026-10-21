"""Append-only audit log for sensitive actions (admin decisions, cancellations, role changes)."""

from bson import ObjectId
from pymongo.asynchronous.client_session import AsyncClientSession
from pymongo.asynchronous.database import AsyncDatabase

from app.utils.dates import now_utc


async def audit(
    db: AsyncDatabase,
    *,
    actor: dict | None,
    action: str,
    target_type: str,
    target_id: ObjectId | str,
    reason: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
    request_id: str | None = None,
    session: AsyncClientSession | None = None,
) -> None:
    await db["audit_logs"].insert_one(
        {
            "actor_id": actor["_id"] if actor else None,
            "actor_role": actor["role"] if actor else "system",
            "actor_email": actor.get("email") if actor else None,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "reason": reason,
            "before": before,
            "after": after,
            "request_id": request_id,
            "at": now_utc(),
        },
        session=session,
    )
