"""Administrator API. Role `admin` required; every mutation is written to the audit log."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request

from app.api.deps import AdminDep, DbDep
from app.models.enums import ResortStatus
from app.schemas.common import IdPath, Pagination, oid, pagination_params
from app.schemas.owner import OptionalReason
from app.services.email_service import EmailService
from app.services.moderation_service import ModerationService

router = APIRouter(prefix="/admin", tags=["admin"])


def moderation(request: Request, db: DbDep) -> ModerationService:
    return ModerationService(
        db, EmailService(request.app.state.settings, request.app.state.email_outbox)
    )


Moderation = Annotated[ModerationService, Depends(moderation)]


@router.get("/resorts")
async def list_resorts(
    admin: AdminDep,
    svc: Moderation,
    pagination: Annotated[Pagination, Depends(pagination_params)],
    status: ResortStatus | None = None,
):
    return await svc.page(status, pagination.page, pagination.page_size)


@router.get("/resorts/{resort_id}")
async def get_resort(resort_id: IdPath, admin: AdminDep, svc: Moderation):
    return await svc.detail(oid(resort_id))


@router.post("/resorts/{resort_id}/{action}")
async def moderate_resort(
    resort_id: IdPath,
    action: Literal["approve", "reject", "suspend", "unsuspend"],
    admin: AdminDep,
    svc: Moderation,
    body: OptionalReason | None = None,
):
    """approve / unsuspend need no reason; reject / suspend require one (shown to the owner)."""
    return await svc.decide(admin, oid(resort_id), action, body.reason if body else None)
