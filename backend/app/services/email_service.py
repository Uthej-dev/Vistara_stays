"""Outgoing email.

- `console` backend (development/tests): logs the email and keeps it in an in-memory outbox,
  so you can copy verification/reset links from the server log — no email account needed.
- `resend` backend (production): sends through the Resend HTTP API.
Email failures never break the request that triggered them; they are logged instead.
"""

import html
import logging
from dataclasses import dataclass, field

import httpx

from app.core.config import Settings

logger = logging.getLogger("app.email")


@dataclass
class Email:
    to: str
    subject: str
    text: str
    html_body: str = ""
    tags: dict = field(default_factory=dict)


class EmailService:
    def __init__(self, settings: Settings, outbox: list | None = None):
        self.settings = settings
        self.outbox = outbox if outbox is not None else []

    async def send(self, email: Email) -> None:
        try:
            if self.settings.email_backend == "resend":
                await self._send_resend(email)
            else:
                self.outbox.append(email)
                del self.outbox[:-50]  # keep the last 50 only
                logger.info(
                    "Email (console backend)",
                    extra={"to": email.to, "subject": email.subject, "body": email.text},
                )
        except Exception:
            logger.exception("Email sending failed", extra={"subject": email.subject})

    async def _send_resend(self, email: Email) -> None:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {self.settings.resend_api_key}"},
                json={
                    "from": self.settings.email_from,
                    "to": [email.to],
                    "subject": email.subject,
                    "text": email.text,
                    "html": email.html_body or f"<pre>{html.escape(email.text)}</pre>",
                },
            )
            response.raise_for_status()

    # ---- templates ----

    def _link(self, path: str) -> str:
        return f"{self.settings.frontend_url.rstrip('/')}{path}"

    async def send_verification(self, to: str, name: str, token: str) -> None:
        link = self._link(f"/verify-email?token={token}")
        await self.send(Email(
            to=to,
            subject="Verify your email for Vistara Stays",
            text=f"Hi {name},\n\nConfirm your email address to start booking:\n{link}\n\n"
                 "This link expires in 24 hours. If you didn't sign up, ignore this email.",
            tags={"link": link, "kind": "verify_email"},
        ))

    async def send_password_reset(self, to: str, name: str, token: str) -> None:
        link = self._link(f"/reset-password?token={token}")
        await self.send(Email(
            to=to,
            subject="Reset your Vistara Stays password",
            text=f"Hi {name},\n\nReset your password here:\n{link}\n\n"
                 "This link expires in 30 minutes and can be used once. "
                 "If you didn't ask for this, you can ignore this email.",
            tags={"link": link, "kind": "reset_password"},
        ))

    async def send_notification(self, to: str, subject: str, text: str, kind: str) -> None:
        await self.send(Email(to=to, subject=subject, text=text, tags={"kind": kind}))
