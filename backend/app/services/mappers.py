"""Convert stored documents into API response shapes (one place, used by every service)."""

from app.utils.text import serialize


def destination_ref(resort: dict) -> dict:
    return {
        "id": str(resort["destination_id"]),
        "slug": resort["destination_slug"],
        "name": resort["destination_name"],
        "state": resort["state"],
    }


def resort_card(resort: dict, *, price: dict | None = None, available: bool | None = None):
    images = resort.get("images") or []
    return {
        "id": str(resort["_id"]),
        "slug": resort["slug"],
        "name": resort["name"],
        "is_sample": resort.get("is_sample", False),
        "destination": destination_ref(resort),
        "property_type": resort["property_type"],
        "categories": resort.get("categories", []),
        "amenities": resort.get("amenities", []),
        "surroundings": resort.get("surroundings", []),
        "cover_image": images[0] if images else None,
        "rating": resort.get("rating") or {"avg": 0, "count": 0},
        "price": price
        or {
            "kind": "starting",
            "per_night_paise": resort.get("starting_price_paise", 0),
            "taxes_included": False,
            "meal_plan": resort.get("meal_plan", "room_only"),
        },
        "available": available,
        "distance_from_centre_km": resort.get("distance_from_centre_km"),
    }


def location_out(point: dict | None) -> dict | None:
    if not point:
        return None
    lng, lat = point["coordinates"]
    return {"lat": lat, "lng": lng}


def destination_out(doc: dict, stats: dict | None = None) -> dict:
    out = serialize(doc)
    out["location"] = location_out(doc.get("location"))
    out["resort_count"] = (stats or {}).get("count", 0)
    out["starting_price_paise"] = (stats or {}).get("min_price")
    return out


def room_type_public(room: dict) -> dict:
    out = serialize(room)
    for private in ("owner_id", "resort_id", "created_at", "updated_at", "status"):
        out.pop(private, None)
    return out


def resort_detail(resort: dict, room_types: list[dict], *, is_favourite=False) -> dict:
    address = resort.get("address", {})
    return {
        "id": str(resort["_id"]),
        "slug": resort["slug"],
        "name": resort["name"],
        "is_sample": resort.get("is_sample", False),
        "status": resort["status"],
        "destination": destination_ref(resort),
        "property_type": resort["property_type"],
        "categories": resort.get("categories", []),
        "amenities": resort.get("amenities", []),
        "surroundings": resort.get("surroundings", []),
        "description": resort.get("description", ""),
        "highlights": resort.get("highlights", []),
        "images": resort.get("images", []),
        # Street address is withheld from the public page; town-level location only.
        "address": {
            "town": address.get("town", ""),
            "district": address.get("district", ""),
            "state": address.get("state", resort["state"]),
            "pincode": address.get("pincode"),
        },
        "location": location_out(resort.get("location")),
        "distance_from_centre_km": resort.get("distance_from_centre_km"),
        "policies": resort["policies"],
        "nearby_attractions": resort.get("nearby_attractions", []),
        "booking_mode": resort.get("booking_mode", "instant"),
        "starting_price_paise": resort.get("starting_price_paise", 0),
        "rating": resort.get("rating") or {"avg": 0, "count": 0},
        "room_types": [room_type_public(r) for r in room_types],
        "is_favourite": is_favourite,
    }
