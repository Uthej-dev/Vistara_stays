"""Copy destination and sample-resort photos from Wikimedia hotlinks into Cloudinary.

Why: hotlinked Wikimedia images can't be resized to WebP/AVIF and set third-party cookies.
Cloudinary serves optimised sizes from a CDN. Attribution (author/licence) is kept unchanged.

Requires IMAGE_STORAGE=cloudinary and the three CLOUDINARY_* settings in .env. Safe to rerun:
images already on Cloudinary are skipped.
Usage (from backend/, venv active):  python -m scripts.migrate_images_to_cloudinary
"""

import asyncio

from app.core.config import get_settings
from app.db.mongodb import create_client, get_database, ping
from app.services.image_service import ImageService


def original_url(image: dict) -> str:
    """Largest available Wikimedia rendition of an image."""
    variants = image.get("srcSet") or {}
    return variants.get("1920") or variants.get("1280") or image["src"]


async def migrate_image(images: ImageService, image: dict, folder: str, cache: dict) -> dict:
    if image.get("public_id") and not image["public_id"].startswith("local:"):
        return image  # already on Cloudinary
    source = original_url(image)
    if source not in cache:
        cache[source] = await images.store_from_url(source, folder=folder, alt=image.get("alt", ""))
    uploaded = cache[source]
    return {**image, **{k: uploaded[k] for k in ("src", "srcSet", "public_id", "width", "height")}}


async def main() -> None:
    settings = get_settings()
    if settings.image_storage != "cloudinary":
        raise SystemExit("Set IMAGE_STORAGE=cloudinary and the CLOUDINARY_* settings first.")
    client = create_client(settings)
    images = ImageService(settings)
    cache: dict[str, dict] = {}
    try:
        db = get_database(client, settings)
        await ping(db)
        async for dest in db["destinations"].find({"image": {"$ne": None}}):
            new = await migrate_image(images, dest["image"], "destinations", cache)
            await db["destinations"].update_one({"_id": dest["_id"]}, {"$set": {"image": new}})
            print(f"destination {dest['slug']}: {new['public_id']}")
        async for resort in db["resorts"].find({"is_sample": True}):
            new_images = [
                await migrate_image(images, img, "destinations", cache) for img in resort["images"]
            ]
            await db["resorts"].update_one({"_id": resort["_id"]}, {"$set": {"images": new_images}})
            print(f"resort {resort['slug']}: {len(new_images)} images")
        print(f"Done. {len(cache)} unique images uploaded.")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
