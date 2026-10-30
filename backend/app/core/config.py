"""Application settings, loaded from environment variables (and `.env` in development).

Every configurable value lives here so the rest of the code never reads `os.environ` directly.
"""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Vistara Stays API"
    version: str = "0.1.0"
    app_env: Literal["development", "test", "production"] = "development"

    mongodb_uri: str
    mongodb_db: str = "vistara_dev"

    jwt_secret: str = Field(min_length=8)

    # NoDecode: read the raw comma-separated string instead of expecting JSON.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    frontend_url: str = "http://localhost:5173"

    ensure_indexes_on_startup: bool = True
    enable_docs: bool = True
    log_level: str = "INFO"

    # Auth
    access_token_ttl_min: int = Field(15, ge=1, le=120)
    refresh_token_ttl_days: int = Field(14, ge=1, le=90)
    cookie_secure: bool = False  # must be True in production (HTTPS only)
    # Off by default: guests create their account at checkout and book straight away.
    require_email_verification: bool = False
    rate_limit_enabled: bool = True

    # Email: "console" logs emails (development); "resend" sends via the Resend API
    email_backend: Literal["console", "resend"] = "console"
    email_from: str = "Vistara Stays <no-reply@vistarastays.example>"
    resend_api_key: str | None = None

    # SMS: "console" logs messages (development); "twilio" sends via the Twilio API.
    # Note: business SMS to Indian numbers needs DLT registration with your provider.
    sms_backend: Literal["console", "twilio"] = "console"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # Images: "local" stores uploads on disk (development only); "cloudinary" for production;
    # "disabled" turns uploads off (e.g. a serverless demo without Cloudinary).
    image_storage: Literal["local", "cloudinary", "disabled"] = "local"
    media_dir: str = "media"
    public_api_url: str = "http://localhost:8000"
    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: str | None = None
    max_upload_mb: int = Field(5, ge=1, le=20)

    # Payments: "simulated" (development, clearly labelled) or "razorpay" (test/live keys)
    payment_provider: Literal["simulated", "razorpay"] = "simulated"
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_webhook_secret: str | None = None

    # AI booking assistant. Without OPENAI_API_KEY the assistant reports itself unavailable and
    # the rest of the site works as before. Any OpenAI-compatible endpoint works via the base URL.
    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout_seconds: float = Field(30, gt=0, le=120)

    # Background maintenance loop (expire holds, complete stays) while the server is awake
    maintenance_interval_seconds: int = Field(60, ge=0, le=3600)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def check_production_safety(self) -> "Settings":
        if self.app_env == "production":
            if self.jwt_secret == "change-me" or len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be a strong random value in production")
            if "*" in self.cors_origins:
                raise ValueError("CORS_ORIGINS cannot be '*' in production")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production")
            if self.image_storage == "local":
                raise ValueError("IMAGE_STORAGE must be 'cloudinary' or 'disabled' in production")
        if self.image_storage == "cloudinary" and not all(
            [self.cloudinary_cloud_name, self.cloudinary_api_key, self.cloudinary_api_secret]
        ):
            raise ValueError("IMAGE_STORAGE=cloudinary requires the three CLOUDINARY_* settings")
        if self.payment_provider == "razorpay" and not all(
            [self.razorpay_key_id, self.razorpay_key_secret, self.razorpay_webhook_secret]
        ):
            raise ValueError("PAYMENT_PROVIDER=razorpay requires the three RAZORPAY_* settings")
        if self.sms_backend == "twilio" and not all(
            [self.twilio_account_sid, self.twilio_auth_token, self.twilio_from_number]
        ):
            raise ValueError("SMS_BACKEND=twilio requires the three TWILIO_* settings")
        if self.email_backend == "resend" and not self.resend_api_key:
            raise ValueError("EMAIL_BACKEND=resend requires RESEND_API_KEY")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def assistant_enabled(self) -> bool:
        return bool(self.openai_api_key)


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env file is read once per process."""
    return Settings()
