"""Create all MongoDB indexes, then print them.

Usage (from backend/, with the venv active):  python -m scripts.ensure_indexes
"""

import asyncio

from app.core.config import get_settings
from app.db.indexes import ensure_indexes
from app.db.mongodb import create_client, get_database, ping


async def main() -> None:
    settings = get_settings()
    client = create_client(settings)
    try:
        db = get_database(client, settings)
        await ping(db)
        result = await ensure_indexes(db)
        print(f"Database: {settings.mongodb_db}")
        for collection, names in result.items():
            print(f"  {collection:<26} {', '.join(names)}")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
