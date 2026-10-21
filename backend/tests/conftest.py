"""Shared test fixtures.

Tests never use your real `.env` database. They use a throwaway database on the local test
replica set (start it with `./scripts/test_mongo.sh start`). Each test session gets a
uniquely named database that is dropped afterwards.
"""

import os
import uuid

# Must be set before `app` is imported: importing app.main builds the default app.
TEST_MONGODB_URI = os.environ.get("TEST_MONGODB_URI", "mongodb://localhost:27018/?replicaSet=rs0")
os.environ.update(
    {
        "APP_ENV": "test",
        "MONGODB_URI": TEST_MONGODB_URI,
        "MONGODB_DB": "vistara_test",
        "JWT_SECRET": "test-secret-not-for-production",
        "CORS_ORIGINS": "http://localhost:5173",
        "LOG_LEVEL": "WARNING",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402
from pymongo import MongoClient  # noqa: E402
from pymongo.errors import PyMongoError  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

TEST_DB_NAME = f"vistara_test_{uuid.uuid4().hex[:8]}"


def _test_mongo_available() -> bool:
    try:
        with MongoClient(TEST_MONGODB_URI, serverSelectionTimeoutMS=1500) as client:
            client.admin.command("ping")
        return True
    except PyMongoError:
        return False


MONGO_AVAILABLE = _test_mongo_available()


def pytest_collection_modifyitems(config, items):
    if MONGO_AVAILABLE:
        return
    skip = pytest.mark.skip(
        reason="Test MongoDB not running. Start it with: ./scripts/test_mongo.sh start"
    )
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session", autouse=True)
def _drop_test_database():
    yield
    if MONGO_AVAILABLE:
        with MongoClient(TEST_MONGODB_URI) as client:
            client.drop_database(TEST_DB_NAME)


def make_settings(**overrides) -> Settings:
    base = {
        "app_env": "test",
        "mongodb_uri": TEST_MONGODB_URI,
        "mongodb_db": TEST_DB_NAME,
        "jwt_secret": "test-secret-not-for-production",
        "ensure_indexes_on_startup": False,
        "log_level": "WARNING",
    }
    return Settings(**(base | overrides))


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
async def app(settings):
    application = create_app(settings)
    # httpx doesn't run startup/shutdown events, so enter the lifespan ourselves.
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def db(app):
    return app.state.db
