"""Money helpers. All amounts are integer paise (₹1 = 100 paise); never floats."""

from decimal import ROUND_HALF_UP, Decimal


def percent_of(amount_paise: int, percent: float | int | Decimal) -> int:
    """round_half_up(amount × percent / 100), computed with Decimal to avoid float error."""
    value = Decimal(amount_paise) * Decimal(str(percent)) / Decimal(100)
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def format_inr(paise: int) -> str:
    rupees = Decimal(paise) / 100
    whole = int(rupees.quantize(Decimal(1), rounding=ROUND_HALF_UP))
    s = str(abs(whole))
    # Indian digit grouping: last 3 digits, then groups of 2 (12,34,567).
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    return f"{'-' if whole < 0 else ''}₹{s}"
