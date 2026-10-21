import re
import secrets
import unicodedata

from bson import ObjectId


def slugify(value: str, max_length: int = 60) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value[:max_length].rstrip("-") or "item"


def unique_suffix() -> str:
    return secrets.token_hex(3)


def safe_regex(user_text: str) -> str:
    """Escape user input before using it in a $regex, so '.*' or '(' can't change the query."""
    return re.escape(user_text.strip())


def serialize(value):
    """Make a MongoDB document JSON-friendly: `_id` → `id`, ObjectId → str (recursively)."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, list):
        return [serialize(v) for v in value]
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            out["id" if key == "_id" else key] = serialize(item)
        return out
    return value
