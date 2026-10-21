"""Unit tests for the pure pricing engine (no database)."""

from datetime import date, timedelta

import pytest

from app.services.platform_settings import DEFAULT_SETTINGS
from app.services.pricing import (
    Guests,
    allocate,
    nightly_rate,
    occupancy_problem,
    quote,
    tax_rate_for,
)

ROOM = {
    "base_rate_paise": 500000,
    "weekend_rate_paise": 600000,
    "base_occupancy": 2,
    "max_adults": 3,
    "max_children": 2,
    "max_occupancy": 4,
    "extra_adult_paise": 100000,
    "extra_child_paise": 50000,
    "meal_plan": "breakfast",
}
MON, FRI, SAT, SUN = date(2026, 12, 7), date(2026, 12, 11), date(2026, 12, 12), date(2026, 12, 13)
NO_FEE = {**DEFAULT_SETTINGS, "service_fee_pct": 0}


def nights(start: date, count: int) -> list[date]:
    return [start + timedelta(days=i) for i in range(count)]


def q(**overrides):
    args = {
        "room": ROOM,
        "nights": nights(MON, 2),
        "rooms": 1,
        "guests": Guests(2, 0),
        "child_free_age": 5,
        "inventory_by_date": {},
        "rules": [],
        "settings": NO_FEE,
    } | overrides
    return quote(**args)


# ---------- nightly rate precedence ----------


def test_weekday_and_weekend_rates():
    assert nightly_rate(ROOM, MON, None, []) == (500000, "base")
    assert nightly_rate(ROOM, FRI, None, []) == (600000, "weekend")
    assert nightly_rate(ROOM, SAT, None, []) == (600000, "weekend")
    assert nightly_rate(ROOM, SUN, None, []) == (500000, "base")  # Sunday night is a weekday night


def test_seasonal_percent_rule_stacks_on_weekend_rate():
    rule = {
        "name": "Christmas",
        "start_date": "2026-12-01",
        "end_date": "2026-12-31",
        "adjustment": {"type": "percent", "value": 40},
        "priority": 1,
    }
    assert nightly_rate(ROOM, MON, None, [rule]) == (700000, "rule:Christmas")
    assert nightly_rate(ROOM, SAT, None, [rule]) == (840000, "rule:Christmas")


def test_highest_priority_rule_wins_and_day_filter_applies():
    low = {
        "name": "low",
        "start_date": "2026-12-01",
        "end_date": "2026-12-31",
        "adjustment": {"type": "percent", "value": 10},
        "priority": 1,
    }
    high = {
        "name": "high",
        "start_date": "2026-12-01",
        "end_date": "2026-12-31",
        "adjustment": {"type": "fixed_rate", "value": 999900},
        "priority": 5,
        "days_of_week": [0],
    }
    assert nightly_rate(ROOM, MON, None, [low, high]) == (
        999900,
        "rule:high",
    )  # Monday matches day 0
    assert nightly_rate(ROOM, SUN, None, [low, high]) == (550000, "rule:low")


def test_date_override_beats_everything():
    rule = {
        "name": "x",
        "start_date": "2026-12-01",
        "end_date": "2026-12-31",
        "adjustment": {"type": "percent", "value": 40},
    }
    assert nightly_rate(ROOM, SAT, {"price_override_paise": 1800000}, [rule]) == (
        1800000,
        "date_override",
    )


# ---------- totals ----------


def test_two_weeknights_one_room_gst_5_percent():
    result = q()
    assert result["room_subtotal_paise"] == 1000000
    assert result["taxes"] == [{"label": "GST 5%", "rate_pct": 5, "amount_paise": 50000}]
    assert result["total_paise"] == 1050000
    assert result["nights_count"] == 2


def test_check_out_is_exclusive_friday_to_sunday_is_two_weekend_nights():
    result = q(nights=nights(FRI, 2))
    assert [n["date"] for n in result["nights"]] == ["2026-12-11", "2026-12-12"]
    assert result["room_subtotal_paise"] == 1200000


