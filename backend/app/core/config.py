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
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached so the .env file is read once per process."""
    return Settings()
