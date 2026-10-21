"""Destinations and categories (public reads)."""

from pymongo.asynchronous.database import AsyncDatabase

from app.core.errors import NotFoundError
from app.repositories.catalog import CategoryRepository, DestinationRepository
from app.services.mappers import destination_out
from app.utils.text import serialize

# Ranks sort ascending; non-featured items use a large rank so they sort last.
NOT_FEATURED = 1000


class CatalogService:
    def __init__(self, db: AsyncDatabase):
        self.destinations = DestinationRepository(db)
        self.categories = CategoryRepository(db)

    async def list_destinations(self, *, state=None, dest_type=None, featured=False):
        docs = await self.destinations.find_all(state=state, dest_type=dest_type)
        if featured:
            docs = [d for d in docs if d.get("featured_rank", NOT_FEATURED) < NOT_FEATURED]
        stats = await self.destinations.resort_stats([d["_id"] for d in docs])
        return [destination_out(d, stats.get(d["_id"])) for d in docs]

    async def get_destination(self, slug: str):
        doc = await self.destinations.by_slug(slug)
        if not doc:
            raise NotFoundError("Destination not found.")
        stats = await self.destinations.resort_stats([doc["_id"]])
        return destination_out(doc, stats.get(doc["_id"]))

    async def list_categories(self, kind: str | None = None):
        return [serialize(c) for c in await self.categories.find_all(kind)]
