# 07 — Phase Roadmap & Exit Criteria

A phase is **done** only when its exit criteria pass. Status is updated at the end of each phase.

| # | Phase | Exit criteria (verified, not assumed) | Status |
|---|---|---|---|
| 1 | Requirements, architecture, data model, API spec | Docs 01–06 reviewed and open decisions answered | ✅ Done (2026-10-17) |
| 2 | Repo + scaffolding + DB + health | `git init`; backend runs; `GET /api/v1/health` 200; `/health/ready` 200 against Atlas; indexes created; frontend runs and calls health through the Vite proxy; pytest + vitest each pass one smoke test; `.env` ignored by git | ✅ Done (2026-10-17) |
| 3 | Landing page (static sample data) | All 9 landing sections; responsive at 375 / 768 / 1280 px; keyboard-navigable; image fallbacks work with network images blocked; Lighthouse accessibility ≥ 90 | ✅ Done (2026-10-17) — Lighthouse: accessibility 100, performance 90, SEO 92 |
| 4 | Models, destinations, resorts, search | Seed script idempotent; search filters/sort/pagination via URL work; search tests pass; landing page switched to real API | ✅ Done (2026-10-17). Photo hosting moves to Cloudinary with the upload pipeline in Phase 8 (needs your Cloudinary account) |
| 5 | Auth, profiles, favourites, RBAC | Signup/login/refresh/logout/reset tests; role tests (403/404 matrix); refresh rotation + reuse detection test | ✅ Done (2026-10-18) — 69 backend + 59 frontend tests; real-browser login/refresh/logout verified |
| 6 | Resort details, rooms, pricing, availability | Details page complete; pricing unit tests (weekend, season, override, extra guests, tax slabs, rounding); availability endpoint tests | ✅ Done (2026-10-18) — 27 pricing unit + 18 availability tests; price breakdown verified by hand in the browser |
| 7 | Bookings, inventory protection, cancellations | Concurrency test (20 parallel → exactly 1 success); idempotency test; expiry release test; cancellation refund tests; reconciliation check passes | ✅ Done (2026-10-18) — 28 booking tests incl. 20-way race (mutation-checked: without the guard 11/20 oversell); full journey verified in Chrome |
| 8 | Owner dashboard + approval workflow | Owner can onboard a resort end-to-end; ownership isolation tests; calendar/blocking tests | ✅ Done (2026-10-18) — 26 owner tests + 10 image tests; full onboarding → admin approval → public page verified in Chrome. Cloudinary storage + migration script ready; needs your Cloudinary account to switch on |
| 9 | Admin dashboard, reviews, moderation | Review eligibility + duplicate tests; moderation recomputes ratings; audit log entries for every admin mutation | ✅ Done (2026-10-18) — 25 review/admin tests; review + 8 admin pages verified in Chrome; 170 labelled sample reviews seeded deterministically |
| 10 | Payments (simulated → Razorpay test), notifications | Signature verification tests with known vectors; webhook idempotency; no "paid" from redirect alone | ✅ Done (2026-10-18) — 10 Razorpay tests against a fake Razorpay API (mutation-checked); live test mode needs your Razorpay test keys |
| 11 | Full test pass, security review, E2E checklist | All suites green; coverage report; manual checklist signed off; security checklist | ✅ Done (2026-10-18) — 222 backend (92% coverage) + 79 frontend tests, 9/9 browser journeys, lint clean, 0 known vulnerabilities; see docs/09 |
| 12 | Deployment + README | Live URLs; production CORS/cookies verified; README with screenshots & limitations | ⏳ |

## Decisions (2026-10-17)

1. **Database:** existing MongoDB Atlas free (M0) cluster.
2. **Email verification:** **required before booking** (B7), plus mandatory lead-guest details (B8).
3. **Booking mode:** instant confirmation by default; `request` mode per resort.
4. **Name:** Vistara Stays.
5. **GitHub:** private repository.
