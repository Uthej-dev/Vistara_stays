# 10 — API Reference (generated)

Generated from the running application by `python -m scripts.export_api_reference` — do not edit by hand.
Interactive documentation with request/response schemas: `/api/docs` on any running API.
Error format, pagination and money conventions: see [05-api-spec.md](05-api-spec.md).

## Account

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/favourites` | customer | list favourites |
| GET | `/api/v1/favourites/ids` | customer | Just the ids — lets the UI show filled hearts without loading every card. |
| DELETE | `/api/v1/favourites/{resort_id}` | customer | remove favourite |
| PUT | `/api/v1/favourites/{resort_id}` | customer | add favourite |
| DELETE | `/api/v1/users/me` | any signed-in user | delete me |
| GET | `/api/v1/users/me` | any signed-in user | me |
| PATCH | `/api/v1/users/me` | any signed-in user | Update name, phone, preferences (and owner profile for owners). Email and role are not editable here. |
| GET | `/api/v1/users/me/sessions` | any signed-in user | my sessions |

## Admin

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/admin/audit-logs` | admin | audit logs |
| GET | `/api/v1/admin/bookings` | admin | bookings |
| GET | `/api/v1/admin/bookings/{booking_id}` | admin | booking |
| POST | `/api/v1/admin/bookings/{booking_id}/cancel` | admin | Admin cancellations refund the guest in full and are audited. |
| POST | `/api/v1/admin/categories` | admin | create category |
| PATCH | `/api/v1/admin/categories/{category_id}` | admin | update category |
| GET | `/api/v1/admin/coupons` | admin | coupons |
| POST | `/api/v1/admin/coupons` | admin | create coupon |
| PUT | `/api/v1/admin/coupons/{coupon_id}` | admin | update coupon |
| GET | `/api/v1/admin/destinations` | admin | destinations |
| POST | `/api/v1/admin/destinations` | admin | New destinations appear on the site immediately — no frontend change needed. |
| PATCH | `/api/v1/admin/destinations/{destination_id}` | admin | update destination |
| GET | `/api/v1/admin/metrics` | admin | metrics |
| GET | `/api/v1/admin/reports` | admin | reports |
| POST | `/api/v1/admin/reports/{report_id}/dismiss` | admin | dismiss report |
| GET | `/api/v1/admin/resorts` | admin | list resorts |
| GET | `/api/v1/admin/resorts/{resort_id}` | admin | get resort |
| POST | `/api/v1/admin/resorts/{resort_id}/{action}` | admin | approve / unsuspend need no reason; reject / suspend require one (shown to the owner). |
| GET | `/api/v1/admin/reviews` | admin | reviews |
| POST | `/api/v1/admin/reviews/{review_id}/{action}` | admin | hide/remove need a reason; the resort's rating is recalculated. |
| GET | `/api/v1/admin/settings` | admin | get settings |
| PATCH | `/api/v1/admin/settings` | admin | Tax slabs, service fee, hold length and booking limits. Changes are audited with before/after values and apply to new quotes only (existing bookings keep their snapshot). |
| GET | `/api/v1/admin/users` | admin | users |
| POST | `/api/v1/admin/users/{user_id}/{action}` | admin | Suspending signs the user out everywhere immediately. |

## Auth

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/change-password` | any signed-in user | Change password; signs out other devices but keeps this one signed in. |
| POST | `/api/v1/auth/forgot-password` | public | Always 202, whether or not the email has an account. |
| POST | `/api/v1/auth/login` | public | login |
| POST | `/api/v1/auth/logout` | refresh cookie + same-site headers | logout |
| POST | `/api/v1/auth/logout-all` | any signed-in user | Sign out on every device. |
| POST | `/api/v1/auth/refresh` | refresh cookie + same-site headers | Exchange the refresh cookie for a new access token (and a rotated cookie). |
| POST | `/api/v1/auth/resend-verification` | any signed-in user | resend verification |
| POST | `/api/v1/auth/reset-password` | public | reset password |
| POST | `/api/v1/auth/signup` | public | Create a customer or owner account and sign in. A verification email is sent. |
| POST | `/api/v1/auth/verify-email` | public | verify email |

## Availability

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/bookings/quote` | public (personalised if signed in) | Price a stay without reserving anything. The booking endpoint recalculates this on its own — totals sent by the browser are never trusted. |
| GET | `/api/v1/resorts/{resort_id}/availability` | public | Availability and full price for every room type at a resort for the given stay. |
| POST | `/api/v1/resorts/{resort_id}/enquiries` | public (personalised if signed in) | Send a question to the property. The owner sees it in their dashboard. |

