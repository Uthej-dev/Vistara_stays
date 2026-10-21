"""Date helpers for stays.

Nights are identified by their start date as "YYYY-MM-DD" strings. All business dates use
India Standard Time: "today" is today in IST, whatever timezone the server runs in.
"""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


def now_utc() -> datetime:
    return datetime.now(UTC)


def today_ist(now: datetime | None = None) -> date:
    return (now or now_utc()).astimezone(IST).date()


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def iso(d: date) -> str:
    return d.isoformat()


def nights_between(check_in: date, check_out: date) -> int:
    """Check-out is exclusive: 12 → 14 Dec is 2 nights."""
    return (check_out - check_in).days


def iter_nights(check_in: date, check_out: date) -> Iterator[date]:
    current = check_in
    while current < check_out:
        yield current
        current += timedelta(days=1)


def is_weekend_night(d: date) -> bool:
    """Friday and Saturday nights are priced as weekend nights."""
    return d.weekday() in (4, 5)
