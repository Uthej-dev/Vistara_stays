"""Razorpay integration (test mode first).

Security rules:
- Orders are created on the server with the amount the SERVER calculated.
- A payment counts only after its signature is verified with our secret key — either from the
  checkout callback (HMAC of "order_id|payment_id") or from a webhook (HMAC of the raw body).
- Card data never touches our servers: Razorpay's checkout collects it.
"""

import hashlib
import hmac

import httpx

from app.core.errors import ServiceUnavailableError

API_BASE = "https://api.razorpay.com/v1"


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_payment_signature(
    order_id: str, payment_id: str, signature: str, key_secret: str
) -> bool:
    expected = _hmac_hex(key_secret, f"{order_id}|{payment_id}".encode())
    return hmac.compare_digest(expected, signature or "")  # constant-time comparison


def verify_webhook_signature(raw_body: bytes, signature: str, webhook_secret: str) -> bool:
    expected = _hmac_hex(webhook_secret, raw_body)
    return hmac.compare_digest(expected, signature or "")


class RazorpayClient:
    """Thin async client. `transport` lets tests replace the network with httpx.MockTransport."""

    def __init__(
        self, key_id: str, key_secret: str, transport: httpx.AsyncBaseTransport | None = None
    ):
        self.key_id = key_id
        self._auth = (key_id, key_secret)
        self._transport = transport

    async def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        async with httpx.AsyncClient(
            base_url=API_BASE, auth=self._auth, timeout=20, transport=self._transport
        ) as client:
            response = await client.request(method, path, json=json)
        if response.status_code >= 400:
            raise ServiceUnavailableError(
                "The payment provider rejected the request.",
                details={"provider_status": response.status_code},
            )
        return response.json()

    async def create_order(self, *, amount_paise: int, receipt: str, notes: dict) -> dict:
        return await self._request(
            "POST",
            "/orders",
            {"amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes},
        )

    async def refund(self, *, payment_id: str, amount_paise: int, notes: dict) -> dict:
        return await self._request(
            "POST", f"/payments/{payment_id}/refund", {"amount": amount_paise, "notes": notes}
        )
