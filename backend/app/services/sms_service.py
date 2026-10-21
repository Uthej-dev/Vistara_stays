"""Outgoing SMS (booking confirmations).

- `console` backend (development/tests): logs the message and keeps it in an in-memory outbox.
- `twilio` backend: sends through Twilio's REST API.
Like email, a failed SMS never breaks the booking that triggered it — it's logged instead.
"""

import logging

import httpx

from app.core.config import Settings

logger = logging.getLogger("app.sms")


def mask_phone(phone: str) -> str:
    return phone[:3] + "*" * max(0, len(phone) - 7) + phone[-4:] if len(phone) > 7 else "****"


class SmsService:
    def __init__(self, settings: Settings, outbox: list | None = None):
        self.settings = settings
        self.outbox = outbox if outbox is not None else []

    async def send(self, to: str, text: str) -> None:
        try:
            if self.settings.sms_backend == "twilio":
                await self._send_twilio(to, text)
            else:
                self.outbox.append({"to": to, "text": text})
                del self.outbox[:-50]
                shown = text if not self.settings.is_production else "[hidden in production]"
                logger.info("SMS (console backend)", extra={"to": mask_phone(to), "text": shown})
        except Exception:
            logger.exception("SMS sending failed", extra={"to": mask_phone(to)})

    async def _send_twilio(self, to: str, text: str) -> None:
        s = self.settings
        url = f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                url,
                data={"To": to, "From": s.twilio_from_number, "Body": text},
                auth=(s.twilio_account_sid, s.twilio_auth_token),
            )
            response.raise_for_status()
