"""Create (or promote to) an administrator account. This is the ONLY way to get the admin role:
the API never lets a client choose or change roles.

Usage (from backend/, venv active):
    python -m scripts.create_admin --email admin@example.com --name "Site Admin"
You'll be prompted for the password (it is never passed on the command line).
Automation:  printf '%s\n' "$ADMIN_PASSWORD" | python -m scripts.create_admin --email ... --password-stdin
"""

import argparse
import asyncio
import getpass
import sys

from pydantic import TypeAdapter, ValidationError

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.mongodb import create_client, get_database, ping
from app.models.enums import Role, UserStatus
from app.schemas.auth import Email, Password
from app.utils.dates import now_utc


async def main(email: str, name: str, password: str) -> None:
    settings = get_settings()
    client = create_client(settings)
    try:
        db = get_database(client, settings)
        await ping(db)
        existing = await db["users"].find_one({"email": email})
        now = now_utc()
        update = {
            "$set": {
                "name": name,
                "role": Role.ADMIN,
                "status": UserStatus.ACTIVE,
                "email_verified": True,
                "password_hash": hash_password(password),
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
            # Bump token_version so any existing sessions pick up the new role on next login.
            "$inc": {"token_version": 1},
        }
        await db["users"].update_one({"email": email}, update, upsert=True)
        await db["audit_logs"].insert_one(
            {
                "actor_id": None,
                "actor_role": "system",
                "action": "user.make_admin",
                "target_type": "user",
                "target_id": email,
                "reason": "scripts.create_admin",
                "at": now,
            }
        )
        print(f"{'Promoted' if existing else 'Created'} admin: {email}")
    finally:
        await client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrator")
    parser.add_argument(
        "--password-stdin",
        action="store_true",
        help="read the password from standard input (automation); never pass it as an argument",
    )
    args = parser.parse_args()
    try:
        email = TypeAdapter(Email).validate_python(args.email)
        if args.password_stdin:
            raw = sys.stdin.readline().rstrip("\n")
        else:
            raw = getpass.getpass("Admin password (min 10 chars): ")
        password = TypeAdapter(Password).validate_python(raw)
    except ValidationError as exc:
        raise SystemExit(f"Invalid input: {exc.errors()[0]['msg']}") from exc
    if not args.password_stdin and getpass.getpass("Repeat password: ") != password:
        raise SystemExit("Passwords don't match.")
    asyncio.run(main(email, args.name, password))
