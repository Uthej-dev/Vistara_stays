"""Pure pricing functions (no database access) — see docs/06-booking-engine.md §7.

Everything is integer paise. Percentages use Decimal with round-half-up at each line item, so the
same inputs always produce the same totals, and the frontend never computes money itself.
"""

import math
from dataclasses import dataclass
from datetime import date

from app.utils.dates import is_weekend_night, iso
from app.utils.money import format_inr, percent_of


@dataclass(frozen=True)
class Guests:
    adults: int
    children: int
    child_ages: tuple[int, ...] | None = None  # None → treat every child as counted (search)

    def counted_children(self, child_free_age: int) -> int:
        """Children at or above the free age count toward occupancy and extra charges."""
        if self.child_ages is None:
            return self.children
        return sum(1 for age in self.child_ages if age >= child_free_age)


def occupancy_problem(room: dict, rooms: int, guests: Guests, child_free_age: int) -> str | None:
    """Returns a human-readable reason if the guests don't fit, else None."""
    if guests.adults < rooms:
        return "Each room needs at least one adult."
    children = guests.counted_children(child_free_age)
    per_room_adults = math.ceil(guests.adults / rooms)
    per_room_children = math.ceil(children / rooms) if children else 0
    per_room_total = math.ceil((guests.adults + children) / rooms)
    if per_room_adults > room["max_adults"]:
        return f"Up to {room['max_adults']} adults per room."
    if per_room_children > room["max_children"]:
        return f"Up to {room['max_children']} children per room."
    if per_room_total > room["max_occupancy"]:
        return f"Up to {room['max_occupancy']} guests per room."
    return None


def applicable_rule(rules: list[dict], night: date) -> dict | None:
    night_iso, weekday = iso(night), night.weekday()
    matching = [
        r
        for r in rules
        if r.get("is_active", True)
        and r["start_date"] <= night_iso <= r["end_date"]
        and (not r.get("days_of_week") or weekday in r["days_of_week"])
    ]
    if not matching:
        return None
    # Highest priority wins; ties go to the most recently created rule.
    return max(matching, key=lambda r: (r.get("priority", 0), r.get("created_at") or 0))


def nightly_rate(
    room: dict, night: date, inventory: dict | None, rules: list[dict]
) -> tuple[int, str]:
    """(rate_paise, source) for one room on one night. Precedence:
    date override > seasonal rule > weekend rate > base rate."""
    if inventory and inventory.get("price_override_paise") is not None:
        return inventory["price_override_paise"], "date_override"
    weekend = is_weekend_night(night) and room.get("weekend_rate_paise")
    base = room["weekend_rate_paise"] if weekend else room["base_rate_paise"]
    rule = applicable_rule(rules, night)
    if rule:
        adj = rule["adjustment"]
        if adj["type"] == "fixed_rate":
            return int(adj["value"]), f"rule:{rule.get('name', 'seasonal')}"
        return base + percent_of(base, adj["value"]), f"rule:{rule.get('name', 'seasonal')}"
    return base, "weekend" if weekend else "base"


def extra_guests(room: dict, rooms: int, guests: Guests, child_free_age: int) -> tuple[int, int]:
    """(extra_adults, extra_children) beyond the base occupancy included in the rate."""
    included = room["base_occupancy"] * rooms
    extra_adults = max(0, guests.adults - included)
    spare = max(0, included - guests.adults)
    extra_children = max(0, guests.counted_children(child_free_age) - spare)
    return extra_adults, extra_children


def tax_rate_for(per_room_tariff: int, slabs: list[dict]) -> int | float:
    """GST slab chosen by the per-room, per-night tariff."""
    for slab in slabs:
        limit = slab.get("up_to_paise_per_night")
        if limit is None or per_room_tariff <= limit:
            return slab["rate_pct"]
    return slabs[-1]["rate_pct"]


def allocate(total: int, weights: list[int]) -> list[int]:
    """Split `total` across weights proportionally in whole paise (largest remainder)."""
    weight_sum = sum(weights)
    if not total or not weight_sum:
        return [0] * len(weights)
    raw = [total * w / weight_sum for w in weights]
    shares = [math.floor(x) for x in raw]
    order = sorted(range(len(weights)), key=lambda i: raw[i] - shares[i], reverse=True)
    for i in order[: total - sum(shares)]:
        shares[i] += 1
    return shares


def coupon_discount(coupon: dict | None, subtotal: int) -> int:
    if not coupon:
        return 0
    if coupon["type"] == "percent":
        amount = percent_of(subtotal, coupon["value"])
        if coupon.get("max_discount_paise"):
            amount = min(amount, coupon["max_discount_paise"])
    else:
        amount = int(coupon["value"])
    return min(amount, subtotal)


def quote(
    *,
    room: dict,
    nights: list[date],
    rooms: int,
    guests: Guests,
    child_free_age: int,
    inventory_by_date: dict[str, dict],
    rules: list[dict],
    settings: dict,
    coupon: dict | None = None,
) -> dict:
    """Itemised price for a stay. Same inputs → same output, always."""
    extra_a, extra_c = extra_guests(room, rooms, guests, child_free_age)
    extra_per_night = extra_a * room.get("extra_adult_paise", 0) + extra_c * room.get(
        "extra_child_paise", 0
    )

    lines = []
    for night in nights:
        rate, source = nightly_rate(room, night, inventory_by_date.get(iso(night)), rules)
        lines.append({"date": iso(night), "rate_paise": rate, "source": source})

    room_subtotal = sum(line["rate_paise"] for line in lines) * rooms
    extra_total = extra_per_night * len(nights)
    subtotal = room_subtotal + extra_total
    discount = coupon_discount(coupon, subtotal)

    # Tax per night: the slab depends on that night's per-room tariff.
    night_amounts = [line["rate_paise"] * rooms + extra_per_night for line in lines]
    discount_shares = allocate(discount, night_amounts)
    taxes: dict[float, int] = {}
    for line, amount, share in zip(lines, night_amounts, discount_shares, strict=True):
        pct = tax_rate_for(line["rate_paise"], settings["tax_slabs"])
        taxes[pct] = taxes.get(pct, 0) + percent_of(amount - share, pct)

    taxable = subtotal - discount
    tax_total = sum(taxes.values())
    service_fee = percent_of(taxable, settings.get("service_fee_pct", 0))
    total = taxable + tax_total + service_fee
    return {
        "currency": "INR",
        "nights": lines,
        "nights_count": len(nights),
        "rooms": rooms,
        "extra_adults": extra_a,
        "extra_children": extra_c,
        "room_subtotal_paise": room_subtotal,
        "extra_guest_paise": extra_total,
        "discount_paise": discount,
        "coupon_code": coupon["code"] if coupon and discount else None,
        "taxable_paise": taxable,
        "taxes": [
            {"label": f"GST {pct}%", "rate_pct": pct, "amount_paise": amount}
            for pct, amount in sorted(taxes.items())
        ],
        "tax_total_paise": tax_total,
        "service_fee_pct": settings.get("service_fee_pct", 0),
        "service_fee_paise": service_fee,
        "total_paise": total,
        "avg_per_night_paise": round(total / len(nights)) if nights else 0,
        "meal_plan": room["meal_plan"],
        "summary": f"{format_inr(total)} for {len(nights)} night(s), {rooms} room(s), incl. taxes & fees",
    }
