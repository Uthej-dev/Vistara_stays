"""Image upload for owners and admins. Files are checked by content (not by name), size-capped,
and stored locally in development or on Cloudinary in production."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.api.deps import rate_limit, require_role
from app.models.enums import Role
from app.schemas.common import Image
from app.services.image_service import ImageService

router = APIRouter(tags=["uploads"])

UploaderDep = Annotated[dict, Depends(require_role(Role.OWNER, Role.ADMIN))]


@router.post(
    "/uploads/images",
    response_model=Image,
    status_code=201,
    dependencies=[rate_limit("upload", 60, 3600, per="user")],
)
async def upload_image(
    request: Request,
    user: UploaderDep,
    file: Annotated[UploadFile, File(description="JPEG, PNG or WebP, max 5 MB")],
    alt: Annotated[str, Form(min_length=3, max_length=160)],
):
    settings = request.app.state.settings
    # Read one byte more than the limit so oversized files are detected without reading them all.
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    folder = f"{user['role']}s/{user['_id']}"
    return await ImageService(settings).store(data, folder=folder, alt=alt.strip())
