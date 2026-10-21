# 02 — Architecture

> How the pieces fit together, why each technology was chosen, and where every kind of code lives.

## 1. System overview

```
                       ┌────────────────────────────────────────────┐
  Browser              │  Vercel                                     │
  (React SPA) ───────▶ │  • serves the built React app (static)      │
                       │  • rewrites /api/*  ─────────────┐          │
                       └──────────────────────────────────┼──────────┘
                                                          ▼
                       ┌────────────────────────────────────────────┐
                       │  Render — FastAPI (Uvicorn)                 │
                       │  routes → services → repositories           │
                       └───────┬──────────────┬──────────────┬──────┘
                               │              │              │
                               ▼              ▼              ▼
                     MongoDB Atlas      Cloudinary       Razorpay (test)
                     (replica set,      (images,         Email provider
                      transactions)      signed upload)   (Resend / SMTP)
```

**Why the Vercel rewrite?** The browser talks to `https://vistara.vercel.app/api/...`, and Vercel
forwards it to Render. To the browser, the API is on the *same site* as the frontend, so the
refresh-token cookie can be `SameSite=Lax` and is not treated as a third-party cookie (which
modern browsers increasingly block). In local development, Vite's dev-server proxy does the same job.

## 2. Technology choices

| Concern | Choice | Reason |
|---|---|---|
| API framework | **FastAPI** | Async, Pydantic validation, automatic OpenAPI docs at `/docs`. |
| Mongo driver | **PyMongo async API (`AsyncMongoClient`)** | Official async driver. Motor (the old async driver) is deprecated in favour of this. One consistent async style throughout. |
| Validation | **Pydantic v2** + `pydantic-settings` | Schemas for requests/responses; typed config from env vars. |
| Password hashing | **Argon2id** via `pwdlib[argon2]` | Modern memory-hard algorithm; library recommended in current FastAPI docs. |
| JWT | **PyJWT** | Small, maintained, HS256 signing. |
| Rate limiting | **slowapi** | Simple decorator-based limits. In-memory store (fine for one Render instance; Redis needed if scaled out — documented limitation). |
| Images | **Cloudinary** (signed direct upload) | Free tier, on-the-fly resizing (`w_800,f_auto,q_auto`), no binaries in MongoDB. |
| Email | Console backend (dev) / **Resend** (prod) | Swappable via `EMAIL_BACKEND` env var. |
| Payments | **Razorpay** test mode (Phase 10) | India-focused, good test mode, webhook signatures. |
| Frontend | **React + Vite**, React Router, Tailwind CSS, Lucide icons | Requested stack. |
| Server state | **TanStack Query** | Caching, loading/error states, retries, invalidation after mutations. |
| Forms | **React Hook Form + Zod** | Performant forms; schema validation mirrors backend rules. |
| HTTP | **Axios** with interceptors | Attaches access token, transparently refreshes on 401 once. |
| Tests | Pytest + HTTPX `AsyncClient`; Vitest + React Testing Library | Requested stack. |

Exact pinned versions are chosen and verified in Phase 2.

## 3. Backend layering

Every request flows top-to-bottom; lower layers never import upper layers.

```
api/routes/*.py      HTTP only: parse request, call a service, shape response, status codes
      │               (no database calls, no business rules)
api/deps.py          Dependencies: get_db, get_current_user, require_role("owner"), pagination
      │
services/*.py        Business rules: pricing, availability, booking state machine,
      │               ownership checks, review eligibility. Raises domain errors.
repositories/*.py    Database access only: build queries, run them, map documents.
      │               The ONLY place that touches collections.
db/mongodb.py        Client lifecycle (opened on app startup, closed on shutdown)
db/indexes.py        Idempotent index creation, run at startup and by a script
```

Domain errors (e.g. `RoomUnavailableError`, `PermissionDeniedError`) are raised in services and
converted to HTTP responses by one exception handler in `main.py`. This keeps HTTP concerns out of
business logic and makes services easy to unit-test.

## 4. Backend folder structure

