"""Resort search: builds a safe MongoDB query from validated parameters.

Without dates the database does filtering, sorting and paging. With dates, prices and
availability depend on inventory, so candidates are priced by the availability service and
then filtered/sorted/paged in Python (fine at this scale; see docs/04-data-model.md).
"""

import math

from pymongo.asynchronous.database import AsyncDatabase

from app.models.enums import ResortStatus
from app.repositories.catalog import DestinationRepository
from app.repositories.resorts import ResortRepository
from app.schemas.resorts import ResortSearchParams
from app.services.mappers import resort_card
from app.utils.text import safe_regex


class SearchService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.resorts = ResortRepository(db)
        self.destinations = DestinationRepository(db)

    async def build_query(self, p: ResortSearchParams) -> dict | None:
        """Returns None when the query can't match anything (e.g. unknown destination)."""
        query: dict = {"status": ResortStatus.PUBLISHED}
        if p.q:
            pattern = {"$regex": safe_regex(p.q), "$options": "i"}
            query["$or"] = [
                {"name": pattern},
                {"destination_name": pattern},
                {"address.town": pattern},
                {"address.district": pattern},
            ]
        if p.destination:
            destination = await self.destinations.by_slug(p.destination)
            if not destination:
                return None
            query["destination_id"] = destination["_id"]
        if p.state:
            query["state"] = p.state
        if p.property_type:
            query["property_type"] = {"$in": list(p.property_type)}
        if p.category:
            query["categories"] = {"$in": p.category}
        if p.amenity:
            query["amenities"] = {"$all": p.amenity}  # every selected amenity must be present
        if p.surrounding:
            query["surroundings"] = {"$in": p.surrounding}
        if p.min_rating:
            query["rating.avg"] = {"$gte": p.min_rating}
        if p.max_distance_km and p.destination:
            query["distance_from_centre_km"] = {"$lte": p.max_distance_km}
        if not p.has_dates and (p.min_price is not None or p.max_price is not None):
            price: dict = {}
            if p.min_price is not None:
                price["$gte"] = p.min_price * 100
            if p.max_price is not None:
                price["$lte"] = p.max_price * 100
            query["starting_price_paise"] = price
        return query

    async def search(self, p: ResortSearchParams) -> dict:
        applied = p.model_dump(exclude_defaults=True, exclude={"page", "page_size"})
        query = await self.build_query(p)
        if query is None:
            return self._response([], p, 0, applied, {})

        facets = await self.resorts.facets(query)
        total = await self.resorts.count(query)
        skip = (p.page - 1) * p.page_size
        docs = await self.resorts.search_page(query, p.sort, skip, p.page_size)
        return self._response([resort_card(d) for d in docs], p, total, applied, facets)

    @staticmethod
    def _response(items, p, total, applied, facets, nights=None):
        return {
            "items": items,
            "page": p.page,
            "page_size": p.page_size,
            "total": total,
            "total_pages": math.ceil(total / p.page_size) if total else 0,
            "applied_filters": applied,
            "facets": facets,
            "nights": nights,
        }

    async def featured(self, limit: int = 8):
        return [resort_card(d) for d in await self.resorts.featured(limit)]
