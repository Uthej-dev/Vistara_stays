"""Administrator API. Role `admin` required; every mutation is written to the audit log."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import AdminDep, DbDep
from app.models.enums import BookingStatus, ResortStatus, ReviewStatus, Role, UserStatus
from app.schemas.admin import CouponIn, ReasonRequired, SettingsUpdate
from app.schemas.common import IdPath, Pagination, oid, pagination_params
from app.schemas.destinations import (
    CategoryCreate,
    CategoryUpdate,
    DestinationCreate,
    DestinationUpdate,
)
from app.schemas.owner import OptionalReason
from app.services.admin_service import AdminService
from app.services.booking_service import BookingService, booking_out
from app.services.email_service import EmailService
from app.services.moderation_service import ModerationService
from app.services.platform_settings import get_platform_settings
from app.services.review_service import ReviewService
from app.utils.text import serialize

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


def admin_service(db: DbDep) -> AdminService:
    return AdminService(db)


Admin = Annotated[AdminService, Depends(admin_service)]
Page = Annotated[Pagination, Depends(pagination_params)]


@router.get("/metrics")
async def metrics(admin: AdminDep, svc: Admin):
    return await svc.metrics()


@router.get("/users")
async def users(
    admin: AdminDep,
    svc: Admin,
    page: Page,
    role: Role | None = None,
    status: UserStatus | None = None,
    q: str | None = None,
):
    return await svc.users(
        role=role, status=status, q=(q or "")[:80] or None, page=page.page, page_size=page.page_size
    )


@router.post("/users/{user_id}/{action}")
async def user_action(
    user_id: IdPath,
    action: Literal["suspend", "reactivate"],
    admin: AdminDep,
    svc: Admin,
    body: OptionalReason | None = None,
):
    """Suspending signs the user out everywhere immediately."""
    return await svc.set_user_status(admin, oid(user_id), action, body.reason if body else None)


@router.get("/bookings")
async def bookings(
    admin: AdminDep,
    svc: Admin,
    page: Page,
    status: BookingStatus | None = None,
    q: str | None = None,
):
    return await svc.bookings(
        status=status, q=(q or "")[:20] or None, page=page.page, page_size=page.page_size
    )


@router.get("/bookings/{booking_id}")
async def booking(booking_id: IdPath, admin: AdminDep, db: DbDep):
    from app.core.errors import NotFoundError

    doc = await db["bookings"].find_one({"_id": oid(booking_id)})
    if not doc:
        raise NotFoundError("Booking not found.")
    payments = await db["payments"].find({"booking_id": doc["_id"]}).to_list(10)
    return {**booking_out(doc, include_preview=False), "payments": serialize(payments)}


@router.post("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: IdPath, body: ReasonRequired, admin: AdminDep, db: DbDep, request: Request
):
    """Admin cancellations refund the guest in full and are audited."""
    from app.core.errors import NotFoundError

    doc = await db["bookings"].find_one({"_id": oid(booking_id)})
    if not doc:
        raise NotFoundError("Booking not found.")
    engine = BookingService(
        db, EmailService(request.app.state.settings, request.app.state.email_outbox)
    )
    return booking_out(
        await engine.cancel(doc, actor=admin, reason=body.reason), include_preview=False
    )


@router.get("/reviews")
async def reviews(
    admin: AdminDep,
    svc: Admin,
    page: Page,
    status: ReviewStatus | None = None,
    reported: bool = False,
):
    return await svc.reviews(
        status=status, reported=reported, page=page.page, page_size=page.page_size
    )


@router.post("/reviews/{review_id}/{action}")
async def moderate_review(
    review_id: IdPath,
    action: Literal["hide", "restore", "remove"],
    admin: AdminDep,
    db: DbDep,
    body: OptionalReason | None = None,
):
    """hide/remove need a reason; the resort's rating is recalculated."""
    return await ReviewService(db).moderate(
        admin, oid(review_id), action, body.reason if body else None
    )


@router.get("/reports")
async def reports(
    admin: AdminDep,
    svc: Admin,
    page: Page,
    status: Literal["open", "actioned", "dismissed"] = "open",
):
    return await svc.reports(status=status, page=page.page, page_size=page.page_size)


@router.post("/reports/{report_id}/dismiss")
async def dismiss_report(report_id: IdPath, admin: AdminDep, svc: Admin):
    return await svc.dismiss_report(admin, oid(report_id))


@router.get("/destinations")
async def destinations(admin: AdminDep, svc: Admin):
    return await svc.destinations()


@router.post("/destinations", status_code=201)
async def create_destination(body: DestinationCreate, admin: AdminDep, svc: Admin):
    """New destinations appear on the site immediately — no frontend change needed."""
    return await svc.create_destination(admin, body)


@router.patch("/destinations/{destination_id}")
async def update_destination(
    destination_id: IdPath, body: DestinationUpdate, admin: AdminDep, svc: Admin
):
    return await svc.update_destination(admin, oid(destination_id), body)


@router.post("/categories", status_code=201)
async def create_category(body: CategoryCreate, admin: AdminDep, svc: Admin):
    return await svc.create_category(admin, body)


@router.patch("/categories/{category_id}")
async def update_category(category_id: IdPath, body: CategoryUpdate, admin: AdminDep, svc: Admin):
    return await svc.update_category(admin, oid(category_id), body)


@router.get("/coupons")
async def coupons(admin: AdminDep, svc: Admin):
    return await svc.coupons()


@router.post("/coupons", status_code=201)
async def create_coupon(body: CouponIn, admin: AdminDep, svc: Admin):
    return await svc.create_coupon(admin, body)


@router.put("/coupons/{coupon_id}")
async def update_coupon(coupon_id: IdPath, body: CouponIn, admin: AdminDep, svc: Admin):
    return await svc.update_coupon(admin, oid(coupon_id), body)


@router.get("/settings")
async def get_settings_(admin: AdminDep, db: DbDep):
    return await get_platform_settings(db)


@router.patch("/settings")
async def update_settings(body: SettingsUpdate, admin: AdminDep, svc: Admin):
    """Tax slabs, service fee, hold length and booking limits. Changes are audited with
    before/after values and apply to new quotes only (existing bookings keep their snapshot)."""
    return await svc.update_settings(admin, body)


@router.get("/audit-logs")
async def audit_logs(
    admin: AdminDep,
    svc: Admin,
    action: str | None = None,
    target_id: str | None = None,
    before: Annotated[str | None, Query(pattern=r"^[0-9a-f]{24}$")] = None,
):
    return await svc.audit_logs(
        action=(action or "")[:60] or None, target_id=(target_id or "")[:60] or None, before=before
    )
