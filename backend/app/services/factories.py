"""Builds services with the right collaborators for the current settings."""

from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import Settings
from app.services.booking_service import BookingService
from app.services.email_service import EmailService


def make_booking_service(
    db: AsyncDatabase, settings: Settings, outbox: list | None = None, razorpay_client=None
) -> BookingService:
    """BookingService wired with email and, when Razorpay is on, a refunder that calls the provider."""
    email = EmailService(settings, outbox)
    service = BookingService(db, email, settings)
    if settings.payment_provider == "razorpay":
        from app.services.payment_service import PaymentService

        payments = PaymentService(db, settings, service, razorpay_client)
        service.refunder = lambda booking_id, amount, reason: payments.refund(
            booking_id, amount, reason=reason
        )
    return service
