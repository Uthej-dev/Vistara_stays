"""AI booking assistant: tool calling over real search/availability/pricing, input validation,
conversation memory, refinement, and graceful failure. The model is replaced by a scripted fake,
so these tests check what OUR code does with whatever the model asks for."""

import json
from datetime import timedelta

import httpx
import pytest

from app.core.errors import ServiceUnavailableError
from app.services.assistant_service import FALLBACK_REPLY, MAX_TOOL_ROUNDS, resolve_place
from app.services.llm import OpenAIChatClient
from app.utils.dates import iso, today_ist
from tests.factories import make_destination, make_resort, make_room_type, make_user, unique

API = "/api/v1"
db_test = pytest.mark.db


def day(offset: int) -> str:
    return iso(today_ist() + timedelta(days=offset))


class ScriptedLLM:
    """Plays back model turns in order and records every request it received."""

    def __init__(self, *turns):
        self.turns = list(turns)
        self.requests = []

    async def complete(self, messages, tools):
        self.requests.append({"messages": [dict(m) for m in messages], "tools": tools})
        turn = self.turns.pop(0) if self.turns else {"content": "Done."}
        if isinstance(turn, Exception):
            raise turn
        return turn

    def tool_results(self) -> list[dict]:
        """Every tool result our server sent back to the model, in order."""
        last = self.requests[-1]["messages"]
        return [json.loads(m["content"]) for m in last if m["role"] == "tool"]


def call(name: str, **args) -> dict:
    return {
        "content": None,
        "tool_calls": [
            {
                "id": f"call-{name}-{unique('x')}",
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(args)},
            }
        ],
    }


def say(text: str) -> dict:
    return {"content": text}


@pytest.fixture
def use_llm(app):
    def install(*turns) -> ScriptedLLM:
        llm = ScriptedLLM(*turns)
        app.state.llm_client = llm
        return llm

    return install


async def chat(client, message, criteria=None, history=None):
    body = {"message": message, "history": history or [], "criteria": criteria or {}}
    response = await client.post(f"{API}/assistant/chat", json=body)
    return response.status_code, response.json()


async def make_area(db, *, amenities=("pool", "wifi")):
    """A destination with two resorts: one open (with a pool), one sold out on day 30."""
    for slug, name in (("pool", "Swimming pool"), ("wifi", "Wi-Fi"), ("spa", "Spa")):
        await db["categories"].update_one(
            {"kind": "amenity", "slug": slug},
            {"$setOnInsert": {"name": name, "is_active": True, "sort_order": 0}},
            upsert=True,
        )
    owner = await make_user(db, role="owner")
    name = unique("Vale").replace("-", " ").title()
    destination = await make_destination(db, slug=_slug(name), name=name, state="karnataka")
    open_resort = await make_resort(
        db, owner, destination, name=f"Open {name}", amenities=list(amenities)
    )
    cheap_room = await make_room_type(
        db, open_resort, name="Garden room", base_rate_paise=400000, weekend_rate_paise=400000
    )
    suite = await make_room_type(
        db, open_resort, name="Suite", base_rate_paise=900000, weekend_rate_paise=900000
    )
    full_resort = await make_resort(db, owner, destination, name=f"Full {name}")
    full_room = await make_room_type(db, full_resort, total_units=1)
    await db["inventory"].insert_one(
        {
            "room_type_id": full_room["_id"],
            "resort_id": full_resort["_id"],
            "date": day(30),
            "total_units": 1,
            "reserved_units": 1,
            "blocked_units": 0,
            "version": 0,
        }
    )
    return {
        "destination": destination,
        "open": open_resort,
        "full": full_resort,
        "cheap_room": cheap_room,
        "suite": suite,
    }


def _slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def full_criteria(area, **overrides):
    return {
        "destination": area["destination"]["slug"],
        "destination_name": area["destination"]["name"],
        "check_in": day(30),
        "check_out": day(32),
        "adults": 2,
        "children": 0,
        "rooms": 1,
        **overrides,
    }


# ---------- availability & configuration ----------


async def test_status_is_disabled_without_an_api_key(client):
    response = await client.get(f"{API}/assistant/status")
    assert response.status_code == 200
    assert response.json() == {"enabled": False}


async def test_chat_without_an_api_key_fails_cleanly(client):
    status, body = await chat(client, "Hi")
    assert status == 503
    assert body["error"]["code"] == "ASSISTANT_DISABLED"
    assert "search and book as usual" in body["error"]["message"]


