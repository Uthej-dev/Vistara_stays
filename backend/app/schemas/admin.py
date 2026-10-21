from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from app.schemas.common import APIModel, ISODate, ObjectIdStr

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class ReasonRequired(APIModel):
    reason: Reason


class CouponIn(APIModel):
    code: Annotated[
        str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z0-9]{4,20}$")
    ]
    type: Literal["percent", "flat"]
    value: int = Field(ge=1, le=10_000_000)
    max_discount_paise: int | None = Field(None, ge=100, le=10_000_000)
    min_subtotal_paise: int = Field(0, ge=0, le=100_000_000)
    valid_from: ISODate | None = None
    valid_to: ISODate | None = None
    usage_limit: int | None = Field(None, ge=1, le=1_000_000)
    per_user_limit: int | None = Field(None, ge=1, le=100)
    resort_ids: list[ObjectIdStr] | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def check(self):
        if self.type == "percent" and self.value > 90:
            raise ValueError("Percent discounts can be at most 90%")
        if self.valid_from and self.valid_to and self.valid_to < self.valid_from:
            raise ValueError("valid_to must be after valid_from")
        return self


class TaxSlab(APIModel):
    up_to_paise_per_night: int | None = Field(None, ge=0)
    rate_pct: float = Field(ge=0, le=40)


class SettingsUpdate(APIModel):
    tax_slabs: list[TaxSlab] | None = Field(None, min_length=1, max_length=6)
    service_fee_pct: float | None = Field(None, ge=0, le=20)
    hold_minutes: int | None = Field(None, ge=5, le=60)
    max_advance_days: int | None = Field(None, ge=30, le=730)
    max_nights: int | None = Field(None, ge=1, le=60)
    max_rooms_per_booking: int | None = Field(None, ge=1, le=10)
    owner_confirmation_hours: int | None = Field(None, ge=1, le=72)

    @model_validator(mode="after")
    def slabs_are_ordered(self):
        if self.tax_slabs:
            limits = [s.up_to_paise_per_night for s in self.tax_slabs]
            if limits[-1] is not None or any(v is None for v in limits[:-1]):
                raise ValueError(
                    "Only the last tax slab may be open-ended (up_to_paise_per_night = null)"
                )
            if limits[:-1] != sorted(limits[:-1]):
                raise ValueError("Tax slabs must be in ascending order")
        return self
