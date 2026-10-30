"""OpenAI Chat Completions client with tool (function) calling.

Only the backend talks to the model: the API key never reaches the browser. The model can't
touch the database itself — it can only ask for one of the tools the assistant service defines,
and the service decides what actually runs.
"""

import asyncio
import logging

import httpx

from app.core.errors import ServiceUnavailableError

logger = logging.getLogger("app.llm")

RETRYABLE_STATUSES = {429, 500, 502, 503, 504}


class OpenAIChatClient:
    """Thin async client. `transport` lets tests replace the network with httpx.MockTransport."""

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.openai.com/v1",
        timeout: float = 30,
        transport: httpx.AsyncBaseTransport | None = None,
        retry_delays: tuple[float, ...] = (1.5, 4),
    ):
        self.model = model
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._transport = transport
        self._retry_delays = retry_delays

    async def complete(self, messages: list[dict], tools: list[dict]) -> dict:
        """One model turn. Returns the assistant message: {"content": str|None, "tool_calls": [...]}."""
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.3,
        }
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url,
                headers=self._headers,
                timeout=self._timeout,
                transport=self._transport,
            ) as client:
                # Free tiers are often briefly overloaded (429/503): retry those a couple of
                # times. Other errors (bad key, unknown model) fail straight away.
                for delay in (*self._retry_delays, None):
                    response = await client.post("/chat/completions", json=payload)
                    if response.status_code not in RETRYABLE_STATUSES or delay is None:
                        break
                    logger.info(
                        "AI provider busy, retrying",
                        extra={"provider_status": response.status_code},
                    )
                    await asyncio.sleep(delay)
        except httpx.HTTPError as exc:
            logger.warning("AI provider unreachable", extra={"error": type(exc).__name__})
            raise ServiceUnavailableError(
                "The assistant is temporarily unavailable.", code="ASSISTANT_UNAVAILABLE"
            ) from exc
        if response.status_code >= 400:
            # The provider's body can echo our prompt, so log only the status.
            logger.warning("AI provider error", extra={"provider_status": response.status_code})
            raise ServiceUnavailableError(
                "The assistant is temporarily unavailable.",
                code="ASSISTANT_UNAVAILABLE",
                details={"provider_status": response.status_code},
            )
        try:
            return response.json()["choices"][0]["message"]
        except (ValueError, KeyError, IndexError) as exc:
            raise ServiceUnavailableError(
                "The assistant returned an unexpected response.", code="ASSISTANT_UNAVAILABLE"
            ) from exc
