"""Sign-up, login, refresh-token rotation, logout, password reset and email verification.

Refresh tokens ("sessions"):
- A random 256-bit token is sent to the browser in an httpOnly cookie; only its SHA-256 hash is
  stored in `sessions`.
- Every refresh ROTATES the token: the old one is revoked and a new one issued in the same
  "family".
- If an already-revoked token is presented again (outside a short grace period for two tabs
  refreshing at once), it may have been stolen: every session in that family is revoked.
"""

import uuid
from datetime import timedelta

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import Settings
from app.core.errors import ConflictError, ForbiddenError, RateLimitedError, UnauthorizedError
from app.core.rate_limit import RateLimiter
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    verify_password,
)
from app.models.enums import Role, UserStatus
from app.services.email_service import EmailService
from app.utils.dates import now_utc
from app.utils.text import serialize

REUSE_GRACE_SECONDS = 30
LOGIN_FAILURE_LIMIT = 5
LOGIN_FAILURE_WINDOW = 15 * 60


def user_out(user: dict) -> dict:
    out = serialize(user)
    for private in ("password_hash", "token_version", "is_sample", "status", "last_login_at"):
        out.pop(private, None)
    return out


class AuthService:
    def __init__(
        self,
        db: AsyncDatabase,
        settings: Settings,
        email: EmailService,
        limiter: RateLimiter,
    ):
        self.db = db
        self.users = db["users"]
        self.sessions = db["sessions"]
        self.tokens = db["auth_tokens"]
        self.settings = settings
        self.email = email
        self.limiter = limiter

    # ---------- tokens ----------

    def _access_token(self, user: dict) -> tuple[str, int]:
        return create_access_token(
            user_id=str(user["_id"]),
            role=user["role"],
            token_version=user.get("token_version", 0),
            secret=self.settings.jwt_secret,
            ttl_minutes=self.settings.access_token_ttl_min,
        )

    async def _new_session(self, user: dict, meta: dict, family_id: str | None = None) -> str:
        token = new_opaque_token()
        now = now_utc()
        await self.sessions.insert_one({
            "user_id": user["_id"],
            "token_hash": hash_token(token),
            "family_id": family_id or uuid.uuid4().hex,
            "created_at": now,
            "last_used_at": now,
            "expires_at": now + timedelta(days=self.settings.refresh_token_ttl_days),
            "revoked_at": None,
            "user_agent": (meta.get("user_agent") or "")[:200],
            "ip": meta.get("ip"),
        })
        return token

    async def _issue(self, user: dict, meta: dict, family_id: str | None = None) -> dict:
        refresh = await self._new_session(user, meta, family_id)
        access, expires_in = self._access_token(user)
        return {
            "access_token": access,
            "expires_in": expires_in,
            "user": user_out(user),
            "refresh_token": refresh,  # the route moves this into the cookie
        }

    async def _one_time_token(self, user_id: ObjectId, purpose: str, ttl: timedelta) -> str:
        token = new_opaque_token()
        # Only the newest link of each kind works.
        await self.tokens.delete_many({"user_id": user_id, "purpose": purpose})
        await self.tokens.insert_one({
            "user_id": user_id,
            "purpose": purpose,
            "token_hash": hash_token(token),
            "created_at": now_utc(),
            "expires_at": now_utc() + ttl,
            "used_at": None,
        })
        return token

    async def _consume_token(self, token: str, purpose: str) -> dict:
        doc = await self.tokens.find_one_and_update(
            {
                "token_hash": hash_token(token),
                "purpose": purpose,
                "used_at": None,
                "expires_at": {"$gt": now_utc()},
            },
            {"$set": {"used_at": now_utc()}},
        )
        if not doc:
            raise ConflictError("This link is invalid or has expired.", code="TOKEN_INVALID")
        return doc

    # ---------- public operations ----------

    async def signup(self, data, meta: dict) -> dict:
        user = {
            "email": data.email,
            "name": data.name,
            "phone": data.phone,
            "password_hash": hash_password(data.password),
            "role": Role.OWNER if data.account_type == "owner" else Role.CUSTOMER,
            "status": UserStatus.ACTIVE,
            "email_verified": False,
            "token_version": 0,
            "preferences": {"destinations": [], "newsletter": False},
            "created_at": now_utc(),
            "updated_at": now_utc(),
        }
        if data.account_type == "owner":
            user["owner_profile"] = {"business_name": data.business_name, "gstin": None}
        try:
            user["_id"] = (await self.users.insert_one(user)).inserted_id
        except DuplicateKeyError as exc:
            raise ConflictError(
                "An account with this email already exists.", code="EMAIL_TAKEN"
            ) from exc
        await self.send_verification(user)
        return await self._issue(user, meta)

    async def login(self, email: str, password: str, meta: dict) -> dict:
        fail_key = f"login-fail:{email}"
        if self.limiter.count(fail_key, LOGIN_FAILURE_WINDOW) >= LOGIN_FAILURE_LIMIT:
            raise RateLimitedError(retry_after=LOGIN_FAILURE_WINDOW)

        user = await self.users.find_one({"email": email})
        # For unknown emails this still runs a full hash, so timing doesn't reveal the account.
        ok, new_hash = verify_password(password, user.get("password_hash") if user else None)
        if not user or not ok:
            try:
                self.limiter.hit(fail_key, LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW)
            except RateLimitedError:
                pass  # the next attempt is the one that gets blocked
            # Same message whether the email exists or not (no account enumeration).
            raise UnauthorizedError("Incorrect email or password.", code="INVALID_CREDENTIALS")
        if user["status"] != UserStatus.ACTIVE:
            raise ForbiddenError("This account is suspended.", code="ACCOUNT_SUSPENDED")

        self.limiter.reset(fail_key)
        changes = {"last_login_at": now_utc()}
        if new_hash:  # hashing parameters were upgraded since this password was set
            changes["password_hash"] = new_hash
        await self.users.update_one({"_id": user["_id"]}, {"$set": changes})
        return await self._issue(user, meta)

    async def refresh(self, refresh_token: str | None, meta: dict) -> dict:
        if not refresh_token:
            raise UnauthorizedError(code="NO_SESSION")
        now = now_utc()
        session = await self.sessions.find_one({"token_hash": hash_token(refresh_token)})
        if not session or session["expires_at"] <= now:
            raise UnauthorizedError("Your session has expired.", code="SESSION_EXPIRED")

        if session.get("revoked_at"):
            within_grace = (now - session["revoked_at"]).total_seconds() < REUSE_GRACE_SECONDS
            if not (within_grace and session.get("replaced")):
                # A revoked token came back: assume theft and end the whole login.
                await self.sessions.update_many(
                    {"family_id": session["family_id"], "revoked_at": None},
                    {"$set": {"revoked_at": now, "revoked_reason": "reuse_detected"}},
                )
                raise UnauthorizedError("Please log in again.", code="SESSION_REVOKED")
        else:
            # Atomically claim the rotation; if another request won the race, fall into grace.
            claimed = await self.sessions.find_one_and_update(
                {"_id": session["_id"], "revoked_at": None},
                {"$set": {"revoked_at": now, "replaced": True, "last_used_at": now}},
            )
            if not claimed:
                return await self.refresh(refresh_token, meta)

        user = await self.users.find_one({"_id": session["user_id"]})
        if not user or user["status"] != UserStatus.ACTIVE:
            raise UnauthorizedError(code="SESSION_REVOKED")
        return await self._issue(user, meta, family_id=session["family_id"])

    async def logout(self, refresh_token: str | None) -> None:
        if refresh_token:
            await self.sessions.update_one(
                {"token_hash": hash_token(refresh_token), "revoked_at": None},
                {"$set": {"revoked_at": now_utc(), "revoked_reason": "logout"}},
            )

    async def revoke_all(self, user_id: ObjectId, reason: str) -> None:
        """End every session and invalidate every access token for a user."""
        await self.users.update_one({"_id": user_id}, {"$inc": {"token_version": 1}})
        await self.sessions.update_many(
            {"user_id": user_id, "revoked_at": None},
            {"$set": {"revoked_at": now_utc(), "revoked_reason": reason}},
        )

    async def send_verification(self, user: dict) -> None:
        token = await self._one_time_token(user["_id"], "verify_email", timedelta(hours=24))
        await self.email.send_verification(user["email"], user["name"], token)

    async def verify_email(self, token: str) -> None:
        doc = await self._consume_token(token, "verify_email")
        await self.users.update_one({"_id": doc["user_id"]}, {"$set": {"email_verified": True}})

    async def forgot_password(self, email: str) -> None:
        user = await self.users.find_one({"email": email, "status": UserStatus.ACTIVE})
        if not user:
            return  # same response either way: don't reveal which emails have accounts
        token = await self._one_time_token(user["_id"], "reset_password", timedelta(minutes=30))
        await self.email.send_password_reset(user["email"], user["name"], token)

    async def reset_password(self, token: str, new_password: str) -> None:
        doc = await self._consume_token(token, "reset_password")
        await self.users.update_one(
            {"_id": doc["user_id"]},
            {"$set": {"password_hash": hash_password(new_password), "updated_at": now_utc()}},
        )
        await self.revoke_all(doc["user_id"], "password_reset")

    async def change_password(self, user: dict, current: str, new: str, meta: dict) -> dict:
        ok, _ = verify_password(current, user.get("password_hash"))
        if not ok:
            raise UnauthorizedError("Current password is incorrect.", code="INVALID_CREDENTIALS")
        await self.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"password_hash": hash_password(new), "updated_at": now_utc()}},
        )
        await self.revoke_all(user["_id"], "password_changed")
        fresh = await self.users.find_one({"_id": user["_id"]})
        return await self._issue(fresh, meta)  # keep the current device signed in
