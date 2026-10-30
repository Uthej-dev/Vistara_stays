# 12 · AI booking assistant

A floating chat assistant on every guest-facing page. It collects the guest's trip requirements
in conversation, searches **real** availability with the existing search and pricing engine, shows
results as cards, and hands off to the normal booking flow. It is optional: without an API key it
reports itself offline and the rest of the site is unaffected.

## 1. How a message flows

```
Browser (AssistantWidget)                 Backend                                   OpenAI
────────────────────────                  ───────                                   ──────
POST /assistant/chat
 { message, history (text only),   ──►  validate (ChatRequest, StayCriteria)
   criteria (what we know so far) }      build system prompt (today's date, criteria)
                                         loop ≤ 6 rounds:
                                           model turn  ─────────────────────────►  chat/completions
                                                       ◄─────────────────────────  tool_calls?
                                           run each tool on OUR services
                                           send tool results back to the model
                                         final text reply
 { reply, criteria, missing,        ◄──  + result cards built by the server
   results: {resorts, relaxed} }
```

The browser keeps the conversation (in `sessionStorage`) and sends back the `criteria` object the
server returned last time. That is how answers are remembered without server-side sessions. The
server re-validates `criteria` on every request, and never accepts tool calls or tool results from
the browser (`ChatTurn.role` is only `user` or `assistant`), so a client can't feed the model
invented prices.

## 2. Tools the model can call

| Tool | What it does | Reuses |
|---|---|---|
| `update_search_criteria` | Records what the guest said (destination, dates, adults, children, rooms, budget, amenities, sort, or fields to clear). Returns what is still missing and any problems. | `AvailabilityService.stay_nights` (same date rules as booking), `StayCriteria` validation, destinations and amenities from the database |
| `search_resorts` | Searches with the recorded criteria; if nothing matches, retries with the budget, amenity or destination filter relaxed and says which. | `SearchService.search` → `AvailabilityService.search_with_dates` (per-night inventory, occupancy, pricing with taxes and fees), then `AvailabilityService.resort_availability` per resort for the room list |
| `get_resort_details` | Description, amenities, policies, nearby attractions and room types (no private address). | `ResortService.get_published` |
| `get_stay_price` | Bookable room types and full prices for the recorded stay. | `AvailabilityService.resort_availability` → `pricing.quote` |
| `list_destinations` | Where we list stays. | `DestinationRepository` |

All tools are **read-only**. None of them hold rooms or create bookings.

### Validation rules

- Destination text is matched against active destinations (exact name or slug, a state name, or a
  destination name inside the text such as "Coorg, Karnataka"). Unknown places are rejected with
  the list of real destinations.
- Dates go through the booking engine's own rules: valid dates, not in the past, check-out after
  check-in, within the booking window, and no longer than the maximum stay.
- Guests and rooms use the same limits as search (1–20 adults, 0–10 children, 1–5 rooms, at least
  one adult per room).
- Amenities must be known amenity slugs. Unknown ones are dropped and reported.
- Any invalid value keeps its **previous** value, so one bad answer never wipes earlier ones.

## 3. What guarantees the numbers are real

1. Every resort, room, price and availability figure on a card comes from the server's search
   response, not from the model's text. The model only writes the short message above the cards.
2. Card prices come from the same `pricing.quote` used by `/bookings/quote` and the booking
   engine. `tests/test_assistant.py::test_results_use_real_inventory_and_the_server_price`
   checks that they are identical.
3. A resort is shown only if at least one room type fits the party and has enough free units on
   **every** night (`units_available` over the date range, including holds, blocks and closures).
4. **Book now** opens the existing checkout (`/checkout?…&room=…&resort=…`). Checkout calls the
   booking engine, which re-quotes, re-checks inventory and holds the room in a transaction. If the
   room sold out in the meantime, the guest sees the normal "no longer available" error. The
   assistant is told never to call a booking confirmed. Only the booking flow can confirm one.
5. When the party includes children, **Book now** opens the resort page first, because checkout
   needs each child's age (ages can change occupancy and price).

## 4. Failure handling

| Situation | What the guest sees |
|---|---|
| No `OPENAI_API_KEY` | `GET /assistant/status` → `enabled:false`. The widget says it's offline and links to normal search. |
| OpenAI down, slow or erroring | 503 `ASSISTANT_UNAVAILABLE`, shown in the chat with a **Try again** button. Provider error bodies are never logged or returned. |
| Database error during a tool | 503 `ASSISTANT_SEARCH_FAILED`, with a clear message. |
| Invalid dates or guests | The tool returns the problem; the assistant asks the guest to correct it. |
| No results | The search is relaxed step by step and the cards are labelled "No exact matches — showing stays …". If nothing at all is free, the assistant suggests other dates or places. |
| Model loops on tools | Stopped after 6 rounds with a polite fallback reply. |
| Unknown tool or malformed arguments | Reported back to the model as an error; nothing runs. |
| Too many messages | Rate limited per IP: 15 a minute and 150 an hour. |
| Widget crashes | An error boundary removes the widget; the page keeps working. |

The widget loads as a separate chunk after the page, and is hidden during checkout and payment
and in the owner and admin portals.

## 5. Privacy and security

- The API key lives only in backend environment variables. The browser talks only to our API.
- No user account data is sent to the model: not the name, email, phone or bookings. The model
  sees only the conversation and catalogue data. Street addresses are not included.
- Owner-written text (resort descriptions) is passed as data, and the system prompt tells the
  model to treat it as data, not instructions. Since every tool is read-only and every number on a
  card comes from the server, a prompt-injection attempt can at worst change the wording of a
  reply.
- Message length (1,000 characters), history length (30 turns, of which the last 20 are sent to
  the model) and per-turn tool rounds are capped to bound cost.

## 6. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | *(empty: assistant off)* | Secret key from https://platform.openai.com/api-keys |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Any chat model that supports tool calling |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Point at any OpenAI-compatible endpoint (e.g. Azure OpenAI or a local proxy) |
| `OPENAI_TIMEOUT_SECONDS` | `30` | Per model call |

## 7. Tests

- `backend/tests/test_assistant.py` (32 tests): a scripted fake model drives the real tools
  against the test database. It covers partial answers and missing fields, memory across turns,
  invalid input, sold-out exclusion, price parity with `/bookings/quote`, occupancy limits,
  budget, amenity and checkout refinement, relaxation, loop cap, bad tool calls, rate limiting,
  injected tool messages (422), and the OpenAI client against `httpx.MockTransport`
  (success, 500, malformed body, network error, and retrying only temporary 429/5xx errors).
- `frontend/src/features/assistant/AssistantWidget.test.jsx` (6 tests): open, minimize, close and
  reopen; request payload (history and criteria); cards with real prices and checkout links; the
  family route; error and retry; offline mode; persistence across reloads.
