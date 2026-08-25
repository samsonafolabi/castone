# Castone — Hotel Operations App

**Product & Engineering Reference Doc**
Last updated: August 19, 2026

---

## 1. What this is

A mobile-first web app built for Castone Royal Hotel & Suites, solving two real, observed pains:

1. **Bar/drinks stock reconciliation** — currently done by hand on paper, error-prone, hard to catch missing stock or miscounts.
2. **Guest registration** — currently a paper lodger's form (security data capture), digitized 1:1.

**Design principle carried through the whole build:** match the owner's and staff's _existing_ mental model and paper-based workflow as closely as possible. Every time we considered a "more powerful" version of a feature (e.g. per-sale logging instead of end-of-day totals), we chose the version that matched how people already work, on the reasoning that adoption beats theoretical robustness.

---

## 2. Tech stack

- **Frontend:** React + TypeScript, Vite, plain CSS (mobile-first)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL via Supabase (Session Pooler connection — see §9 for why)
- **Auth:** JWT (jsonwebtoken) + bcrypt password hashing
- **Dev runner:** `tsx` (swapped from `ts-node-dev` due to a TypeScript 7 compatibility break)
- **Validation:** Zod on all write routes

---

## 3. Multi-tenancy & core architecture decisions

| Decision                                                                                                       | Reasoning                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single shared database, `hotel_id` column on every table (not one DB per hotel)                                | Cheap to run, simple mental model, easy to split a noisy tenant out later if one hotel gets big. Standard "shared DB, shared schema" pattern.                                                                                                  |
| Soft deletes (`deleted_at`) everywhere, not hard deletes                                                       | Protects against accidental clicks, preserves audit trails (e.g. "who processed this"), avoids breaking historical records that reference a "deleted" user/product. Hard delete reserved for narrow same-day "oops" cases only, not built yet. |
| `hotel_id` and `userId` always derived from the verified JWT (`req.user`), never trusted from the request body | Prevents a staff member from tampering with a request to read/write another hotel's data. Multi-tenancy security enforced at the auth layer "for free."                                                                                        |
| Postgres + Node/Express, no queues/Redis/microservices for v1                                                  | Single hotel's data volume is small (thousands of transactions/year); premature infra work was identified early as a real risk to avoid.                                                                                                       |

---

## 4. Database schema (current state)

### `hotels`

Tenant table. `id, name, address, created_at, deleted_at`

### `users`

Staff/admin accounts, scoped to a hotel. `id, hotel_id, full_name, email, password_hash, role (admin|staff), is_active, created_at, deleted_at`

### `guests`

Digitized version of the paper "Hotel Lodger's Form (Security Data Capture)." Fields mirror the paper form almost exactly: `room_number, full_name, nationality, sex, occupation, phone_number, contact_address, id_type, id_number, place_of_issue, date_of_arrival, date_of_departure, vehicle_reg_no, mission, registered_by`, plus standard `hotel_id, created_at, deleted_at`.

### `products`

Bar/drinks catalog. `id, hotel_id, name, category, unit_price, created_at, deleted_at`

### `stock_entries`

The core daily reconciliation table. One row per product per day.
`id, hotel_id, product_id, entry_date, opening_stock, purchases, sales_qty, closing_stock, unit_price, submitted_by, submitted_at, entry_type`

`entry_type` is `'daily' | 'month_reset'` (default `'daily'`) — distinguishes a normal day's entry from the corrective row inserted the day after a monthly close. See §6.6.

Unique constraint: `(hotel_id, product_id, entry_date)` — one entry per product per day (upsert on conflict, see §6).

### `monthly_stock_counts` — ✅ built

For the physical-count-vs-system-count check, done monthly (not daily — see §6.3).
`id, hotel_id, product_id, count_date, system_closing_stock, physical_count, discrepancy, status (ok|flagged), counted_by, reviewed_by, reviewed_at, admin_note, created_at`

Unique constraint: `(hotel_id, product_id, count_date)` — upsert on conflict, same-day resubmission overwrites.

### `monthly_closes` — ✅ built

