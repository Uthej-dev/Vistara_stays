# 01 — Requirements & Scope

> Phase 1 deliverable. This file defines **what** Vistara Stays does, who uses it, and what is
> deliberately out of scope. Every later phase is checked against this document.

## 1. Product summary

Vistara Stays is a resort discovery and booking marketplace for South India. It has three
audiences, each with its own interface:

| Role       | How they get the role                                   | Main interface         |
|------------|---------------------------------------------------------|------------------------|
| Visitor    | Anyone, no account                                      | Public website         |
| Customer   | Self sign-up                                            | Public website + "My trips" |
| Owner      | Self sign-up as owner (`/owners/register`)              | Owner dashboard        |
| Admin      | **Only** via a CLI script run by the operator (never through the API) | Admin dashboard |

A single user document has exactly one role. An owner who also wants to travel uses a
separate customer account (keeps authorization simple and auditable — documented limitation).

## 2. Functional requirements (MVP = must ship)

Each requirement has an ID so tests and the checklist can reference it.

### Discovery (visitors)
- **D1** Browse destinations grouped by state, region, and type (hill, beach, forest, backwater, heritage, lake).
- **D2** Search resorts by destination/town/resort name with check-in, check-out, rooms, adults, children.
- **D3** Filter by price (per night or total stay), rating, category, property type, amenities, surroundings, distance from destination centre, and "available for my dates".
- **D4** Sort: recommended, price ↑, price ↓, rating, most reviewed.
- **D5** All search state lives in URL query parameters (shareable, back-button safe).
- **D6** Show "from ₹X/night" (starting price) when no dates are selected; show the real price for the dates when they are.
- **D7** Resort details page: gallery, description, amenities, room types, policies, reviews, nearby attractions, map, enquiry form.
- **D8** Clearly state whether taxes, meals, and extra charges are included in a displayed price.

### Accounts (customers)
- **A1** Sign up, log in, log out, refresh session silently.
- **A2** Forgot / reset password using single-use, expiring tokens.
- **A3** Email verification (works with console email in development, real provider in production).
- **A4** Profile and preferences (name, phone, preferred destinations).
- **A5** Favourites (save/unsave resorts).

### Booking
- **B1** Get a price quote for room type + dates + guests (backend-calculated, itemized).
- **B2** Create a booking, which reserves inventory for a limited time (hold, 15 min).
- **B3** Confirm the booking via payment (simulated in dev, Razorpay test mode later).
- **B4** No overbooking under concurrent requests; idempotent submission.
- **B5** Booking history, booking details, cancellation with policy-based refund calculation.
- **B6** Booking stores a snapshot of price, taxes, guests, and cancellation policy.
- **B7** **No login before booking.** A visitor reserves straight from the resort page; at checkout their four details create a customer account (`POST /auth/checkout-signup`) and sign them in. An email that already has an account must log in with its password (409 `ACCOUNT_EXISTS`) — an email alone never signs anyone in. New accounts are passwordless and get a 7-day “set your password” link, which also verifies the email. Email verification before booking can be re-enabled with `REQUIRE_EMAIL_VERIFICATION=true`.
- **B8** Lead-guest details are exactly **first name, last name, email and mobile number** (special requests optional; child ages required when children are included). After a successful payment the confirmation goes to that email **and** an SMS to that mobile number. **ID numbers (Aadhaar, passport) are never collected online**; guests show a valid photo ID at check-in.

### Reviews
- **R1** Customer can review a resort once per completed booking.
- **R2** Overall rating plus optional sub-ratings (cleanliness, location, service, facilities).
- **R3** Anyone logged in can report a review; admins moderate.
- **R4** Resort rating aggregates are computed only from published reviews.
- **R5** Owner may post one public reply per review.

