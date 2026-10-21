"""Public catalogue: destinations, categories and resort search/details."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import DbDep, OptionalUserDep
from app.models.enums import CategoryKind, State
from app.schemas.destinations import CategoryOut, DestinationOut
from app.schemas.resorts import (
    ResortCard,
    ResortDetail,
    ResortSearchParams,
    SearchResponse,
    search_params,
)
from app.services.catalog_service import CatalogService
from app.services.resort_service import ResortService
from app.services.search_service import SearchService

router = APIRouter(tags=["catalogue"])


@router.get("/destinations", response_model=list[DestinationOut])
async def list_destinations(
    db: DbDep,
    state: State | None = None,
    type: Annotated[str | None, Query(max_length=40)] = None,  # noqa: A002
    featured: bool = False,
):
    """All active destinations, ordered by featured rank then name."""
    return await CatalogService(db).list_destinations(
        state=state, dest_type=type, featured=featured
    )


@router.get("/destinations/{slug}", response_model=DestinationOut)
async def get_destination(slug: str, db: DbDep):
    return await CatalogService(db).get_destination(slug)


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: DbDep, kind: CategoryKind | None = None):
    """Categories, amenities and surroundings — the data behind filter lists."""
    return await CatalogService(db).list_categories(kind)


@router.get("/resorts/search", response_model=SearchResponse)
async def search_resorts(db: DbDep, params: Annotated[ResortSearchParams, Depends(search_params)]):
    """Search published resorts. See docs/05-api-spec.md for every parameter."""
    return await SearchService(db).search(params)


@router.get("/resorts/featured", response_model=list[ResortCard])
async def featured_resorts(db: DbDep, limit: Annotated[int, Query(ge=1, le=24)] = 8):
    return await SearchService(db).featured(limit)


@router.get("/resorts/{slug}", response_model=ResortDetail)
async def get_resort(slug: str, db: DbDep, user: OptionalUserDep):
    return await ResortService(db).get_published(slug, user["_id"] if user else None)