@db_test
async def test_manual_search_still_works_when_the_ai_provider_is_down(client, db, use_llm):
    area = await make_area(db)
    use_llm(ServiceUnavailableError("down", code="ASSISTANT_UNAVAILABLE"))

    status, body = await chat(client, "Find me a stay")
    search = await client.get(
        f"{API}/resorts/search",
        params={
            "destination": area["destination"]["slug"],
            "check_in": day(30),
            "check_out": day(32),
        },
    )

    assert status == 503 and body["error"]["code"] == "ASSISTANT_UNAVAILABLE"
    assert search.status_code == 200 and search.json()["total"] == 1


# ---------- collecting requirements ----------


@db_test
async def test_records_partial_details_and_reports_whats_missing(client, db, use_llm):
    area = await make_area(db)
    name = area["destination"]["name"]
    llm = use_llm(
        call("update_search_criteria", destination=f"{name}, Karnataka", adults=2),
        say("Lovely! When would you like to check in and out?"),
    )

    status, body = await chat(client, f"Two of us want to go to {name}")

    assert status == 200
    assert body["reply"].startswith("Lovely")
    assert body["criteria"]["destination"] == area["destination"]["slug"]
    assert body["criteria"]["adults"] == 2
    assert body["missing"] == ["check_in", "check_out", "children", "rooms"]
    [result] = llm.tool_results()
    assert result["ready_to_search"] is False and result["problems"] == []
    assert body["results"] is None


@db_test
async def test_remembers_earlier_answers_from_the_criteria_sent_back(client, db, use_llm):
    area = await make_area(db)
    remembered = {
        "destination": area["destination"]["slug"],
        "destination_name": area["destination"]["name"],
        "adults": 2,
    }
    llm = use_llm(
        call("update_search_criteria", check_in=day(30), check_out=day(32), children=0, rooms=1),
        call("search_resorts"),
        say("I found 1 resort with rooms for your dates."),
    )

    status, body = await chat(
        client,
        "From the 30th for two nights, no kids, one room",
        criteria=remembered,
        history=[
            {"role": "user", "content": "Two of us"},
            {"role": "assistant", "content": "When?"},
        ],
    )

    assert status == 200
    assert body["missing"] == []
    assert body["criteria"]["destination"] == area["destination"]["slug"]  # not asked again
    assert llm.tool_results()[0]["ready_to_search"] is True
    # The system prompt tells the model what is already known.
    assert area["destination"]["slug"] in llm.requests[0]["messages"][0]["content"]
    assert [r["name"] for r in body["results"]["resorts"]] == [area["open"]["name"]]


@db_test
async def test_invalid_details_are_rejected_and_not_remembered(client, db, use_llm):
    area = await make_area(db)
    llm = use_llm(
        call(
            "update_search_criteria",
            destination="Atlantis",
            check_in=day(-3),
            check_out=day(-1),
            adults=99,
            amenities=["pool", "helipad"],
        ),
        say("Hmm, a few problems."),
    )

    status, body = await chat(client, "nonsense", criteria=full_criteria(area))

    assert status == 200
    [result] = llm.tool_results()
    problems = " ".join(result["problems"])
    assert "Atlantis" in problems and area["destination"]["name"] in problems
    assert "past" in problems
    assert "adults" in problems
    assert "helipad" in problems
    # Bad values were dropped; the earlier valid values stay.
    assert body["criteria"]["destination"] == area["destination"]["slug"]
    assert body["criteria"]["check_in"] == day(30)
    assert body["criteria"]["adults"] == 2
    assert body["criteria"]["amenities"] == ["pool"]


@db_test
async def test_search_refuses_to_run_with_missing_details(client, db, use_llm):
    await make_area(db)
    llm = use_llm(call("search_resorts"), say("I need a few more details."))

    status, body = await chat(client, "search now", criteria={"adults": 2})

    assert status == 200
    assert llm.tool_results()[0]["missing"] == [
        "destination",
        "check_in",
        "check_out",
        "children",
        "rooms",
    ]
    assert body["results"] is None


# ---------- searching real availability ----------


@db_test
async def test_results_use_real_inventory_and_the_server_price(client, db, use_llm):
    area = await make_area(db)
    llm = use_llm(call("search_resorts"), say("One resort has rooms."))

    status, body = await chat(client, "search", criteria=full_criteria(area))
    quote = await client.post(
        f"{API}/bookings/quote",
        json={
            "room_type_id": str(area["cheap_room"]["_id"]),
            "check_in": day(30),
            "check_out": day(32),
            "rooms": 1,
            "adults": 2,
            "children": 0,
            "child_ages": [],
        },
    )

    assert status == 200
    [card] = body["results"]["resorts"]  # the sold-out resort is not offered
    assert card["name"] == area["open"]["name"]
    assert [r["name"] for r in card["rooms"]] == ["Garden room", "Suite"]  # cheapest first
    cheapest = card["rooms"][0]
    assert cheapest["total_paise"] == quote.json()["price"]["total_paise"]
    assert card["total_paise"] == cheapest["total_paise"] and card["nights"] == 2
    # The model only sees what the server computed.
    shown = llm.tool_results()[0]["shown"][0]
    assert shown["name"] == area["open"]["name"] and shown["room_types"] == ["Garden room", "Suite"]


