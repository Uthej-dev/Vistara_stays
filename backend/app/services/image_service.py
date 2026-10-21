"""Image uploads: validated on the server, stored locally (development) or on Cloudinary.

Validation never trusts the filename or the browser's Content-Type: the first bytes of the file
(its "magic number") must be a real JPEG, PNG or WebP, and the size is capped.
"""

import hashlib
import time
import uuid
from pathlib import Path

import httpx

from app.core.config import Settings
from app.core.errors import BusinessRuleError, ServiceUnavailableError

ALLOWED = {"jpeg": "jpg", "png": "png", "webp": "webp"}


def sniff_image_type(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def cloudinary_signature(params: dict, api_secret: str) -> str:
    """Cloudinary signs requests with SHA-1 of the sorted params plus the API secret."""
    to_sign = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v not in (None, ""))
    return hashlib.sha1((to_sign + api_secret).encode()).hexdigest()


def cloudinary_variants(secure_url: str) -> dict[str, str]:
    """Responsive sizes via URL transformations (Cloudinary resizes and picks WebP/AVIF)."""
    return {
        str(w): secure_url.replace("/upload/", f"/upload/w_{w},c_limit,f_auto,q_auto/", 1)
        for w in (500, 960, 1280, 1920)
    }


class ImageService:
    def __init__(self, settings: Settings):
        self.settings = settings

    def validate(self, data: bytes) -> str:
        if len(data) > self.settings.max_upload_mb * 1024 * 1024:
            raise BusinessRuleError(
                f"Images must be {self.settings.max_upload_mb} MB or smaller.",
                code="IMAGE_TOO_LARGE",
            )
        kind = sniff_image_type(data)
        if kind not in ALLOWED:
            raise BusinessRuleError(
                "Upload a JPEG, PNG or WebP image.", code="IMAGE_TYPE_NOT_ALLOWED"
            )
        return kind

    async def store(self, data: bytes, *, folder: str, alt: str) -> dict:
        if self.settings.image_storage == "disabled":
            raise ServiceUnavailableError(
                "Photo uploads are turned off on this deployment.", code="UPLOADS_DISABLED"
            )
        kind = self.validate(data)
        if self.settings.image_storage == "cloudinary":
            return await self._store_cloudinary(data, folder=folder, alt=alt)
        return self._store_local(data, kind=kind, folder=folder, alt=alt)

    def _store_local(self, data: bytes, *, kind: str, folder: str, alt: str) -> dict:
        name = f"{uuid.uuid4().hex}.{ALLOWED[kind]}"
        target = Path(self.settings.media_dir) / folder
        target.mkdir(parents=True, exist_ok=True)
        (target / name).write_bytes(data)
        src = f"/api/v1/media/{folder}/{name}"
        return {"src": src, "srcSet": None, "alt": alt, "public_id": f"local:{folder}/{name}"}

    async def _store_cloudinary(self, data: bytes, *, folder: str, alt: str) -> dict:
        return await self._cloudinary_upload(file=("upload", data), folder=folder, alt=alt)

    async def store_from_url(self, url: str, *, folder: str, alt: str) -> dict:
        """Server-side copy of a remote image into Cloudinary (used by the migration script)."""
        if self.settings.image_storage != "cloudinary":
            raise ServiceUnavailableError("Cloudinary is not configured.")
        return await self._cloudinary_upload(file=url, folder=folder, alt=alt)

    async def _cloudinary_upload(self, *, file, folder: str, alt: str) -> dict:
        s = self.settings
        params = {"folder": f"vistara/{folder}", "timestamp": int(time.time())}
        signed = {
            **params,
            "api_key": s.cloudinary_api_key,
            "signature": cloudinary_signature(params, s.cloudinary_api_secret),
        }
        endpoint = f"https://api.cloudinary.com/v1_1/{s.cloudinary_cloud_name}/image/upload"
        async with httpx.AsyncClient(timeout=60) as client:
            if isinstance(file, tuple):
                response = await client.post(endpoint, data=signed, files={"file": file})
            else:
                response = await client.post(endpoint, data={**signed, "file": file})
        if response.status_code >= 400:
            raise ServiceUnavailableError(
                "The image service rejected the upload. Please try again."
            )
        body = response.json()
        return {
            "src": cloudinary_variants(body["secure_url"])["1280"],
            "srcSet": cloudinary_variants(body["secure_url"]),
            "alt": alt,
            "width": body.get("width"),
            "height": body.get("height"),
            "public_id": body["public_id"],
        }
