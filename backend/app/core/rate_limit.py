"""A small in-memory fixed-window rate limiter.

Good enough for a single server instance (our Render deployment). If the API ever runs on
several instances, swap the storage for Redis so limits are shared — the interface stays the same.
"""

import threading
import time

from app.core.errors import RateLimitedError


class RateLimiter:
    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._hits: dict[str, tuple[float, int]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_seconds: int) -> None:
        """Record one request for `key`; raise RateLimitedError if over the limit."""
        now = self._clock()
        with self._lock:
            window_start, count = self._hits.get(key, (now, 0))
            if now - window_start >= window_seconds:
                window_start, count = now, 0
            count += 1
            self._hits[key] = (window_start, count)
            if len(self._hits) > 50_000:  # bound memory: drop expired windows
                self._hits = {k: v for k, v in self._hits.items() if now - v[0] < window_seconds}
        if count > limit:
            raise RateLimitedError(retry_after=max(1, int(window_start + window_seconds - now)))

    def count(self, key: str, window_seconds: int) -> int:
        now = self._clock()
        window_start, count = self._hits.get(key, (now, 0))
        return 0 if now - window_start >= window_seconds else count

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)