```
backend/
  app/
    main.py                  # create_app(): middleware, routers, exception handlers, lifespan
    core/
      config.py              # Settings (pydantic-settings) — reads .env
      security.py            # hash/verify password, create/decode JWT, token hashing
      errors.py              # domain exception classes + error codes
      logging.py             # structured logging + request-id middleware
      rate_limit.py          # slowapi limiter instance
    db/
      mongodb.py             # AsyncMongoClient setup, get_database()
      indexes.py             # ensure_indexes()
    schemas/                 # Pydantic request/response models (API contract)
      common.py              # ObjectId type, Page[T], Money, ErrorResponse
      auth.py  users.py  destinations.py  resorts.py  rooms.py
      pricing.py  bookings.py  reviews.py  owner.py  admin.py  payments.py
    models/                  # Internal document shapes (what is stored), enums
      enums.py               # Role, BookingStatus, ResortStatus, ...
    repositories/
      users.py  sessions.py  destinations.py  resorts.py  room_types.py
      rate_rules.py  inventory.py  bookings.py  reviews.py  favourites.py
      coupons.py  payments.py  audit_logs.py  settings.py
    services/
      auth_service.py        # signup, login, refresh rotation, password reset
      search_service.py      # search pipeline construction
      pricing_service.py     # nightly rate resolution, taxes, fees, coupons
      availability_service.py
      booking_service.py     # hold, confirm, cancel, expire — the critical module
      review_service.py
      owner_service.py
      admin_service.py
      payment_service.py     # simulated + Razorpay providers behind one interface
      email_service.py
      image_service.py       # Cloudinary signature generation
      audit_service.py
    api/
      deps.py
      routes/
        health.py auth.py users.py destinations.py resorts.py bookings.py
        reviews.py favourites.py owner.py admin.py payments.py uploads.py
    utils/
      dates.py               # IST "today", night iteration, weekend detection
      money.py               # paise helpers, rounding rules
      slugs.py
  scripts/
    seed.py                  # fictional sample data (idempotent; --reset flag)
    create_admin.py          # the ONLY way to create an admin
    ensure_indexes.py
  tests/
    conftest.py              # test DB, client, factories, auth helpers
    unit/                    # pricing, dates, state machine (no DB)
    integration/             # API tests against a real MongoDB replica set
  requirements.txt
  requirements-dev.txt
  .env.example
  pyproject.toml             # pytest + ruff config
```

`models/` vs `schemas/`: a **schema** is what crosses the API boundary (e.g. `UserPublic` has no
`password_hash`); a **model** describes what is stored. Keeping them separate prevents accidentally
leaking internal fields in responses.

## 5. Frontend folder structure

```
frontend/
  src/
    main.jsx                 # React root, QueryClientProvider, RouterProvider
    App.jsx
    api/
      client.js              # Axios instance, token attach + refresh interceptor
      auth.js destinations.js resorts.js bookings.js reviews.js owner.js admin.js
    assets/                  # logo, fallback images
    components/
      ui/                    # Button, Input, Select, Badge, Modal, Skeleton, Toast, EmptyState, ErrorState
      layout/                # Navbar, Footer, Container
      resort/                # ResortCard, RatingStars, RatingBreakdown, AmenityList, ImageGallery, PriceTag
      booking/               # DateRangePicker, GuestSelector, PriceBreakdown, RoomSelector
    features/
      auth/                  # LoginForm, SignupForm, useAuth, AuthProvider, RequireRole
      search/                # SearchWidget, FilterPanel, SortSelect, AppliedFilters, useSearchParamsState
      resorts/               # ResortDetails sections
      bookings/              # Checkout, BookingDetails, CancelDialog
      favourites/
      reviews/
      owner/                 # owner dashboard screens + forms
      admin/                 # admin dashboard screens
    layouts/
      PublicLayout.jsx  OwnerLayout.jsx  AdminLayout.jsx
    pages/                   # thin route-level components that compose features
    routes/
      router.jsx             # route table, lazy-loaded owner/admin bundles
    hooks/                   # useDebounce, useMediaQuery, ...
    utils/                   # formatINR, formatDate, nights(), cn()
    test/                    # Vitest setup
  index.html
  vite.config.js             # dev proxy /api -> http://localhost:8000
  tailwind config / postcss
  package.json
  .env.example
  vercel.json                # rewrites /api/* -> Render URL
```

## 6. Authentication design

| Token | Lifetime | Where it lives | Why |
|---|---|---|---|
| Access token (JWT, HS256) | 15 min | JavaScript **memory only** (not localStorage) | XSS cannot steal it from storage; short life limits damage. |
| Refresh token (random 256-bit string) | 14 days | `httpOnly; Secure; SameSite=Lax; Path=/api/auth` cookie. **SHA-256 hash** stored in `sessions` collection. | JS cannot read it. A database leak does not expose usable tokens. |

