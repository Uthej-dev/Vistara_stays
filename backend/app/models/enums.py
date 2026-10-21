"""Enumerations stored in MongoDB. Using StrEnum keeps the stored value a plain string."""

from enum import StrEnum


class Role(StrEnum):
    CUSTOMER = "customer"
    OWNER = "owner"
    ADMIN = "admin"


class UserStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class ResortStatus(StrEnum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class PropertyType(StrEnum):
    RESORT = "resort"
    VILLA = "villa"
    COTTAGE = "cottage"
    HOMESTAY = "homestay"
    BOUTIQUE_HOTEL = "boutique_hotel"
    TREEHOUSE = "treehouse"
    HOUSEBOAT = "houseboat"
    TENT = "tent"


class MealPlan(StrEnum):
    ROOM_ONLY = "room_only"
    BREAKFAST = "breakfast"
    HALF_BOARD = "half_board"
    FULL_BOARD = "full_board"


class BookingMode(StrEnum):
    INSTANT = "instant"
    REQUEST = "request"


class RoomTypeStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class BookingStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    PENDING_OWNER = "pending_owner"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    EXPIRED = "expired"
    NO_SHOW = "no_show"


# Statuses whose rooms count against inventory.
ACTIVE_BOOKING_STATUSES = (
    BookingStatus.PENDING_PAYMENT,
    BookingStatus.PENDING_OWNER,
    BookingStatus.CONFIRMED,
)


class PaymentStatus(StrEnum):
    UNPAID = "unpaid"
    PAID = "paid"
    FAILED = "failed"
    REFUND_PENDING = "refund_pending"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"


class ReviewStatus(StrEnum):
    PUBLISHED = "published"
    HIDDEN = "hidden"
    REMOVED = "removed"


class CategoryKind(StrEnum):
    CATEGORY = "category"
    AMENITY = "amenity"
    SURROUNDING = "surrounding"


class State(StrEnum):
    ANDHRA_PRADESH = "andhra_pradesh"
    TELANGANA = "telangana"
    KARNATAKA = "karnataka"
    KERALA = "kerala"
    TAMIL_NADU = "tamil_nadu"
