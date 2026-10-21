# 03 — User Journeys & Screens

Each journey lists the screens (frontend routes) and the API calls behind them, so you can trace
any click to the backend code that handles it.

## Route map

| Route | Who | Purpose |
|---|---|---|
| `/` | all | Landing page |
| `/destinations` | all | All destinations grouped by state |
| `/destinations/:slug` | all | Destination guide + resorts there |
| `/search?...` | all | Results with filters, sort, pagination |
| `/resorts/:slug` | all | Resort details + booking panel |
| `/login`, `/signup`, `/forgot-password`, `/reset-password?token=`, `/verify-email?token=` | guests | Auth |
| `/checkout/:bookingId` | customer | Review hold, pay (simulated/Razorpay) |
| `/trips`, `/trips/:bookingId` | customer | Booking history, details, cancel, review |
| `/favourites` | customer | Saved resorts |
| `/account` | any logged-in | Profile, preferences, password |
| `/owners` | all | "List your property" marketing page |
| `/owners/register` | guests | Owner sign-up |
| `/owner`, `/owner/resorts`, `/owner/resorts/:id/*`, `/owner/bookings`, `/owner/reviews` | owner | Owner dashboard |
| `/admin`, `/admin/resorts`, `/admin/users`, `/admin/bookings`, `/admin/reviews`, `/admin/destinations`, `/admin/settings`, `/admin/audit` | admin | Admin dashboard |

The frontend hides routes the user cannot access, but **the backend enforces it** — the frontend guard is only for user experience.

## J1 — Visitor browses and searches (no account)

1. Lands on `/` → `GET /destinations?featured=true`, `GET /resorts/featured`.
2. Enters "Coorg", 12–14 Dec, 1 room, 2 adults in the search widget → navigates to
   `/search?q=coorg&check_in=2026-12-12&check_out=2026-12-14&rooms=1&adults=2&children=0`.
3. Results page → `GET /resorts/search?<same params>`. Cards show **"₹14,200 for 2 nights · incl. taxes"** because dates are known; without dates they show **"from ₹6,000/night · excl. taxes"**.
4. Applies "Pool" and "Rating 4+" → URL updates, query refetches, chips appear with "Clear all".
5. Opens a resort → `/resorts/misty-ridge-coorg?check_in=...` → `GET /resorts/{slug}`, `GET /resorts/{id}/availability?...`, `GET /resorts/{id}/reviews`.
6. Clicks **Reserve** → redirected to `/login?next=...` (booking requires an account). Search state survives the round-trip.

## J2 — Customer signs up and books

1. `/signup` → `POST /auth/signup` → logged in immediately (access token + refresh cookie). A verification email is sent (console in dev).
2. Back on the resort page, picks room type "Valley View Cottage", 1 room → `POST /bookings/quote` shows the itemized breakdown (nightly rates, extra guests, discount, GST, service fee, total).
3. No login is needed: the visitor fills in **first name, last name, email and mobile** (prefilled when signed in) and clicks **Continue to payment**. A new email creates a customer account and signs them in (`POST /auth/checkout-signup`, set-password link emailed); an existing email asks for that account's password. Then → `POST /bookings` with an `Idempotency-Key` header → booking `pending_payment`, inventory held for 15 min → navigates to `/checkout/:id` with a countdown timer.
4. Clicks **Pay (simulated)** → `POST /payments/simulated/{bookingId}/succeed` → booking `confirmed` (or `pending_owner` if the resort requires manual confirmation).
5. Confirmation screen + email. `/trips` lists it.
6. Double-clicking Pay or refreshing during step 3 never creates two bookings (idempotency key).

## J3 — Customer cancels

1. `/trips/:id` → `GET /bookings/{id}` includes `cancellation: {eligible, refund_paise, policy_text, deadline}`.
2. Clicks **Cancel** → confirm dialog shows refund amount → `POST /bookings/{id}/cancel`.
3. Inventory is released in the same transaction; refund recorded as `refund_pending` (simulated: `refunded` with a "simulated" label; Razorpay: only after the provider confirms).

## J4 — Customer reviews after the stay

1. Day after check-out, booking shows `completed` and a **Write a review** button.
2. `POST /reviews` with `booking_id` → server checks: booking belongs to the user, is completed, has no review yet.
3. Review is published immediately (post-moderation); resort rating aggregates are recomputed.

## J5 — Owner onboards a resort

1. `/owners/register` → `POST /auth/signup` with `account_type: "owner"` → role `owner` (the only roles self-sign-up can choose are `customer` and `owner`; `admin` is rejected).
2. Owner dashboard empty state → **Add your property** → multi-step form:
   basics → location (address + map pin) → amenities & surroundings → policies → photos (direct Cloudinary upload with a signature from `POST /uploads/signature`) → room types.
   Each step saves a draft: `POST /owner/resorts`, then `PATCH /owner/resorts/{id}` and `POST /owner/resorts/{id}/room-types`.
3. **Submit for review** → `POST /owner/resorts/{id}/submit` (validates completeness: ≥ 3 photos, ≥ 1 active room type, coordinates, policies). Status `pending_review`.
4. Owner can still see it; the public cannot.

## J6 — Admin approves

1. `/admin/resorts?status=pending_review` → reviews the details.
2. **Approve** → `POST /admin/resorts/{id}/approve` → status `published`, audit log entry, owner notified. Or **Reject** with a reason → back to `draft` with `rejection_reason` shown to the owner.

## J7 — Owner manages pricing, inventory, and bookings

1. `/owner/resorts/:id/calendar` → `GET /owner/room-types/{id}/calendar?from=&to=` shows per-day units, reserved, blocked, price.
2. Sets a Christmas season rule (+40 %) → `POST /owner/room-types/{id}/rate-rules`.
3. Overrides 31 Dec to ₹18,000 → `PUT /owner/room-types/{id}/calendar` (date-specific override).
4. Blocks 3 units for maintenance 5–8 Jan → same endpoint with `blocked_units`. Rejected if it would push reserved + blocked above total.
5. `/owner/bookings` → sees only bookings for their resorts, with the guest name and phone needed for check-in.

## J8 — Unauthorized access is blocked (tested)

- Customer calls `GET /owner/resorts` → **403**.
- Owner A calls `PATCH /owner/resorts/{resortOfOwnerB}` → **404**.
- Owner A calls `GET /owner/bookings/{bookingAtOwnerBResort}` → **404**.
- Anyone sends `"role": "admin"` in signup → **422**.
- Customer sends `"total_paise": 1` in booking body → field ignored (not in the schema); the price is computed by the server.
