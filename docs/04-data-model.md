# 04 — MongoDB Data Model

> Conventions: `_id` is an ObjectId. `created_at` / `updated_at` are UTC dates on every collection
> (omitted below for brevity). Money is **integer paise**. Night dates are `"YYYY-MM-DD"` strings.
> **Required** fields are in bold; everything else is optional.

## Collection overview

```
users ─┬─< sessions                       destinations ─< resorts >── users (owner)
       ├─< auth_tokens                                     │
       ├─< favourites >── resorts                          ├─< room_types ─┬─< inventory (1 doc / day)
       ├─< bookings ─────────────────────────────────────── ┘              └─< rate_rules
       │      ├─< payments
       │      └── reviews (0..1 per booking) ─< review_reports
       └─< audit_logs (actor)
categories, coupons, coupon_redemptions, enquiries, notifications, platform_settings
```

`─<` means "one to many" (the child stores the parent's ObjectId).

---

## users
| Field | Type | Notes |
|---|---|---|
| **email** | string | lower-cased, trimmed. **Unique index.** |
| **password_hash** | string | Argon2id hash. Never returned by the API. |
| **name** | string | 2–80 chars |
| phone | string | E.164, e.g. `+919876543210` |
| **role** | enum `customer` \| `owner` \| `admin` | set by the server only |
| **status** | enum `active` \| `suspended` \| `deleted` | |
| **email_verified** | bool | |
| **token_version** | int | incremented to revoke all access tokens |
| preferences | `{destinations: [ObjectId], newsletter: bool}` | |
| owner_profile | `{business_name, gstin, payout_note}` | owners only |
| last_login_at | date | |

Indexes: `{email: 1}` unique; `{role: 1, status: 1}`.
Deletion: "delete account" anonymises (`email → deleted+<id>@invalid`, name → "Deleted user", phone removed) but keeps bookings for financial records.

## sessions (refresh tokens)
| Field | Type | Notes |
|---|---|---|
| **user_id** | ObjectId | |
| **token_hash** | string | SHA-256 of the refresh token. **Unique.** |
| **family_id** | string | shared by all rotations of one login, for reuse detection |
| **expires_at** | date | **TTL index** (auto-delete when expired) |
| revoked_at | date | |
| user_agent, ip | string | shown in "active sessions" |

## auth_tokens (password reset, email verification)
`{user_id, purpose: "reset_password"|"verify_email", token_hash (unique), expires_at (TTL), used_at}`

## destinations
| Field | Type | Notes |
|---|---|---|
| **name** | string | "Coorg" |
| **slug** | string | "coorg". **Unique.** |
| **state** | enum | `andhra_pradesh`, `telangana`, `karnataka`, `kerala`, `tamil_nadu` (extendable) |
| **district** | string | "Kodagu" |
| region | string | "Western Ghats" |
| **types** | [string] | `hill_station`, `beach`, `forest`, `backwater`, `heritage`, `lake`, `wildlife` |
| **location** | GeoJSON Point | `{type: "Point", coordinates: [lng, lat]}` — **lng first** |
| summary, guide_md | string | travel guide text |
| best_months | [int] | 1–12 |
| nearest_airport, nearest_railway | `{name, distance_km}` | |
| hero_image | `{url, public_id, alt}` | |
| **is_active** | bool | admins can hide without deleting |
| featured_rank | int | for landing page ordering |

Indexes: `{slug:1}` unique; `{state:1, is_active:1}`; `{location: "2dsphere"}`.

## categories
`{slug (unique), name, kind: "category"|"amenity"|"surrounding", icon, sort_order, is_active}`
Data-driven lists for "Mountain retreats", "Pool", "Forest", etc. The frontend renders whatever the API returns.

## resorts
| Field | Type | Notes |
|---|---|---|
| **owner_id** | ObjectId → users | |
| manager_ids | [ObjectId] | reserved for future staff access |
| **name** | string | |
| **slug** | string | **Unique.** |
| **status** | enum | `draft` → `pending_review` → `published`; also `rejected`, `suspended`, `archived` |
| **destination_id** | ObjectId → destinations | |
| destination_name, destination_slug, state | string | **denormalised** for search/display (small, rarely changes; updated by admin service if a destination is renamed) |
| **property_type** | enum | `resort`, `villa`, `cottage`, `homestay`, `boutique_hotel`, `treehouse`, `houseboat`, `tent` |
| categories | [slug] | `mountain_retreat`, `beach_resort`, ... |
| amenities | [slug] | `pool`, `wifi`, `parking`, `restaurant`, `spa`, `pet_friendly`, `kids_play_area` ... |
| surroundings | [slug] | `mountain`, `forest`, `beach`, `lake`, `city`, `plantation` |
| **address** | `{line1, line2, town, district, state, pincode}` | |
| **location** | GeoJSON Point | |
| distance_from_centre_km | number | precomputed from destination centre on save |
| description, highlights[] | string | |
| **images** | [`{url, public_id, alt, width, height}`] | first = cover |
| **policies** | object | see below |
| nearby_attractions | [`{name, distance_km, note}`] | |
| contact | `{email, phone}` | shown only via enquiry, not publicly |
| booking_mode | enum `instant` \| `request` | `request` → owner must confirm |
| **starting_price_paise** | int | **denormalised** min base rate of active room types (recomputed on room-type change) |
| rating | `{avg, count, cleanliness, location, service, facilities}` | **derived** from published reviews only |
| **is_sample** | bool | true for seeded fictional data |
| rejection_reason, suspended_reason | string | |
| published_at | date | |

`policies` = `{check_in_time: "14:00", check_out_time: "11:00", cancellation_policy: {code, tiers}, meals: {breakfast_included, meal_plans: [...]}, child_free_age: 5, pets_allowed, smoking_allowed, house_rules[], accessibility[], id_required: true}`

Cancellation `tiers` example (snapshotted into each booking):
`[{days_before_check_in: 7, refund_pct: 100}, {days_before_check_in: 2, refund_pct: 50}, {days_before_check_in: 0, refund_pct: 0}]`

Indexes:
- `{slug: 1}` unique
- `{status: 1, destination_id: 1, starting_price_paise: 1}` — main search path
- `{status: 1, "rating.avg": -1}`, `{status: 1, "rating.count": -1}` — sort paths
- `{owner_id: 1, status: 1}` — owner dashboard
- `{location: "2dsphere"}` — distance
- text index on `{name: 10, destination_name: 5, "address.town": 5, description: 1}` — keyword search

## room_types
| Field | Type | Notes |
|---|---|---|
| **resort_id** | ObjectId | |
| **owner_id** | ObjectId | duplicated from resort so ownership checks need one query |
| **name** | string | "Valley View Cottage" |
| description | string | |
| **max_adults**, **max_children**, **max_occupancy** | int | per room |
| **base_occupancy** | int | guests included in the rate (usually 2) |
| beds | [`{type: "king"|"queen"|"twin"|"sofa_bed", count}`] | |
| size_sqft | int | |
| amenities | [slug] | |
| images | [image] | |
| **total_units** | int | how many identical rooms exist |
| **base_rate_paise** | int | weekday rate |
| weekend_rate_paise | int | Fri & Sat nights; falls back to base |
| extra_adult_paise, extra_child_paise | int | per extra guest per night above `base_occupancy` |
| meal_plan | enum `room_only` \| `breakfast` \| `half_board` \| `full_board` | |
| **status** | enum `active` \| `inactive` | |

Indexes: `{resort_id: 1, status: 1}`, `{owner_id: 1}`.

## rate_rules (seasonal pricing)
`{room_type_id, owner_id, name: "Christmas peak", start_date, end_date (inclusive), adjustment: {type: "percent"|"fixed_rate", value}, days_of_week: [0..6] | null, priority: int, is_active}`
Index: `{room_type_id: 1, start_date: 1, end_date: 1}`.

## inventory (one document per room type per night) — the heart of the booking engine
| Field | Type | Notes |
|---|---|---|
| **room_type_id** | ObjectId | |
| **resort_id** | ObjectId | for resort-wide availability queries |
| **date** | "YYYY-MM-DD" | a *night* (the night starting on this date) |
| **total_units** | int | copied from room type; changed when the owner changes units |
| **reserved_units** | int | held + confirmed bookings |
| **blocked_units** | int | owner maintenance / private blocks |
| price_override_paise | int | date-specific price (highest precedence) |
| closed | bool | stop-sell for the day |
| **version** | int | incremented on every change (debug/optimistic checks) |

**Invariant (enforced by every write):** `reserved_units + blocked_units <= total_units`.

Indexes: `{room_type_id: 1, date: 1}` **unique** (guarantees one counter per night);
`{resort_id: 1, date: 1}`.
Retention: past dates older than 2 years can be archived/deleted; bookings keep their own snapshot.

## bookings
| Field | Type | Notes |
|---|---|---|
| **booking_ref** | string | human-friendly `VS-7K3M9Q`. **Unique.** |
| **user_id**, **resort_id**, **room_type_id**, **owner_id** | ObjectId | `owner_id` lets owners query their bookings directly |
| **check_in**, **check_out** | "YYYY-MM-DD" | check-out exclusive |
| **nights** | int | |
| **rooms** | int | |
| **guests** | `{adults, children, child_ages[]}` | |
| **guest_details** | `{name, email, phone, age (18–120), nationality: "IN"\|ISO-3166 code, arrival_time?: "HH:MM"}` | lead guest; PII. Visible to the booking user, the resort owner (time-window rule), and admins. No ID numbers stored. |
| special_requests | string | |
| **status** | enum | see state machine in [06-booking-engine.md](06-booking-engine.md) |
| **payment_status** | enum | `unpaid`, `paid`, `refund_pending`, `partially_refunded`, `refunded`, `failed` |
| **hold_expires_at** | date | when a `pending_payment` hold lapses |
| **inventory_released** | bool | guards against double release |
| **price** | snapshot | `{currency: "INR", nightly: [{date, rate_paise}], room_subtotal, extra_guest, discount, taxable, tax: [{name, rate_pct, amount}], service_fee, total_paise}` |
| **policy_snapshot** | object | cancellation tiers, check-in/out times, meal plan, at booking time |
| **resort_snapshot** | `{name, slug, destination_name, cover_url, room_type_name}` | stable display even if the resort is later edited |
| coupon | `{code, discount_paise}` | |
| **idempotency_key** | string | from `Idempotency-Key` header |
| **request_hash** | string | hash of the request body, detects key reuse with a different body |
| cancellation | `{cancelled_at, by: "customer"|"owner"|"admin"|"system", reason, refund_paise}` | |
| status_history | [`{status, at, by}`] | audit trail inside the booking |
| is_sample | bool | |

Indexes:
- `{booking_ref: 1}` unique
- `{user_id: 1, idempotency_key: 1}` **unique** — duplicate submissions return the original booking
- `{user_id: 1, created_at: -1}` — "My trips"
- `{owner_id: 1, check_in: 1}`, `{resort_id: 1, check_in: 1}` — owner views
- `{status: 1, hold_expires_at: 1}` — expiry sweeper
- `{status: 1, check_out: 1}` — completion sweeper

## payments
`{booking_id, user_id, provider: "simulated"|"razorpay", provider_order_id (unique, sparse), provider_payment_id, amount_paise, status: "created"|"captured"|"failed"|"refund_pending"|"refunded", refunds: [{provider_refund_id, amount_paise, status, at}], raw_events: [{event_id, type, received_at}]}`
Index: `{booking_id: 1}`; webhook event IDs stored in `processed_webhook_events {event_id unique, received_at TTL 30d}` for idempotent webhook handling. **No card data is ever stored.**

## reviews
| Field | Type | Notes |
|---|---|---|
| **booking_id** | ObjectId | **Unique index** → max one review per booking |
| **user_id**, **resort_id** | ObjectId | |
| **rating** | int 1–5 | |
| sub_ratings | `{cleanliness, location, service, facilities}` ints 1–5 | |
| title, **body** | string | body 20–2000 chars |
| stay_month | "YYYY-MM" | |
| **status** | enum `published` \| `hidden` \| `removed` | |
| owner_reply | `{body, at}` | |
| report_count | int | |
| **is_sample** | bool | |

Indexes: `{booking_id:1}` unique; `{resort_id:1, status:1, created_at:-1}`.

## review_reports
`{review_id, reporter_id, reason: enum, note, status: "open"|"actioned"|"dismissed", handled_by}`; unique `{review_id, reporter_id}`.

## favourites
`{user_id, resort_id, created_at}`; **unique** `{user_id: 1, resort_id: 1}` (saving twice is a no-op).

## coupons / coupon_redemptions
`coupons {code (unique, upper-case), type: "percent"|"flat", value, max_discount_paise, min_subtotal_paise, valid_from, valid_to, usage_limit, per_user_limit, used_count, resort_ids[] | null, is_active}`
`coupon_redemptions {coupon_id, user_id, booking_id (unique)}` — usage counted atomically with `$inc` + `$expr: used_count < usage_limit`.

## enquiries
`{resort_id, owner_id, user_id?, name, email, message, status}` — rate-limited contact form.

## notifications
`{user_id, type, title, body, link, read_at}`; index `{user_id:1, read_at:1, created_at:-1}`; TTL 180 days.

## audit_logs
`{actor_id, actor_role, action: "resort.approve"|"user.suspend"|"booking.cancel"|..., target_type, target_id, before?, after?, reason, ip, request_id, at}`
Append-only (no update/delete endpoints). Index `{target_type:1, target_id:1, at:-1}`, `{at:-1}`.

## platform_settings (single document, `_id: "global"`)
`{tax_slabs: [{up_to_paise_per_night, rate_pct}], service_fee_pct, hold_minutes: 15, max_advance_days: 365, max_nights: 30, max_rooms_per_booking: 5}`

> **Tax note:** seeded slabs follow India's hotel-accommodation GST as revised in September 2025
> (5% for room value ≤ ₹7,500/night, 18% above). Tax law changes — rates are admin-editable and
> must be verified with a tax professional before any real use.

## Query patterns (summary)

| Screen | Query |
|---|---|
| Search without dates | `resorts.find({status: "published", ...filters}).sort(...).skip().limit()` + count |
| Search with dates | aggregation: match resorts → `$lookup` room_types that fit occupancy → `$lookup` inventory for the date range → keep room types where every night has `total - reserved - blocked >= rooms` and is not closed → compute stay price in the service for the page only |
| Distance filter | `$geoNear` as the first pipeline stage (2dsphere index) |
| Resort details | resort by slug + active room types + first page of reviews (3 queries, run in parallel) |
| My trips | `bookings.find({user_id}).sort({created_at:-1})` |
| Owner calendar | `inventory.find({room_type_id, date: {$gte, $lt}})` |

Pagination uses `skip/limit` (simple, good up to a few thousand rows). Audit logs and admin bookings
use keyset pagination on `(created_at, _id)` because they grow without bound.

## Privacy & retention

- Guest details live only in `bookings.guest_details`; owner endpoints return them only for that owner's bookings, and only from 30 days before check-in until 90 days after check-out.
- Logs never include email, phone, tokens, or passwords.
- `sessions` and `auth_tokens` auto-expire via TTL indexes.
- Account deletion anonymises the user; bookings and payments are retained for accounting (documented in the privacy policy page).

## Seed data (Phase 4)

`python -m scripts.seed` creates: 25+ real **destinations** (public geographic places), categories and
amenities, 3 fictional owners, ~40 fictional resorts (`is_sample: true`, names clearly invented,
addresses at town level only), room types, 180 days of inventory, and sample reviews labelled as
samples. It is **idempotent** (upserts by slug/email). `--reset` drops only sample documents and
requires `APP_ENV != production`.