### Owner portal
- **O1** Owner registration and profile.
- **O2** Create resort (draft) → submit for review → admin approves → published.
- **O3** Manage room types (occupancy, beds, photos, units, base/weekend rates).
- **O4** Seasonal and date-specific pricing; block dates.
- **O5** View and act on own bookings only (confirm/reject when the resort uses manual confirmation, cancel per rules).
- **O6** Dashboard metrics: upcoming arrivals, occupancy %, revenue estimate.
- **O7** Edit policies and photos; archive a resort.

### Admin portal
- **M1** Approve / reject / unpublish / suspend resorts (with reason).
- **M2** Manage users (suspend, reactivate), view owners.
- **M3** Manage destinations and categories (data-driven, no frontend change needed).
- **M4** Moderate reviews and reports.
- **M5** View bookings and payment statuses.
- **M6** Platform settings: tax slabs, service fee, hold duration, cancellation policy templates.
- **M7** Audit log viewer.
- **M8** Basic metrics (bookings, GMV, new users, pending approvals).

### Payments (Phase 10)
- **P1** Development "simulated payment" mode, visibly labelled.
- **P2** Razorpay test mode: server-created order, signature verification, webhooks.
- **P3** Refunds recorded only when the provider confirms them.

## 3. Non-functional requirements

| Area           | Requirement |
|----------------|-------------|
| Security       | Argon2id password hashing; JWT access tokens (15 min); rotating refresh tokens in httpOnly cookies; RBAC + ownership checks on the server; rate limiting on auth endpoints; no secrets in the repo. |
| Correctness    | Money stored as **integer paise** (₹1 = 100 paise) — never floats. Dates stored as `YYYY-MM-DD` strings for nights (no timezone bugs). Check-out exclusive. |
| Performance    | Search p95 < 500 ms at portfolio scale (~1k resorts). Paginated lists (max 50/page). |
| Accessibility  | WCAG 2.1 AA contrast, keyboard navigation, visible focus, alt text, form labels. |
| Reliability    | Graceful image fallbacks; consistent JSON error format; health check endpoint. |
| Privacy        | Owners see guest name/phone/email only for bookings at their own resorts; admins see all; data minimisation in logs. |
| Observability  | Structured request logs with request ID; no stack traces returned in production. |
| Timezone       | All business dates use **Asia/Kolkata (IST)**. "Today" for date validation is computed in IST. |

## 4. Honesty rules for data (non-negotiable)

- All seeded resorts, owners, reviews, and ratings are **fictional** and marked `is_sample: true`.
- The UI shows a visible "Sample property — not a real business" badge on sample resorts.
- Seed reviews are labelled "Sample review" in the UI.
- Destination descriptions are general travel information, not claims about specific businesses.
- No fake discounts ("was ₹9,000, now ₹5,000") unless a real coupon rule produces them.
- Simulated payments are labelled "Simulated — no money was charged".

## 5. Explicitly out of scope (documented limitations)

- Multi-currency (INR only) and multi-language.
- Channel-manager sync with OTAs (Booking.com, MakeMyTrip).
- Real-time chat between guest and owner (we provide an enquiry form instead).
- Multiple staff accounts per resort (designed for, via `resorts.manager_ids`, but not built in MVP).
- Native mobile apps.
- Invoicing/GST e-invoices. Tax rates are configurable; the seeded rates must be verified with a tax professional before real use.

## 6. Assumptions

- One booking = one resort + one room type + N identical rooms. (Multi-room-type carts are a later enhancement.)
- Guests are distributed across rooms evenly; occupancy is validated per room (`ceil(adults / rooms) <= max_adults`, etc.).
- Children under 5 are free and do not count toward occupancy (configurable per resort: `child_free_age`).
- A booking is "completed" the day after check-out unless cancelled.
- Default hold duration is 15 minutes (platform setting).
- Lead-guest age is stored as given at booking time (not date of birth), to minimise personal data.
- Resorts confirm bookings instantly by default; each resort can switch to `request` mode (owner approval).