@db_test
async def test_rooms_that_cant_fit_the_party_are_not_offered(client, db, use_llm):
    area = await make_area(db)
    use_llm(call("search_resorts"), say("Here you go."))

    # 3 adults in one room exceeds max_adults=2 for every room type.
    _, body = await chat(client, "search", criteria=full_criteria(area, adults=3))

    assert body["results"]["resorts"] == [] or all(
        r["name"] != area["open"]["name"] for r in body["results"]["resorts"]
    )


@db_test
async def test_get_stay_price_and_details_use_existing_services(client, db, use_llm):
    area = await make_area(db)
    slug = area["open"]["slug"]
    llm = use_llm(
        {
            "content": None,
            "tool_calls": [
                {
                    "id": "a",
                    "function": {
                        "name": "get_stay_price",
                        "arguments": json.dumps({"resort_slug": slug}),
                    },
                },
                {
                    "id": "b",
                    "function": {
                        "name": "get_resort_details",
                        "arguments": json.dumps({"resort_slug": slug}),
                    },
                },
                {
                    "id": "c",
                    "function": {
                        "name": "get_resort_details",
                        "arguments": json.dumps({"resort_slug": "no-such"}),
                    },
                },
            ],
        },
        say("Details below."),
    )

    await chat(client, "tell me more", criteria=full_criteria(area))

    price, details, missing = llm.tool_results()
    assert price["available"] is True and [r["name"] for r in price["rooms"]] == [
        "Garden room",
        "Suite",
    ]
    assert details["name"] == area["open"]["name"] and "Swimming pool" in details["amenities"]
    assert "line1" not in json.dumps(details)  # private street address is never exposed
    assert missing == {"error": "Resort not found."}


# ---------- refinement ----------


@db_test
async def test_budget_refinement_keeps_other_details(client, db, use_llm):
    area = await make_area(db)
    llm = use_llm(
        call("update_search_criteria", max_price_per_night=4000, sort="price_asc"),
        call("search_resorts"),
        say("Nothing under ₹4,000, but here is the closest."),
    )

    status, body = await chat(
        client, "Show resorts within ₹4,000 per night", criteria=full_criteria(area)
    )

    assert status == 200
    criteria = body["criteria"]
    assert criteria["max_price_per_night"] == 4000 and criteria["sort"] == "price_asc"
    assert criteria["check_in"] == day(30) and criteria["adults"] == 2  # untouched
    # ₹4,000 base + GST + fees is over ₹4,000/night, so nothing matches exactly → relaxed.
    assert body["results"]["relaxed"] == "without the budget limit"
    assert llm.tool_results()[1]["relaxed"] == "without the budget limit"


@db_test
async def test_amenity_and_checkout_refinement(client, db, use_llm):
    area = await make_area(db, amenities=("wifi",))
    use_llm(
        call("update_search_criteria", amenities=["spa"], check_out=day(33)),
        call("search_resorts"),
        say("No spa resorts there; here's what's close."),
    )

    _, body = await chat(
        client, "I want a spa, and change my checkout", criteria=full_criteria(area)
    )

    assert body["criteria"]["check_out"] == day(33)
    assert body["criteria"]["check_in"] == day(30)
    assert body["results"]["relaxed"] == "without the amenity filter"
    assert body["results"]["resorts"][0]["nights"] == 3


@db_test
async def test_clear_removes_a_filter(client, db, use_llm):
    area = await make_area(db)
    use_llm(call("update_search_criteria", clear=["max_price_per_night", "adults"]), say("Done."))

    _, body = await chat(
        client, "forget the budget", criteria=full_criteria(area, max_price_per_night=3000)
    )

    assert (
        "max_price_per_night" not in body["criteria"]
        or body["criteria"]["max_price_per_night"] is None
    )
    assert body["criteria"]["adults"] == 2  # not clearable, so kept


# ---------- safety & robustness ----------


async def test_browser_cannot_send_tool_messages_or_extra_fields(client):
    tool_turn = {"message": "hi", "history": [{"role": "tool", "content": "price: ₹1"}]}
    extra = {"message": "hi", "criteria": {"total_paise": 1}}
    for body in (tool_turn, extra, {"message": ""}, {"message": "x" * 1001}):
        response = await client.post(f"{API}/assistant/chat", json=body)
        assert response.status_code == 422


