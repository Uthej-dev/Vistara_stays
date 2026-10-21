# 09 — Testing & Security

## 1. Test suites

| Suite | What it covers | Command | Result (2026-10-18) |
|---|---|---|---|
| Backend (pytest + HTTPX, real MongoDB replica set) | API behaviour, booking engine, permissions, pricing, payments | `cd backend && ./scripts/test_mongo.sh start && pytest` | **222 passed**, 92% line coverage (`pytest --cov=app`) |
| Frontend (Vitest + React Testing Library) | Components, forms, routing, guards, API client | `cd frontend && npm test` | **79 passed** (`npm run coverage` for the report) |
| Browser E2E (Puppeteer + your Chrome) | 9 full user journeys against the running app | `cd e2e && npm install && ADMIN_PASSWORD=… npm test` | **9/9 passed** |
| Lint | Ruff (Python), ESLint + jsx-a11y + React hooks rules | `ruff check .` · `npm run lint` | clean |
| Dependency audit | Known vulnerabilities in pinned dependencies | `pip-audit -r requirements.txt` · `npm audit` | none found |

After the E2E run, remove the test listings it created: `cd backend && python -m scripts.cleanup_e2e`.

### Tests that prove the hard parts

| Requirement | Test |
|---|---|
| No overbooking under concurrency | `test_twenty_customers_racing_for_the_last_room` — 20 parallel bookings for 1 unit → exactly 1 succeeds. **Mutation-checked**: with the guard removed, 11/20 oversell. |
| Multi-night stays are all-or-nothing | `test_overlapping_multi_night_stays_never_oversell` + inventory reconciliation after every concurrency test |
| Duplicate submissions | `test_retrying_with_the_same_key_returns_the_same_booking`, `test_double_click_storm_creates_one_booking` |
| Prices only from the server | `test_quote_ignores_client_supplied_prices`, `test_client_supplied_totals_are_rejected` |
| Check-out exclusive, taxes, rounding | `tests/test_pricing.py` (27 unit tests incl. GST slab boundary at exactly ₹7,500) |
| Holds expire and release rooms | `test_expired_hold_releases_rooms_and_blocks_payment`, `test_new_booking_attempt_releases_stale_holds_first` |
| Cancellation uses the booked policy | `test_cancellation_refund_follows_the_booked_policy` (policy changed after booking has no effect) |
| Payments can't be faked | `test_verified_payment_confirms_and_forged_signature_does_not` (**mutation-checked**), webhook signature + replay tests |
| Owners isolated from each other | `test_owners_cannot_touch_each_others_data` (8 attack attempts → all 404) |
| Role matrix | owner/admin/customer route tests in `test_owner.py`, `test_reviews_admin.py`, `test_favourites.py` |
| Review eligibility | completed stays only, once per booking, not your own booking |
| Token security | expired, tampered, `alg=none`, wrong-key, role-claim-ignored, token-version revocation, refresh reuse detection |

## 2. Manual end-to-end checklist

Run with both dev servers up and seed data loaded. Sample password: `Vistara#Demo2026`.

**Visitor (no account)**
- [ ] Home page loads with photos; turning the network off shows designed image fallbacks, not broken icons.
- [ ] Search “Coorg” with dates → results show totals “incl. taxes & fees”; without dates they show “from ₹… / night · excl. taxes”.
- [ ] Apply amenity + rating filters → URL updates, chips appear, “Clear all” works, back button restores state.
- [ ] Open a resort → gallery opens full-screen (arrow keys, Esc), map shows, policies and reviews are visible.
- [ ] Click “Reserve” → sent to login, then back to checkout with the same dates.

**Customer** (`demo.customer@example.com`)
- [ ] Sign up a new account → verification link appears in the backend log → open it → “Email verified”.
- [ ] Unverified account cannot book (checkout shows the verify notice; API returns `EMAIL_NOT_VERIFIED`).
- [ ] Book a stay: guest details (18+, phone, nationality) → hold countdown → simulated payment → trip shows “Confirmed”, address revealed, “Simulated payment” label.
- [ ] Cancel → refund preview matches the policy saved with the booking → status “Cancelled”.
- [ ] Save/unsave favourites; reload keeps you signed in; “Log out on all devices” signs out everywhere.
- [ ] Past stay → “Write a review” → review appears on the resort page; rating summary updates.