Locks a reconciliation period, stores the revenue summary. Redesigned mid-build — see §6.7 for why.
`id, hotel_id, count_date, period_start, period_end, total_revenue, closed_by, closed_at`

The original `month DATE NOT NULL` column (from the first schema draft) was dropped — superseded by `count_date`/`period_start`/`period_end` once the count date was confirmed to float (1st–3rd of the new month) rather than align to a calendar boundary. Unique constraint: `(hotel_id, count_date)`.

---

## 5. Auth & permissions

**Flow:** password → bcrypt hash comparison → JWT issued (`userId, hotelId, role`, 7-day expiry) → frontend stores token in `localStorage` → every request sends `Authorization: Bearer <token>`.

**Middleware:**

- `requireAuth` — verifies JWT signature, attaches decoded payload to `req.user`
- `requireAdmin` — runs after `requireAuth`, blocks non-admins

**Permission model (confirmed with real user via WhatsApp):**

| Action                                                 | Staff | Admin                                                |
| ------------------------------------------------------ | ----- | ---------------------------------------------------- |
| Enter daily sales qty / purchases                      | ✅    | ✅                                                   |
| View amount for products they personally entered today | ✅    | ✅                                                   |
| View full daily/monthly revenue (all products)         | ❌    | ✅                                                   |
| Register / edit guests                                 | ✅    | ✅                                                   |
| Remove guest record                                    | ❌    | ✅                                                   |
| View flagged discrepancies                             | ❌    | ✅                                                   |
| Update product price                                   | ❌    | ✅ (password-gated action per owner's explicit rule) |
| Create/deactivate users                                | ❌    | ✅                                                   |
| Trigger monthly close                                  | ❌    | ✅                                                   |
| Submit monthly physical stock count                    | ❌    | ✅                                                   |
| Add admin notes on flagged discrepancies               | ❌    | ✅                                                   |

**Known gap, deliberately deferred:** token is stored in `localStorage`, which is readable by any JS on the page (XSS risk). Acceptable while learning/building; flagged as a **pre-launch** requirement to migrate to httpOnly, secure, sameSite cookies before real guest/staff/payment data flows through the app in production.

**Security fix applied (Aug 11):** `guests.ts` and `users.ts` were built _before_ the auth middleware existed and never got retrofitted — every route in both files was completely unauthenticated (anyone could register/view/edit/delete guests, or create their own admin account, without logging in). Also, `guests.ts` was trusting a client-supplied `hotel_id` instead of deriving it from the token — the exact multi-tenancy hole the token-derived pattern exists to prevent. Fixed: `requireAuth` added to every route in both files, `requireAdmin` added to user management and guest deletion, and `hotel_id`/`registered_by` are now always derived from `req.user`, never from the request body or query string. `GET/PATCH/DELETE /guests/:id` now also filter by `hotel_id` in the query itself, closing a cross-tenant read/write gap that existed even with a valid token from a different hotel.

---

## 6. Stock reconciliation — the core design, and how we got there

This went through several iterations based on real feedback from the hotel owner and staff (via WhatsApp). Documenting the _why_, since the final design isn't obvious from the schema alone.

### Rejected: daily blind physical count ("Model A variant 1")

Original design: staff types a sales number, then physically counts and enters closing stock; system computes an "expected closing" independently and flags mismatches — daily.

**Why rejected:** the hotel owner clarified physical counting only happens **monthly**, at payment/settlement time — not daily. Building daily blind-count friction into staff's workflow was solving a problem they don't have day-to-day.

### Rejected: per-sale logging ("Model B")

Considered: staff taps a product every time one sells, building `sales_qty` as a real event count instead of a self-reported total. Closes a tampering loophole (self-reported totals can be gamed) and gives live dashboards.

**Why rejected for v1:** the owner confirmed current practice is Model A (one total, typed once at day's end) and, despite liking B in theory, chose to build what matches existing behavior first, to protect adoption. Noted as a possible future per-hotel toggle.

### Final model ("Model A," confirmed)

- Staff/admin enters **only**: `sales_qty` and `purchases` ("Supply" in the UI — see §6.1), once per product per day
- `opening_stock` is **never typed** — it auto-carries from the previous day's `closing_stock`
- `closing_stock` is **fully computed**, never typed: `opening_stock + purchases − sales_qty`
- `unit_price` is **snapshotted onto the entry at submission time**, not looked up live from `products.unit_price` — protects historical revenue figures from later price changes (see §6.2)
- **Day 1 exception:** when a product is first created, admin must supply `initial_quantity` (now a **required** field, not optional) — becomes the seed row's `opening_stock`. Reasoning: a product with zero stock on the ground has no operational meaning yet.
- Submitting twice for the same product/day **upserts** (overwrites), not adds — supports same-day typo correction. **Important constraint discovered during testing:** this means sales/purchases must be entered as **whole-day totals**, not incremental partial submissions — two partial submissions the same day will overwrite each other, not sum. Confirmed this is fine since it matches the "one total, once, at day's end" real-world model.
- Real discrepancy detection happens **monthly**, not daily (see §6.3, not yet built)

### 6.1 — "Purchases" → "Supply"

Renamed in the UI only (backend field stays `purchases`) to mirror the owner's own vocabulary: _"Issue fresh items (drinks) from store when sales stock is down or at zero, this is called 'SUPPLY.'"_ Matching real users' language was treated as a first-class product decision, not just copy polish.

### 6.2 — Why price is snapshotted, not referenced live

`products.unit_price` is the current/default price (admin-editable, password-gated per the owner's rule: _"Rate already fixed, and be updated manually (with password)"_). Every `stock_entries` row freezes its own `unit_price` at submission time, so later price changes never retroactively alter historical revenue/amount calculations. New entries pre-fill from the live `products.unit_price` but the value that gets saved is independent from that point on.

### 6.3 — Why discrepancy-catching moved to monthly, not daily

Directly follows §"Rejected: daily blind physical count" above. `monthly_stock_counts` (table built, route not yet built) is designed to be the actual moment physical count vs. system count gets compared and flagged — matching the owner's existing month-end settlement ritual, rather than inventing a new daily ritual.

### 6.4 — Flag, don't auto-correct (principle, applies wherever discrepancies appear)

Any mismatch between physical count and system count should be surfaced to the admin dashboard for investigation, never silently reconciled by the system adjusting numbers to fit. A discrepancy is treated as information, not an error to smooth over.

### 6.5 — Revenue calculation

Computed, not stored (same "derive, don't persist" principle as `closing_stock`):

```
amount (per product, per day) = sales_qty × unit_price (the entry's own snapshotted price)
day_total = sum of amount across all products for that hotel + date
```

`GET /stock-entries` returns both. Scope of `day_total` differs by role — for staff it's the sum of only their own submitted entries; for admin it's the whole hotel's day — same route, same field name, different `WHERE` filter, matching the confirmed permission ("staff sees their own product totals only").

### 6.6 — Monthly Reconciliation: the full design, and how we got there

Built out fully in this pass (backend + frontend), after several rounds of correction against real feedback from the owner.

**Timing, confirmed with the owner:** the physical count isn't tied to calendar month-end — _"we select a convenient day between the 1st & 3rd of the new month for the stock taking,"_ and _"we generated the opening stock of new month automatically from the results of stock taking."_ Also confirmed: the count happens **in one sitting, all products at once** — not spread across days. This is why `monthly_closes` was redesigned around a floating `count_date` rather than a fixed calendar `month` (see schema note above).

**The hard problem: real selling still happens on count day.** Early designs assumed count day could be treated as a clean cutoff. In reality, the owner counts _whenever he's free that day_ — could be morning, could be afternoon — and staff keep selling before and after. Since the system only logs one total per day (no timestamps, Model A), there's no way to precisely split "sold before the count" from "sold after."

**The resolved design — deliberately simple over precise:**

- **Count day itself is left completely untouched.** Staff logs that day's sales/purchases exactly like any other day — no special handling, no timing awareness required.
- The physical count is compared against **the last fully-settled day** (the day _before_ count day) — not count day itself, since count day isn't finished yet at the moment of counting anyway.
- **The correction takes effect starting the day _after_ the count** — a `month_reset`-typed row is inserted for that date, with `opening_stock` set from the physical count instead of carried forward from the math. That day's own real sales/purchases still get logged normally on top of it.
- This leaves an acknowledged, accepted imprecision — some of count day's activity happened before counting, some after, and the system doesn't try to split them. Reasoning: _"you're not trying to be more precise than the process you're replacing."_ The paper-based process had the same fuzziness.

**Blind entry + flag-don't-correct, applied here too:** the count-entry screen shows no system numbers while entering — plain empty fields per product, submitted once as a single bulk action. Discrepancies are surfaced only after submission, for admin review with an optional note. Nothing is ever auto-corrected.

**Sequencing, explicitly confirmed:** count always happens **before** close — close is blocked by the backend if no count exists for that date, since closing without counting would mean locking in unverified numbers.

### 6.7 — `monthly_closes` schema redesign

The first schema draft used a fixed `month DATE NOT NULL` column, written before the floating count-date requirement was confirmed. This caused a real bug during testing (`null value in column "month" violates not-null constraint`) once the route was rewritten around `count_date`/`period_start`/`period_end` without dropping the old column. Fixed by dropping `month` entirely — it added nothing the new columns didn't already cover.

### 6.8 — What closing a period actually does (transactional)

1. Guards: a count must exist for `count_date`; that exact `count_date` must not already be closed.
2. Computes `period_start` — the day after the previous close, or the earliest `stock_entries` date if this is the first-ever close.
3. Sums `sales_qty × unit_price` across the whole period for `total_revenue`.
4. Inserts one `month_reset`-typed row per product, dated the day _after_ `count_date`, with `opening_stock` = physical count. Uses `ON CONFLICT` so it never overwrites real purchases/sales already logged for that date — see §7 for the known edge case this creates.
5. Inserts the `monthly_closes` record.

All five steps run in a single Postgres transaction — if any step fails, nothing partial is left behind.

### 6.9 — Bug: re-counting the day right after a close

Discovered during real testing (owner counted, closed, then tested a second count the next day). The comparison logic originally always looked at "the most recent entry **strictly before** count*date" — but the `month_reset` row from the prior close lands **exactly on** that next date, so the strict `<` comparison skipped past it and compared against stale, pre-correction numbers instead. Fixed by checking for a same-day `month_reset` row first, and using its `opening_stock` directly when one exists, only falling back to the prior-day lookup otherwise. A second guard was added alongside this: submitting a count using a `count_date` that's \_already been closed* is now explicitly rejected, rather than silently producing a confusing comparison.

---

## 7. Notable bugs fixed during build (worth remembering)

1. **TypeScript 7 / `ts-node-dev` incompatibility** — swapped to `tsx` as the dev runner.
2. **Supabase `db.<ref>.supabase.co` is IPv6-only** — caused `ENOTFOUND` on networks without IPv6 support. Fixed by switching to the **Session Pooler** connection string (IPv4-reachable, and the correct pooler mode for a long-running `pg.Pool`-based server vs. the Transaction pooler, which suits serverless/edge instead).
3. **String concatenation bug in stock math** — Postgres `NUMERIC` columns come back from `pg` as strings, not numbers. `"24" + 12` produced `"2412"` instead of `36`. Fixed by wrapping every numeric DB value in `Number(...)` before doing arithmetic — applied consistently across the stock-entries route.
4. **Timezone bug in `entry_date`** — `pg` auto-converts Postgres `DATE` columns into JS `Date` objects, which carry timezone info; in WAT (UTC+1) this shifted dates back by a day in JSON output (e.g. showing `2026-08-09T23:00:00Z` for what was actually `2026-08-10`). Fixed with a custom `pg` type parser (`types.setTypeParser(1082, val => val)`) so `DATE` columns are returned as raw strings.
5. **`verbatimModuleSyntax` TypeScript config errors** — type-only imports (e.g. `FormEvent`) needed the explicit `type` keyword: `import { useState, type FormEvent } from 'react'`.
6. **Grey/dark-mode form fields** — Vite's default `index.css` boilerplate shipped with `color-scheme: light dark` and a `prefers-color-scheme: dark` media block, which silently overrode custom input/button styling on dark-mode devices. Fixed by stripping the boilerplate entirely and forcing `color-scheme: light` globally.
7. **Browser autofill white/yellow tint** — fixed with the standard `-webkit-autofill` inset `box-shadow` override trick.
8. **Frontend date-shift bug in the Stock Entries date picker** — same root cause as bug #4, but on the frontend this time: `todayStr()`/`shiftDate()` used `.toISOString().slice(0,10)`, which always converts through UTC. In WAT (UTC+1), local midnight becomes 11pm the previous day in UTC — so the back-arrow appeared to jump two days instead of one, and the forward-arrow appeared to do nothing. Fixed by building the date string manually from `getFullYear()/getMonth()/getDate()` (local time), never touching `.toISOString()` for calendar-date values. Second occurrence of this exact class of bug in the project — now treated as a standing rule.
9. **`monthly_closes` NOT NULL constraint violation** — the table's original `month DATE NOT NULL` column was never dropped after the schema was redesigned around `count_date`/`period_start`/`period_end`; every close attempt failed until the leftover column was dropped. See §6.7.
10. **Stale comparison data when re-counting the day after a close** — see §6.9 for the full trace; fixed by detecting a same-day `month_reset` row before falling back to the prior day's closing stock.
11. **Missing auth middleware on `guests.ts` and `users.ts`** — both files were written before `requireAuth`/`requireAdmin` existed and never retrofitted; every route was fully unauthenticated until fixed on Aug 11 (see §5).

---

## 8. Design system (frontend)

**Direction:** rejected generic SaaS aesthetics (cream + terracotta, or dark-mode-with-neon-accent) in favor of something grounded in the actual subject — a traditional/upscale Nigerian hotel ("Royal Hotel & Suites" evokes brass room numbers, gold signage, deep green interiors).

- **Color:** deep bottle-green (`#16241D`) background on the login screen; warm ivory (`#F7F4EC` / `#FBF7EE`) surfaces elsewhere; brass/gold accent (`#B9924C`) throughout; near-black ink (`#1C1B17`) for text
- **Type:** `Fraunces` (serif) for headings/hotel name only; `Inter` for all UI/body text
- **Signature motif:** a thin brass "stripe" across the top of the login card (echoing a hotel keycard's magnetic stripe / a brass door plaque), with a one-time shimmer animation on load
- **Pattern used throughout:** expandable list rows (tap a product/guest → inline form appears) — consistent across Stock Entries, Products, and Guests screens

---

## 9. What's built — full checklist

### Backend

- ✅ `hotels` — create, list
- ✅ `users` — create, list (admin creates staff accounts), now properly authenticated
- ✅ `auth` — login (bcrypt + JWT), `requireAuth` / `requireAdmin` middleware
- ✅ `guests` — full CRUD, soft delete, now properly authenticated + tenant-scoped
- ✅ `products` — create (with required initial stock seeding, transactional), list (with live `current_stock`), edit, price update (separate admin-gated route), soft delete
- ✅ `stock-entries` — daily entry (upsert same-day), auto-carried opening stock, computed closing stock, price snapshot, computed `amount` + role-scoped `day_total`, safety check against negative closing stock, timezone-safe `entry_date`, `?date=` query support
- ✅ `monthly-stock-counts` — bulk blind submission, discrepancy calculation (with same-day-reset-aware comparison), admin notes/review
- ✅ `monthly-closes` — count-before-close guard, duplicate-close guard, transactional close (revenue summary + `month_reset` row insertion + lock), close history endpoint

### Frontend

- ✅ Login screen (styled, JWT flow, real logo)
- ✅ Home screen (six-module grid matching the hand-drawn wireframe)
- ✅ Stock Entries screen (expandable list, current-stock display, Supply/Sales inputs, day total, **date navigation with read-only history view**)
- ✅ Products screen (list with current stock + price, admin-only add-product form, admin-only price editing)
- ✅ Guests screen (register, view, inline edit, admin-only remove)
- ✅ Monthly Reconciliation screen (blind count entry → review with flagged discrepancies + notes → close, with persistent "last closed" state shown on every visit)

**Five of six modules from the original hand-drawn wireframe are now fully built, backend and frontend, and tested against real data.**

---

## 10. What's left

### Backend

- ⏳ Past-date correction route for `stock_entries` — currently only same-day upsert exists; no sanctioned way to fix a typo from days ago except direct DB editing
- ⏳ Monthly revenue rollup as its own queryable endpoint — currently only computed inline during a close; Dashboard will need this independently

### Frontend

- ⏳ **Dashboard/Reporting screen** — the last unbuilt module from the original wireframe. Flagged discrepancies, daily/monthly revenue summaries, guest occupancy snapshot, calendar view
- ⏳ Real client-side routing (currently a simple `view` state string in `App.tsx`; fine for 6 screens, will want `react-router` if the app keeps growing)
- ⏳ Admin UI for creating/deactivating staff accounts (currently only possible via direct API calls)

### New — deployment

- ⏳ Deploy backend + frontend live so real users (owner, staff) can test on their own phones, not just localhost. Not yet started — see deployment notes below.

### Parked for later (deliberately, not forgotten)

- Migrate auth token storage from `localStorage` to httpOnly cookies before real production use
- Store-stock vs. bar-stock split — a second inventory pool for the backroom/warehouse reserve, separate from active bar stock, with a "Supply" transfer action between them (currently the owner controls store access physically, "by holding the key," with no system record at all)
- Optional per-sale entry mode (Model B) as a toggle, if daily-total entry (Model A) ever proves insufficient in practice
- Password reset flow (currently no recovery path if a user forgets their password)
- Product price-change history log (`product_price_history` table) — not needed for v1 since price snapshots are already preserved per-entry, but would enable a "when did prices change" timeline view later

---

## 11. Deployment — not yet started

Goal: get this onto real phones (owner + staff) for genuine daily-use testing, not just localhost.

**What needs to happen, roughly:**

- **Database:** already on Supabase — no change needed, just confirm the connection string used in production points to the same (or a separate production) Supabase project.
- **Backend:** needs a live host (options: Railway, Render, Fly.io — all have straightforward Node/Express support and free/cheap tiers suitable for one hotel's traffic). Environment variables (`DATABASE_URL`, `JWT_SECRET`) need to be set on the host, not committed to the repo.
- **Frontend:** needs a static host (Vercel or Netlify are the simplest for a Vite app) with the `API` base URL switched from `http://localhost:4000` to the deployed backend's real URL — currently hardcoded as `http://localhost:4000` across multiple page files, so this needs to become an environment variable (`VITE_API_URL` or similar) before deploying, not hardcoded per-environment.
- **CORS:** the backend's `cors()` middleware currently allows all origins by default in dev; before going live, worth restricting it to the actual deployed frontend URL.
- **Before real staff/guest data flows through a public URL:** the `localStorage` token storage gap (see §5) becomes meaningfully higher-stakes than it was on localhost — worth prioritizing the httpOnly cookie migration around this same time, not indefinitely after.

Not yet decided: which hosts specifically, custom domain vs. free subdomains, and whether staging/production should be separate Supabase projects or one shared one during this early testing phase.

---

## 12. Open questions to revisit

- Should "Edit guest details" stay available to all staff, or become admin-only like "Remove guest"? (Currently: any logged-in user can edit; only admin can remove.)
- Confirmed: flagged discrepancies are purely informational, never operationally blocking — matches the built behavior.
- POS/payment-channel reconciliation (matching total revenue against actual cash/POS/transfer received) — raised but explicitly left undecided, not yet scoped at all.
- Store-to-bar transfer tracking — still parked; revisit only if it becomes an observed real problem, same as originally reasoned.
- Multi-hotel distribution (the original "other hotels/restaurants have this pain too" thesis) — not yet tested outside the founder's own family hotel; worth revisiting once the app is in daily real use for a few weeks, which deployment (see §11) is meant to enable.