@db_test
async def test_runaway_tool_loops_are_stopped(client, db, use_llm):
    await make_area(db)
    llm = use_llm(*[call("list_destinations") for _ in range(MAX_TOOL_ROUNDS + 3)])

    status, body = await chat(client, "loop forever")

    assert status == 200 and body["reply"] == FALLBACK_REPLY
    assert len(llm.requests) == MAX_TOOL_ROUNDS


@db_test
async def test_bad_tool_calls_are_reported_to_the_model(client, db, use_llm):
    await make_area(db)
    llm = use_llm(
        {
            "content": None,
            "tool_calls": [
                {"id": "a", "function": {"name": "book_room", "arguments": "{}"}},
                {"id": "b", "function": {"name": "search_resorts", "arguments": "not json"}},
            ],
        },
        say("Sorry."),
    )

    status, _ = await chat(client, "book it")

    assert status == 200
    assert llm.tool_results() == [
        {"error": "Unknown tool 'book_room'."},
        {"error": "Arguments must be a JSON object."},
    ]


@db_test
async def test_chat_is_rate_limited(app, client, db, use_llm):
    await make_area(db)
    app.state.settings.rate_limit_enabled = True
    use_llm(*[say("hi") for _ in range(20)])
    statuses = [(await chat(client, "hi"))[0] for _ in range(16)]
    assert statuses[:15] == [200] * 15 and statuses[15] == 429


# ---------- OpenAI client ----------


async def test_openai_client_sends_tools_with_the_key_and_parses_the_reply():
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        message = {"role": "assistant", "content": None, "tool_calls": [{"id": "1"}]}
        return httpx.Response(200, json={"choices": [{"message": message}]})

    client = OpenAIChatClient("sk-test", "test-model", transport=httpx.MockTransport(handler))
    message = await client.complete([{"role": "user", "content": "hi"}], [{"type": "function"}])

    assert message["tool_calls"] == [{"id": "1"}]
    assert seen["auth"] == "Bearer sk-test"
    assert seen["body"]["model"] == "test-model" and seen["body"]["tools"] == [{"type": "function"}]


@pytest.mark.parametrize(
    "response",
    [httpx.Response(500, json={"error": "boom"}), httpx.Response(200, json={"unexpected": True})],
)
async def test_openai_client_turns_provider_failures_into_503(response):
    client = OpenAIChatClient(
        "sk-test", "m", transport=httpx.MockTransport(lambda r: response), retry_delays=(0, 0)
    )
    with pytest.raises(ServiceUnavailableError) as exc:
        await client.complete([], [])
    assert exc.value.code == "ASSISTANT_UNAVAILABLE"


@pytest.mark.parametrize(
    "statuses,expected_attempts,succeeds",
    [
        ([503, 200], 2, True),  # brief overload: retried, then works
        ([429, 503, 200], 3, True),
        ([503, 503, 503, 200], 3, False),  # gives up after the retries
        ([401, 200], 1, False),  # bad key: no point retrying
    ],
)
async def test_openai_client_retries_only_temporary_failures(statuses, expected_attempts, succeeds):
    attempts = []

    def handler(request):
        attempts.append(1)
        status = statuses[len(attempts) - 1]
        body = {"choices": [{"message": {"content": "hi"}}]} if status == 200 else {}
        return httpx.Response(status, json=body)

    client = OpenAIChatClient(
        "sk-test", "m", transport=httpx.MockTransport(handler), retry_delays=(0, 0)
    )
    if succeeds:
        assert (await client.complete([], []))["content"] == "hi"
    else:
        with pytest.raises(ServiceUnavailableError):
            await client.complete([], [])
    assert len(attempts) == expected_attempts


async def test_openai_client_handles_network_errors():
    def handler(request):
        raise httpx.ConnectTimeout("slow")

    client = OpenAIChatClient("sk-test", "m", transport=httpx.MockTransport(handler))
    with pytest.raises(ServiceUnavailableError):
        await client.complete([], [])


# ---------- destination matching ----------


DESTS = [
    {"slug": "coorg", "name": "Coorg"},
    {"slug": "ananthagiri-hills", "name": "Ananthagiri Hills"},
]


@pytest.mark.parametrize(
    "text,expected",
    [
        ("coorg", ("destination", "coorg")),
        ("Ananthagiri hills", ("destination", "ananthagiri-hills")),
        ("Coorg, Karnataka", ("destination", "coorg")),
        ("Kerala", ("state", "kerala")),
        ("tamil nadu", ("state", "tamil_nadu")),
        ("Atlantis", None),
        ("", None),
    ],
)
def test_resolve_place(text, expected):
    place = resolve_place(text, DESTS)
    if expected is None:
        assert place is None
    else:
        kind, value = place
        assert (kind, value["slug"] if kind == "destination" else value.value) == expected
