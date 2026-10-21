"""Reusable FastAPI dependencies, injected into route functions with `Depends(...)`.

Auth dependencies (get_current_user, require_role) are added here in Phase 5.
"""

from typing import Annotated

from fastapi import Depends, Request
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import Settings


def get_app_settings(request: Request) -> Settings:
    """The settings this app instance was created with (tests inject their own)."""
    return request.app.state.settings


def get_db(request: Request) -> AsyncDatabase:
    """The database handle created at startup (see `lifespan` in main.py)."""
    return request.app.state.db


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DbDep = Annotated[AsyncDatabase, Depends(get_db)]