## Bookings

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/bookings` | customer | my bookings |
| POST | `/api/v1/bookings` | customer | Hold the room(s) and create a booking awaiting payment. The price is recalculated here — nothing price-related is accepted from the browser. |
| GET | `/api/v1/bookings/{booking_id}` | customer | get booking |
| POST | `/api/v1/bookings/{booking_id}/cancel` | customer | cancel booking |
| GET | `/api/v1/payments/config` | public | Which payment flow the checkout page should show. Only the public Razorpay key id is ever exposed; the secret stays on the server. |
| POST | `/api/v1/payments/simulated/{booking_id}/fail` | customer | DEVELOPMENT ONLY. A failed payment releases the held rooms immediately. |
| POST | `/api/v1/payments/simulated/{booking_id}/succeed` | customer | DEVELOPMENT ONLY. Marks the booking as paid without moving any money. Clearly labelled as simulated everywhere it's shown. |

## Catalogue

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/categories` | public | Categories, amenities and surroundings — the data behind filter lists. |
| GET | `/api/v1/destinations` | public | All active destinations, ordered by featured rank then name. |
| GET | `/api/v1/destinations/{slug}` | public | get destination |
| GET | `/api/v1/resorts/featured` | public | featured resorts |
| GET | `/api/v1/resorts/search` | public | Search published resorts. See docs/05-api-spec.md for every parameter. |
| GET | `/api/v1/resorts/{slug}` | public (personalised if signed in) | get resort |

## Health

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | public | liveness |
| GET | `/api/v1/health/ready` | public | readiness |

## Notifications

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/notifications` | any signed-in user | list notifications |
| POST | `/api/v1/notifications/read-all` | any signed-in user | mark all read |
| POST | `/api/v1/notifications/{notification_id}/read` | any signed-in user | mark read |

## Owner

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/owner/bookings` | owner | list bookings |
| GET | `/api/v1/owner/bookings/{booking_id}` | owner | get booking |
| POST | `/api/v1/owner/bookings/{booking_id}/cancel` | owner | Owner-initiated cancellations always refund the guest in full and are audited. |
| POST | `/api/v1/owner/bookings/{booking_id}/confirm` | owner | confirm booking |
| POST | `/api/v1/owner/bookings/{booking_id}/no-show` | owner | no show |
| POST | `/api/v1/owner/bookings/{booking_id}/reject` | owner | reject booking |
| GET | `/api/v1/owner/dashboard` | owner | Upcoming arrivals, 30-day occupancy, revenue this month, pending actions. |
| GET | `/api/v1/owner/enquiries` | owner | enquiries |
| PATCH | `/api/v1/owner/enquiries/{enquiry_id}` | owner | update enquiry |
| DELETE | `/api/v1/owner/rate-rules/{rule_id}` | owner | delete rule |
| PUT | `/api/v1/owner/rate-rules/{rule_id}` | owner | update rule |
| GET | `/api/v1/owner/resorts` | owner | my resorts |
| POST | `/api/v1/owner/resorts` | owner | Start a draft listing. It stays private until an admin approves it. |
| GET | `/api/v1/owner/resorts/{resort_id}` | owner | get resort |
| PATCH | `/api/v1/owner/resorts/{resort_id}` | owner | Edit any part of a listing. Changing name/destination/address/location/type of a live listing sends it back for review. |
| POST | `/api/v1/owner/resorts/{resort_id}/archive` | owner | archive resort |
| GET | `/api/v1/owner/resorts/{resort_id}/room-types` | owner | list room types |
| POST | `/api/v1/owner/resorts/{resort_id}/room-types` | owner | create room type |
| POST | `/api/v1/owner/resorts/{resort_id}/submit` | owner | Draft → pending review. Fails with INCOMPLETE and a list of what's missing. |
| PATCH | `/api/v1/owner/room-types/{room_id}` | owner | Reducing total_units below what's already booked or blocked on a future night fails with UNITS_IN_USE and the affected dates. |
| GET | `/api/v1/owner/room-types/{room_id}/calendar` | owner | Per night: units, bookings, blocks, availability and the effective price (max 92 days). |
| PUT | `/api/v1/owner/room-types/{room_id}/calendar` | owner | Set a date-specific price, block units or close nights for a date range. Blocks never override existing bookings — nights where they wouldn't fit are listed in `conflicts`. |
| GET | `/api/v1/owner/room-types/{room_id}/rate-rules` | owner | list rules |
| POST | `/api/v1/owner/room-types/{room_id}/rate-rules` | owner | create rule |

## Payments

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/payments/razorpay/order` | customer | Create (or reuse) a Razorpay order for the booking's server-calculated total. |
| POST | `/api/v1/payments/razorpay/verify` | customer | Called by the checkout after Razorpay's success callback. Verifies the HMAC signature with our secret before confirming anything. |
| POST | `/api/v1/payments/razorpay/webhook` | public | Server-to-server notifications from Razorpay (the source of truth for captures and refunds). Signature-verified on the raw body; each event is processed once. |

## Reviews

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/owner/reviews` | owner | owner reviews |
| PUT | `/api/v1/owner/reviews/{review_id}/reply` | owner | One public reply per review (sending again replaces it). |
| GET | `/api/v1/resorts/{resort_id}/reviews` | public | Published reviews plus the rating summary and a 1–5 star histogram. |
| POST | `/api/v1/reviews` | customer | Only the guest of a completed booking can review it, once. |
| GET | `/api/v1/reviews/recent` | public | A few recent, highly rated reviews for the home page (sample reviews are flagged). |
| PATCH | `/api/v1/reviews/{review_id}` | customer | update review |
| POST | `/api/v1/reviews/{review_id}/report` | any signed-in user | report review |

## Uploads

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/v1/uploads/images` | owner / admin | upload image |
