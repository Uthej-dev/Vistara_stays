"""Phase 5: favourites and the customer-only rule."""

import pytest

from app.models.enums import Role
from tests.factories import auth_headers, make_listing, make_user

pytestmark = pytest.mark.db
API = "/api/v1"


async def test_save_list_and_remove_favourites(client, db):
    customer = await make_user(db)
    listing = await make_listing(db)
    rid = str(listing["resort"]["_id"])
    h = auth_headers(customer)

    first = await client.put(f"{API}/favourites/{rid}", headers=h)
    again = await client.put(f"{API}/favourites/{rid}", headers=h)  # idempotent
    page = (await client.get(f"{API}/favourites", headers=h)).json()
    ids = (await client.get(f"{API}/favourites/ids", headers=h)).json()
    detail = (await client.get(f"{API}/resorts/{listing['resort']['slug']}", headers=h)).json()
    removed = await client.delete(f"{API}/favourites/{rid}", headers=h)
    after = (await client.get(f"{API}/favourites/ids", headers=h)).json()

    assert first.status_code == again.status_code == 204
    assert page["total"] == 1 and page["items"][0]["id"] == rid
    assert ids == [rid]
    assert detail["is_favourite"] is True
    assert removed.status_code == 204 and after == []


async def test_cannot_favourite_unknown_or_unpublished_resort(client, db):
    customer = await make_user(db)
    draft = await make_listing(db, status="draft")
    h = auth_headers(customer)

    missing = await client.put(f"{API}/favourites/{'0' * 24}", headers=h)
    hidden = await client.put(f"{API}/favourites/{draft['resort']['_id']}", headers=h)
    bad_id = await client.put(f"{API}/favourites/not-an-id", headers=h)

    assert missing.status_code == hidden.status_code == 404
    assert bad_id.status_code == 422


@pytest.mark.parametrize("role", [Role.OWNER, Role.ADMIN])
async def test_only_customers_have_favourites(client, db, role):
    user = await make_user(db, role=role)
    response = await client.get(f"{API}/favourites", headers=auth_headers(user))
    assert response.status_code == 403


async def test_favourites_are_private_to_each_user(client, db):
    alice, bob = await make_user(db), await make_user(db)
    listing = await make_listing(db)
    await client.put(f"{API}/favourites/{listing['resort']['_id']}", headers=auth_headers(alice))

    bobs = (await client.get(f"{API}/favourites/ids", headers=auth_headers(bob))).json()
    assert bobs == []
