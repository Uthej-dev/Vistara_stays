"""Copy the Wikimedia destination photos into the frontend so the site serves them itself.

Hotlinking upload.wikimedia.org is rate-limited per visitor, so pages with many photos showed
"photo unavailable". This script:

1. downloads every size listed in seed_data/destination_images.json into
   frontend/public/photos/<slug>-<width>.<ext> (skipping files that already exist),
2. rewrites that JSON to the local paths (credits are unchanged), and records the old → new URL
   mapping in seed_data/image_url_map.json,
3. with --update-db, replaces the old URLs in the current database (resorts, destinations and
   booking snapshots).

Usage (from backend/, venv active):
    python -m scripts.self_host_images              # download + rewrite seed data
    python -m scripts.self_host_images --update-db  # also fix existing documents (MONGODB_DB=...)
"""

import argparse
import asyncio
import json
import time
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.db.mongodb import create_client, get_database

SEED_DATA = Path(__file__).parent / "seed_data"
IMAGES_JSON = SEED_DATA / "destination_images.json"
URL_MAP_JSON = SEED_DATA / "image_url_map.json"
PHOTOS_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "photos"
USER_AGENT = "VistaraStaysImageCopy/1.0 (https://vistara-stays-pi.vercel.app/credits) httpx"


def download(client: httpx.Client, url: str, target: Path) -> None:
    for attempt in range(5):
        response = client.get(url)
        if response.status_code == 200:
            target.write_bytes(response.content)
            return
        if response.status_code == 429:
            time.sleep(5 * (attempt + 1))  # be polite: back off and retry
            continue
        response.raise_for_status()
    raise RuntimeError(f"Gave up on {url}")


def localise() -> dict[str, str]:
    images = json.loads(IMAGES_JSON.read_text())
    url_map = json.loads(URL_MAP_JSON.read_text()) if URL_MAP_JSON.exists() else {}
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True) as c:
        for slug, img in images.items():
            for width, url in img["srcSet"].items():
                if not url.startswith("http"):
                    continue  # already local
                ext = url.rsplit(".", 1)[-1].lower()
                local = f"/photos/{slug}-{width}.{ext}"
                target = PHOTOS_DIR / local.removeprefix("/photos/")
                if not target.exists():
                    download(c, url, target)
                    time.sleep(0.5)
                url_map[url] = local
                img["srcSet"][width] = local
            img["src"] = url_map.get(img["src"], img["src"])
    IMAGES_JSON.write_text(json.dumps(images, indent=2, ensure_ascii=False) + "\n")
    URL_MAP_JSON.write_text(json.dumps(url_map, indent=2) + "\n")
    print(f"{len(url_map)} photos in {PHOTOS_DIR}")
    return url_map


def replace_urls(value, url_map: dict[str, str]):
    if isinstance(value, str):
        return url_map.get(value, value)
    if isinstance(value, list):
        return [replace_urls(v, url_map) for v in value]
    if isinstance(value, dict):
        return {k: replace_urls(v, url_map) for k, v in value.items()}
    return value


async def update_db(url_map: dict[str, str]) -> None:
    settings = get_settings()
    client = create_client(settings)
    try:
        db = get_database(client, settings)
        image_fields = {"resorts": "images", "destinations": "image", "bookings": "resort_snapshot"}
        for name, field in image_fields.items():
            changed = 0
            async for doc in db[name].find({field: {"$exists": True}}, {field: 1}):
                fields = {k: v for k, v in doc.items() if k != "_id"}
                updated = replace_urls(fields, url_map)
                if updated != fields:
                    await db[name].update_one({"_id": doc["_id"]}, {"$set": updated})
                    changed += 1
            print(f"{settings.mongodb_db}.{name}: {changed} documents updated")
    finally:
        await client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--update-db", action="store_true")
    args = parser.parse_args()
    mapping = localise()
    if args.update_db:
        asyncio.run(update_db(mapping))
