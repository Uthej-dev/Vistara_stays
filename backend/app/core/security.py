"""Passwords, JWTs and opaque tokens.

- Passwords: Argon2id (memory-hard, the current OWASP recommendation) via pwdlib.
- Access tokens: short-lived JWTs (HS256) carrying user id, role and token_version.
- Refresh / reset / verification tokens: random strings; only their SHA-256 hash is stored,
  so a database leak doesn't reveal usable tokens.
"""

import hashlib
import secrets
import uuid
from datetime import timedelta

import jwt
from pwdlib import PasswordHash

from app.utils.dates import now_utc

_password_hash = PasswordHash.recommended()  # Argon2id with library-recommended parameters

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> tuple[bool, str | None]:
    """Returns (is_valid, new_hash_if_parameters_changed)."""
    if not password_hash:
        # Still do the expensive work so response time doesn't reveal whether a user exists.
        _password_hash.hash(password)
        return False, None
    return _password_hash.verify_and_update(password, password_hash)


def create_access_token(
    *, user_id: str, role: str, token_version: int, secret: str, ttl_minutes: int
) -> tuple[str, int]:
    now = now_utc()
    expires_in = ttl_minutes * 60
    payload = {
        "sub": user_id,
        "role": role,
        "ver": token_version,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM), expires_in


class TokenError(Exception):
    def __init__(self, code: str):
        self.code = code


def decode_access_token(token: str, secret: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],  # never accept "none" or other algorithms
            options={"require": ["sub", "exp", "iat", "type", "ver"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("TOKEN_EXPIRED") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("TOKEN_INVALID") from exc
    if payload.get("type") != "access":
        raise TokenError("TOKEN_INVALID")
    return payload


def new_opaque_token() -> str:
    """256 bits of randomness, URL-safe."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
