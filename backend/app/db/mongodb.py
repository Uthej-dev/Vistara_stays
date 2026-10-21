"""MongoDB connection lifecycle.

One `AsyncMongoClient` is created when the app starts and closed when it stops. The client
manages a connection pool internally, so it must be shared — never create a client per request.
"""

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import Settings


def create_client(settings: Settings) -> AsyncMongoClient:
    return AsyncMongoClient(
        settings.mongodb_uri,
        tz_aware=True,  # datetimes come back timezone-aware (UTC), avoiding naive-datetime bugs
        serverSelectionTimeoutMS=5000,  # fail fast if the cluster is unreachable
        appname="vistara-api",
    )


def get_database(client: AsyncMongoClient, settings: Settings) -> AsyncDatabase:
    return client[settings.mongodb_db]


async def ping(db: AsyncDatabase) -> None:
    """Raises if the database is unreachable."""
    await db.command("ping")
