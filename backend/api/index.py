"""Vercel entry point: Vercel's Python runtime serves the ASGI `app` exported here.

Every request is rewritten to this function (see vercel.json); FastAPI does the routing.
"""

from app.main import app  # noqa: F401