**Owner** (`owner.westernghats@example.com`)
- [ ] Dashboard KPIs load; create a property; upload 3 photos (a renamed .txt file is rejected).
- [ ] Submit with missing parts → clear “Still needed: …” message; complete it → “Pending review”.
- [ ] Calendar: set a special price and block a room for a range; a block on a fully booked night is reported as a conflict.
- [ ] Reservations list shows only your bookings; guest contact hidden for stays more than 30 days away.
- [ ] Reply to a review; close an enquiry.

**Admin** (create with `python -m scripts.create_admin`)
- [ ] Approve the pending listing → it appears in public search; reject requires a reason that the owner sees.
- [ ] Suspend a user → their open session stops working immediately; reactivate.
- [ ] Hide a reported review → the resort’s rating recalculates; restore it.
- [ ] Add a destination → it appears on /destinations without a frontend change.
- [ ] Change the service fee → new quotes change, existing bookings keep their totals; the audit log shows before/after.

**Access control**
- [ ] Customer visiting /owner or /admin sees “You don’t have access”; the API returns 403.
- [ ] Owner opening another owner’s resort/booking URL gets “not found” (404), not their data.

## 3. Security checklist (spec §16)

| Requirement | Implementation |
|---|---|
| Request validation | Pydantic models on every input; unknown fields rejected (`extra="forbid"`) — blocks mass assignment of `role`, `owner_id`, `status`, totals. |
| Password hashing | Argon2id via pwdlib, automatic re-hash on login if parameters change; timing-equalised for unknown emails. |
| Authentication | 15-min JWT access tokens in memory; rotating refresh tokens (hashed in DB) in httpOnly `SameSite=Lax` cookies scoped to `/api/v1/auth`; reuse detection; `token_version` for instant revocation. |
| Role-based authorization | Role read from the database on every request (never from the token or body); `require_role` dependencies; admin only via CLI script. |
| Ownership checks | `owner_id` is part of every owner query; others’ data returns 404. |
| Rate limiting | Signup, login (+ per-email lockout), refresh, password reset, enquiries, quotes, bookings, uploads, reviews. In-memory (single instance) — Redis needed if scaled out. |
| CORS | Explicit origin allow-list; credentials only for allowed origins; `*` refused in production. |
| CSRF | Cookie endpoints require `X-Requested-With` + allowed `Origin`. |
| Secrets | Environment variables only; `.env` git-ignored; production refuses weak `JWT_SECRET` or insecure cookies. |
| NoSQL injection | Typed values only reach queries; operator objects in JSON fail validation (tested); user text in `$regex` is escaped. |
| Image uploads | Type detected from file content (JPEG/PNG/WebP only — SVG/HTML rejected), 5 MB cap, global body-size limit, owner/admin only, stored image URLs restricted to our own storage. |
| Payment webhooks | HMAC-SHA256 on the raw body with constant-time comparison; events de-duplicated; never “paid” from a redirect. |
| Input sanitisation / XSS | React escapes all rendered text; no `dangerouslySetInnerHTML`; API sends `X-Content-Type-Options: nosniff` and a `default-src 'none'` CSP on JSON. |
| Audit logging | Admin decisions, suspensions, owner/admin cancellations, calendar changes, settings changes (before/after). |
| Safe errors | Generic 500 body with a request id; stack traces only in server logs (tested with a secret-bearing exception). |
| Guest privacy | Lead-guest contact visible to owners only from 30 days before to 90 days after the stay; no ID numbers collected; public review names shortened (“Asha R.”); street address shown only after confirmation. |
| Retention & deletion | Account deletion anonymises the user (bookings kept for accounting); sessions/tokens expire via TTL indexes; notifications TTL 180 days; webhook events TTL 30 days. |
| Logging hygiene | No passwords/tokens logged; console email bodies (which contain reset links) are hidden in production. |

## 4. Known limitations (honest list)

- Rate limits and the email “outbox” live in process memory: correct for one server instance, not for several.
- Search with dates prices candidates in Python (fine for hundreds of resorts; Atlas Search + precomputed availability would be the next step at scale).
- Coupons are restored when an unpaid hold expires, but not when a paid booking is later cancelled.
- If a payment arrives after its hold expired and the room is re-reserved, a coupon released at expiry is not re-applied (the guest still pays the originally quoted, discounted total).
- Multi-room-type bookings (e.g. 1 villa + 1 cottage in one checkout) are not supported.
- Tax slabs reflect our understanding of GST rules as of September 2025 and must be verified by a tax professional before any real use.
- Live Razorpay, Cloudinary and Resend need your accounts; their code paths are tested against fakes.
