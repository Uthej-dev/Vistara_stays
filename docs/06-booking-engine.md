# 06 — Booking, Pricing & Availability Engine

> This is the most important design in the project — and the one interviewers ask about.
> It explains how a room is counted, priced, held, confirmed, and released, and **exactly**
> how double booking is prevented.

## 1. Vocabulary

- **Room type**: a kind of room with N identical **units** (e.g. 6 × "Valley View Cottage").
- **Night**: identified by its start date. A stay 12 Dec → 14 Dec uses nights **12 and 13**. Check-out is exclusive, so `nights = (check_out - check_in).days`.
- **Inventory row**: one document per (room type, night) holding counters.
- **Hold**: a booking in `pending_payment` whose units are already counted as reserved, with an expiry time.

## 2. Inventory model

```
inventory { room_type_id, date: "2026-12-12", total_units: 6, reserved_units: 4, blocked_units: 1, ... }
available = total_units - reserved_units - blocked_units      →  6 - 4 - 1 = 1
```

- A **unique index on `(room_type_id, date)`** guarantees there is exactly one counter per night — two processes can never create two competing counters.
- Rows are created on demand: before reserving, the service runs an idempotent bulk upsert
  (`$setOnInsert: {total_units: room_type.total_units, reserved_units: 0, blocked_units: 0}`)
  for every night in the range. Thanks to the unique index, concurrent upserts are safe
  (a duplicate-key race is caught and retried).
- Holds count as `reserved_units` immediately. That is what makes a hold actually protect the room.

## 3. How double booking is prevented

Two layers work together.

### Layer 1 — Atomic conditional increment (per night)

For each night, the reservation is a single `update_one` whose filter **only matches if there is
room**. MongoDB applies the filter and the update atomically on one document, so two requests can
never both see "1 available" and both take it.

```python
result = await inventory.update_one(
    {
        "room_type_id": room_type_id,
        "date": night,
        "closed": {"$ne": True},
        # only match if enough units remain AFTER this reservation
        "$expr": {"$lte": [
            {"$add": ["$reserved_units", "$blocked_units", rooms]},
            "$total_units",
        ]},
    },
    {"$inc": {"reserved_units": rooms, "version": 1}},
    session=session,
)
if result.modified_count == 0:
    raise RoomUnavailableError(date=night)
```

### Layer 2 — Multi-document transaction (all nights or none)

A 3-night stay must reserve 3 rows. If night 2 is full, nights 1 must be undone. We run the whole
reservation **plus** the booking insert inside one MongoDB transaction:

```
with transaction:
    1. for each night: conditional $inc (Layer 1) — any failure raises → whole transaction aborts
    2. insert booking (status pending_payment, hold_expires_at = now + 15 min)
    3. insert coupon_redemption (if a coupon was used; atomic usage-limit check)
commit
```

MongoDB Atlas (including the free M0 tier) runs as a **replica set**, so multi-document
transactions are supported. Locally, tests run against `mongod --replSet rs0` for the same reason.
If two transactions touch the same inventory row, MongoDB detects the **write conflict** and aborts
one with a `TransientTransactionError`; the driver's `with_transaction` helper retries it, and on
retry the conditional filter sees the updated counter and correctly fails with
`ROOM_UNAVAILABLE`.

**Fallback if transactions were unavailable** (documented, not used): apply the per-night
conditional increments in date order and, on failure, run compensating `$inc: -rooms` on the
nights already taken; mark the booking `failed`. A reconciliation script recomputes
`reserved_units` from bookings to repair any crash mid-compensation.

### Test that proves it (Phase 7/11)

Inventory has 1 unit left. Fire 20 concurrent `POST /bookings` requests from 20 different users
with `asyncio.gather`. Assert: exactly 1 → 201, 19 → 409 `ROOM_UNAVAILABLE`, and
`reserved_units == total_units`. Also a reconciliation assertion: `reserved_units` equals the sum
of `rooms` over active bookings for every night.

## 4. Booking state machine

```
                     ┌───────────── hold expires / payment fails ───────────┐
                     │                                                      ▼
 POST /bookings ─▶ pending_payment ──payment ok──▶ confirmed ──day after──▶ completed
                     │                    │              │      check-out
                     │                    │              ├──customer/owner/admin cancel──▶ cancelled
                     │      (booking_mode=request)       └──owner marks────────────────▶ no_show
                     │                    ▼
                     │              pending_owner ──owner confirms──▶ confirmed
                     │                    ├──owner rejects / 24 h timeout──▶ rejected
                     │                    └──customer cancels──▶ cancelled
                     └──customer abandons──▶ expired
```

| From → To | Inventory effect | Payment effect |
|---|---|---|
| (new) → pending_payment | reserve | — |
| pending_payment → confirmed / pending_owner | none (already reserved) | `paid` |
| pending_payment → expired | release | — |
| pending_owner → rejected | release | full refund |
| confirmed / pending_owner → cancelled | release | refund per policy snapshot (owner/admin cancel = 100 %) |
| confirmed → completed / no_show | none (past nights) | — |