def test_gst_slab_switches_above_7500_per_room_night():
    pricey = {**ROOM, "base_rate_paise": 800000, "weekend_rate_paise": 800000}
    result = q(room=pricey)
    assert result["taxes"] == [{"label": "GST 18%", "rate_pct": 18, "amount_paise": 288000}]


def test_mixed_slabs_in_one_stay_are_itemised():
    override = {"2026-12-08": {"price_override_paise": 900000}}
    result = q(inventory_by_date=override)
    assert {t["rate_pct"]: t["amount_paise"] for t in result["taxes"]} == {5: 25000, 18: 162000}


def test_tax_slab_boundary_is_inclusive():
    assert tax_rate_for(750000, DEFAULT_SETTINGS["tax_slabs"]) == 5
    assert tax_rate_for(750001, DEFAULT_SETTINGS["tax_slabs"]) == 18


def test_extra_guests_charged_above_base_occupancy():
    result = q(guests=Guests(3, 1, (8,)))
    assert (result["extra_adults"], result["extra_children"]) == (1, 1)
    assert result["extra_guest_paise"] == (100000 + 50000) * 2


def test_young_children_are_free_and_do_not_count():
    result = q(guests=Guests(2, 2, (2, 4)))
    assert result["extra_children"] == 0 and result["extra_guest_paise"] == 0


def test_multiple_rooms_share_base_occupancy():
    result = q(rooms=2, guests=Guests(4, 0))
    assert result["room_subtotal_paise"] == 2000000
    assert result["extra_guest_paise"] == 0


def test_percent_coupon_with_cap_reduces_tax_base():
    coupon = {"code": "MONSOON10", "type": "percent", "value": 10, "max_discount_paise": 50000}
    result = q(coupon=coupon)
    assert result["discount_paise"] == 50000  # 10% of ₹10,000 = ₹1,000, capped at ₹500
    assert result["taxable_paise"] == 950000
    assert result["tax_total_paise"] == 47500
    assert result["coupon_code"] == "MONSOON10"


def test_flat_coupon_never_exceeds_subtotal():
    result = q(coupon={"code": "BIG", "type": "flat", "value": 99999999})
    assert result["discount_paise"] == result["room_subtotal_paise"]
    assert result["total_paise"] == 0


def test_service_fee_rounds_half_up():
    result = q(
        settings={**DEFAULT_SETTINGS, "service_fee_pct": 2.5},
        room={**ROOM, "base_rate_paise": 333333},
    )
    # taxable 666,666 × 2.5% = 16,666.65 → 16,667
    assert result["service_fee_paise"] == 16667
    assert result["total_paise"] == result["taxable_paise"] + result["tax_total_paise"] + 16667


def test_totals_always_add_up():
    result = q(
        nights=nights(FRI, 5),
        rooms=2,
        guests=Guests(5, 1, (10,)),
        coupon={"code": "X", "type": "percent", "value": 7},
        settings=DEFAULT_SETTINGS,
    )
    assert result["total_paise"] == (
        result["room_subtotal_paise"]
        + result["extra_guest_paise"]
        - result["discount_paise"]
        + result["tax_total_paise"]
        + result["service_fee_paise"]
    )


@pytest.mark.parametrize(
    "total,weights", [(100, [1, 1, 1]), (7, [5, 3]), (0, [1, 2]), (50000, [500000, 600000, 600000])]
)
def test_allocate_is_exact(total, weights):
    shares = allocate(total, weights)
    assert sum(shares) == total and all(s >= 0 for s in shares)


# ---------- occupancy ----------


@pytest.mark.parametrize(
    "rooms,guests,expected",
    [
        (1, Guests(2, 0), None),
        (1, Guests(4, 0), "Up to 3 adults per room."),
        (2, Guests(1, 0), "Each room needs at least one adult."),
        (1, Guests(2, 3, (6, 7, 8)), "Up to 2 children per room."),
        (1, Guests(3, 2, (6, 7)), "Up to 4 guests per room."),
        (1, Guests(2, 3, (1, 2, 3)), None),  # under-5s don't count
        (2, Guests(6, 0), None),
    ],
)
def test_occupancy_rules(rooms, guests, expected):
    assert occupancy_problem(ROOM, rooms, guests, child_free_age=5) == expected
