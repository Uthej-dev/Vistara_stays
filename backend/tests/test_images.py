"""Image validation and Cloudinary request signing (no network)."""

import hashlib

import pytest

from app.core.errors import BusinessRuleError
from app.services.image_service import (
    ImageService,
    cloudinary_signature,
    cloudinary_variants,
    sniff_image_type,
)
from tests.conftest import make_settings


@pytest.mark.parametrize(
    "data,kind",
    [
        (b"\xff\xd8\xff\xe0" + b"\x00" * 10, "jpeg"),
        (b"\x89PNG\r\n\x1a\n" + b"\x00" * 10, "png"),
        (b"RIFF\x00\x00\x00\x00WEBPVP8 ", "webp"),
        (b"GIF89a" + b"\x00" * 10, None),
        (b"<svg xmlns='http://www.w3.org/2000/svg'>", None),
        (b"%PDF-1.7", None),
    ],
)
def test_image_type_comes_from_file_content(data, kind):
    assert sniff_image_type(data) == kind


def test_svg_is_rejected_even_with_an_image_name():
    with pytest.raises(BusinessRuleError) as exc:
        ImageService(make_settings()).validate(b"<svg onload=alert(1)>")
    assert exc.value.code == "IMAGE_TYPE_NOT_ALLOWED"


def test_cloudinary_signature_signs_sorted_params_plus_secret():
    params = {"timestamp": 1315060510, "folder": "vistara/owners/x", "empty": ""}
    expected = hashlib.sha1(b"folder=vistara/owners/x&timestamp=1315060510" + b"s3cret").hexdigest()
    assert cloudinary_signature(params, "s3cret") == expected


def test_cloudinary_variants_request_optimised_sizes():
    url = "https://res.cloudinary.com/demo/image/upload/v1/vistara/a.jpg"
    variants = cloudinary_variants(url)
    assert (
        variants["500"]
        == "https://res.cloudinary.com/demo/image/upload/w_500,c_limit,f_auto,q_auto/v1/vistara/a.jpg"
    )
    assert set(variants) == {"500", "960", "1280", "1920"}


def test_production_requires_cloudinary_and_secure_cookies():
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        make_settings(app_env="production", jwt_secret="x" * 40)
    with pytest.raises(ValueError, match="IMAGE_STORAGE"):
        make_settings(app_env="production", jwt_secret="x" * 40, cookie_secure=True)