Transitions are implemented as **conditional updates on status**:
`update_one({_id, status: "pending_payment"}, {$set: {status: "confirmed"}})`. If two things race
(e.g. payment success arrives just as the hold-expiry sweeper runs), only one update matches; the
loser sees `modified_count == 0` and re-reads the booking. Inventory release happens in the same
transaction as the status change and is guarded by `inventory_released: false → true`, so units are
never released twice.

**Payment arriving after expiry:** if a real payment is captured for an `expired` booking, the
service tries to re-reserve the inventory; if that succeeds the booking is confirmed, otherwise an
automatic full refund is issued and the booking is marked `cancelled` with reason `hold_expired`.

## 5. Hold expiry without a cron server

Render's free tier sleeps when idle, so a scheduled job can't be relied on. Expired holds are
released by:
1. **Lazy release** — before any reservation attempt on a room type, release expired holds for that room type (`status: pending_payment, hold_expires_at < now`). Correctness therefore never depends on the background task.
2. **Background sweep** — an `asyncio` task started in the app lifespan runs every 60 s while the server is awake.
3. **On read** — a booking read after its expiry is shown as expired and is released.

`completed` status is derived the same way (lazy on read + periodic sweep).

## 6. Idempotency

- `POST /bookings` requires an `Idempotency-Key` header (the frontend generates a UUID when the
  checkout page opens and reuses it for retries/double clicks).
- Unique index `{user_id, idempotency_key}` on bookings. On duplicate-key error, the service loads
  the existing booking: same `request_hash` → return it (200); different → 409.
- Payment confirmation is idempotent by the conditional status update; Razorpay webhooks are
  de-duplicated by `event_id` in `processed_webhook_events`.

## 7. Pricing algorithm (all integer paise)

For each night `d` in `[check_in, check_out)`:

```
rate(d) =  inventory[d].price_override_paise                      if set
        else apply highest-priority active rate_rule covering d     if any
             (percent → round(base_for_day × (1 + pct/100)); fixed_rate → value)
        else weekend_rate_paise if d is Friday or Saturday night (and set)
        else base_rate_paise
```
`base_for_day` is the weekend or weekday rate, so seasonal percentages stack on top of weekends.

Then:
```
room_subtotal   = Σ rate(d) × rooms
extra_guest     = Σ over nights of (extra adults × extra_adult_paise + extra children × extra_child_paise)
                  where extras = guests above base_occupancy × rooms (children under child_free_age excluded)
discount        = coupon (validated server-side: dates, min subtotal, usage limits, resort scope), capped
taxable         = room_subtotal + extra_guest - discount
tax             = Σ per night: GST slab chosen by that night's per-room effective rate
                  (slabs from platform_settings), rounded per line to the nearest paisa
service_fee     = round(taxable × service_fee_pct / 100)
total           = taxable + tax + service_fee
```

Rounding rule: round-half-up at each line item, never on intermediate floats (use `Decimal` for
percentages). The full breakdown is stored in `booking.price`, and **the frontend only ever
displays numbers the backend returned** — it never computes totals itself.

Quotes are recalculated when the booking is created; if the price changed since the quote (e.g. the
owner edited a rate), the response includes `price_changed: true` so the UI can show the new total
before payment.

## 8. Cancellation & refunds

`policy_snapshot.cancellation.tiers` is copied into the booking at creation. When cancelling:
`days_before = (check_in - today_IST).days`; the first tier with `days_before >= tier.days_before_check_in`
(tiers sorted descending) gives `refund_pct`. `refund_paise = round(total_paid × refund_pct / 100)`
(service fee non-refundable unless the owner/admin cancels). The refund is recorded as
`refund_pending` and only becomes `refunded` when the provider confirms (simulated provider:
immediately, clearly labelled as simulated).

## 9. Validation rules (all server-side)

| Rule | Error |
|---|---|
| `check_out > check_in` | 400 `INVALID_DATES` |
| `check_in >= today` (IST) | 400 `INVALID_DATES` |
| `check_in <= today + max_advance_days` | 400 `INVALID_DATES` |
| `nights <= max_nights` (30) | 400 `INVALID_DATES` |
| `1 <= rooms <= min(max_rooms_per_booking, total_units)` | 400 |
| per room: `ceil(adults/rooms) <= max_adults`, `ceil(counted_children/rooms) <= max_children`, sum ≤ `max_occupancy` | 400 `OCCUPANCY_EXCEEDED` |
| `adults >= rooms` (at least one adult per room) | 400 `OCCUPANCY_EXCEEDED` |
| resort `published` and room type `active` | 404 |
| every night available & not closed | 409 `ROOM_UNAVAILABLE` |
| owner block/override: `reserved + new_blocked <= total` per night | 409 |
