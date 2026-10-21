"""The signed-in user's own profile, sessions and favourites."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.api.deps import CurrentUserDep, CustomerDep, DbDep
from app.schemas.auth import ProfileUpdate, SessionOut, UserOut
from app.schemas.common import IdPath, Page, Pagination, oid, pagination_params
from app.schemas.resorts import ResortCard
from app.services.auth_service import user_out
from app.services.favourite_service import FavouriteService
from app.services.user_service import UserService

router = APIRouter(tags=["account"])


@router.get("/users/me", response_model=UserOut)
async def me(user: CurrentUserDep):
    return user_out(user)


@router.patch("/users/me", response_model=UserOut)
async def update_me(body: ProfileUpdate, user: CurrentUserDep, db: DbDep):
    """Update name, phone, preferences (and owner profile for owners). Email and role are not
    editable here."""
    return await UserService(db).update_profile(user, body)


@router.get("/users/me/sessions", response_model=list[SessionOut])
async def my_sessions(user: CurrentUserDep, db: DbDep):
    return await UserService(db).sessions(user)


@router.delete("/users/me", status_code=204)
async def delete_me(user: CurrentUserDep, db: DbDep):
    await UserService(db).delete_account(user)
    return Response(status_code=204)


@router.get("/favourites", response_model=Page[ResortCard])
async def list_favourites(
    user: CustomerDep, db: DbDep, pagination: Annotated[Pagination, Depends(pagination_params)]
):
    return await FavouriteService(db).page(user["_id"], pagination.page, pagination.page_size)


@router.get("/favourites/ids", response_model=list[str])
async def favourite_ids(user: CustomerDep, db: DbDep):
    """Just the ids — lets the UI show filled hearts without loading every card."""
    return await FavouriteService(db).ids(user["_id"])


@router.put("/favourites/{resort_id}", status_code=204)
async def add_favourite(resort_id: IdPath, user: CustomerDep, db: DbDep):
    await FavouriteService(db).add(user["_id"], oid(resort_id))
    return Response(status_code=204)


@router.delete("/favourites/{resort_id}", status_code=204)
async def remove_favourite(resort_id: IdPath, user: CustomerDep, db: DbDep):
    await FavouriteService(db).remove(user["_id"], oid(resort_id))
    return Response(status_code=204)