- **Rotation:** every `/auth/refresh` call issues a new refresh token and revokes the old one.
- **Reuse detection:** if a revoked refresh token is presented again, every session in that token family is revoked (sign of theft).
- **Logout:** revokes the session server-side and clears the cookie. Access tokens die within 15 min.
- **Immediate revocation:** the JWT carries `ver` (the user's `token_version`). Suspending a user or resetting their password increments it, so all of that user's access tokens fail on the next request.
- **CSRF:** the only cookie-authenticated endpoints are `/auth/refresh` and `/auth/logout`. They require `SameSite=Lax`, an allowed `Origin` header, and a custom `X-Requested-With` header (not sendable cross-site without CORS preflight).
- **Role is never trusted from the client.** The role is read from the database on each request via `get_current_user` (one indexed lookup by `_id`).
- **Password reset / email verification:** 32-byte random token emailed to the user; only its hash is stored, with `expires_at` (30 min / 24 h) and `used_at`. A TTL index removes old tokens.

## 7. Authorization (RBAC + ownership)

```python
# Pattern used on every owner route (illustrative)
@router.patch("/owner/resorts/{resort_id}")
async def update_resort(resort_id: ObjectIdStr, body: ResortUpdate,
                        owner = Depends(require_role(Role.OWNER)),
                        svc: OwnerService = Depends()):
    return await svc.update_resort(owner, resort_id, body)

# In the service: ownership is part of the query, not a separate check
resort = await resorts_repo.find_one({"_id": resort_id, "owner_id": owner.id})
if resort is None:
    raise NotFoundError()   # 404, not 403 — don't reveal that the resort exists
```

Putting `owner_id` **in the query itself** means it is impossible to forget the check and then
operate on someone else's document.

## 8. Cross-cutting conventions

- **IDs**: MongoDB `ObjectId`, serialized as 24-char hex strings. Invalid IDs → 422, never a 500.
- **Money**: integers in paise. API responses include both `amount_paise` and a pre-formatted `display` string only where useful; the frontend formats with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`.
- **Dates**: nights are `YYYY-MM-DD` strings; timestamps are UTC `datetime` stored as BSON dates and returned in ISO-8601.
- **Pagination**: `?page=1&page_size=20` (max 50) → `{items, page, page_size, total, total_pages}`.
- **Errors**: always `{"error": {"code": "ROOM_UNAVAILABLE", "message": "...", "details": {...}}}`.
- **NoSQL-injection protection**: request bodies are Pydantic models with typed fields, so a value like `{"$gt": ""}` fails validation; query filters are built in repositories from typed values only, never by passing raw request JSON into `find()`. Sort fields come from an allow-list.
- **Logging**: one JSON line per request (`request_id`, method, path, status, duration, user_id). Never log passwords, tokens, or full guest contact details.
- **Background work**: Render's free tier sleeps, so we cannot rely on cron. Expired holds are released **lazily** (just before any reservation touching the same room type) and by a periodic in-process task when the server is awake. Booking completion is also applied lazily on read. See [06-booking-engine.md](06-booking-engine.md).

## 9. Environments

| Env | Frontend | API | Database |
|---|---|---|---|
| Local dev | Vite :5173 (proxy `/api` → :8000) | Uvicorn :8000 `--reload` | Atlas cluster, db `vistara_dev` |
| Tests | Vitest (jsdom) | HTTPX in-process | **Local `mongod` as single-node replica set**, db `vistara_test` (transactions need a replica set) |
| Production | Vercel | Render web service | Atlas cluster, db `vistara_prod`, separate DB user |

Key environment variables (full list with explanations in `.env.example`, Phase 2):
`APP_ENV`, `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`, `ACCESS_TOKEN_TTL_MIN`,
`REFRESH_TOKEN_TTL_DAYS`, `CORS_ORIGINS`, `FRONTEND_URL`, `COOKIE_SECURE`, `EMAIL_BACKEND`,
`RESEND_API_KEY`, `CLOUDINARY_*`, `PAYMENT_PROVIDER` (`simulated` | `razorpay`), `RAZORPAY_*`.
