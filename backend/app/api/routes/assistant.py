"""AI booking assistant. Optional: without OPENAI_API_KEY it reports itself disabled and the
normal search and booking pages are unaffected."""

from fastapi import APIRouter, Request

from app.api.deps import DbDep, SettingsDep, rate_limit
from app.core.errors import ServiceUnavailableError
from app.schemas.assistant import AssistantStatus, ChatRequest, ChatResponse
from app.services.assistant_service import AssistantService
from app.services.llm import OpenAIChatClient

router = APIRouter(prefix="/assistant", tags=["assistant"])


def llm_client(request: Request):
    state = request.app.state
    if state.llm_client is not None:  # tests inject a fake
        return state.llm_client
    settings = state.settings
    if not settings.assistant_enabled:
        raise ServiceUnavailableError(
            "The AI assistant isn't available right now. You can still search and book as usual.",
            code="ASSISTANT_DISABLED",
        )
    return OpenAIChatClient(
        settings.openai_api_key,
        settings.openai_model,
        settings.openai_base_url,
        settings.openai_timeout_seconds,
    )


@router.get("/status", response_model=AssistantStatus)
async def assistant_status(request: Request, settings: SettingsDep):
    """Lets the chat widget say up front whether the assistant can answer."""
    return {"enabled": request.app.state.llm_client is not None or settings.assistant_enabled}


@router.post(
    "/chat",
    response_model=ChatResponse,
    # Each message costs model tokens, so limit it per IP (per minute and per hour).
    dependencies=[rate_limit("assistant", 15, 60), rate_limit("assistant-hour", 150, 3600)],
)
async def chat(body: ChatRequest, request: Request, db: DbDep):
    """One guest message → the assistant's reply, the updated search criteria, and result cards
    built from real availability and server-side prices."""
    return await AssistantService(db, llm_client(request)).chat(body)
