# ApparelFlow ERP — Cutting Operations & Gatekeeper Verification Terminal

Full-stack implementation of the **Production Batch Verification & Sewing Queue Gate**.
No unverified, mismatched or short cutting batch can enter the Sewing Queue — enforced on the **server and in the database**, not in the browser.

* **Live URL:** `<paste your Vercel URL here>`
* **Stack:** Next.js 15 (App Router) + TypeScript · PostgreSQL (Neon) via Drizzle ORM · JWT (httpOnly cookie) · Zod · Tailwind · Vitest

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Cutting Supervisor (`cutting_supervisor`) | supervisor@apparelflow.demo | Supervisor@123 |
| Cutting Verifier (`cutting_verifier`) | verifier@apparelflow.demo | Verifier@123 |
| Sewing Supervisor (`sewing_supervisor`) | sewing@apparelflow.demo | Sewing@123 |

The login page has one-click demo buttons and every screen has a **Switch persona** dropdown in the navbar.

## Run locally

```bash
npm install
npm run dev          # zero setup: uses an embedded Postgres (PGlite) stored in ./.data
npm test             # 47 tests, runs against a real in-memory Postgres (PGlite) with the real schema + triggers
```

To use a real Postgres (Neon / Supabase):

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET (openssl rand -base64 48)
npm run db:setup              # creates tables + triggers, seeds users and the 2 recipes (idempotent)
npm run dev
```

### Deploy (Vercel + Neon)
1. Create a Neon project, copy the **pooled** connection string.
2. Run `DATABASE_URL=... npm run db:setup` once from your machine.
3. Import the GitHub repo in Vercel and set env vars `DATABASE_URL` and `AUTH_SECRET`.

## Architecture

```
src/domain/      pure rules: multiplier engine, traffic light, wastage %, state machine
src/server/      services (orders, verification, sewing) — ALL business rules + RBAC live here
                 context.ts requireRole()  -> 401 / 403
                 validators.ts (Zod, strict) -> 400
src/app/api/     thin route handlers: cookie -> session -> service -> JSON
src/app/(app)/   role-specific UI (supervisor / verifier / sewing)
src/db/          schema.ts (Drizzle) + schema.sql (tables, CHECKs, triggers) + seed
tests/           Vitest, run services against a real Postgres engine (PGlite)
```

### State machine
```
IN_PROGRESS --submit--> PENDING_VERIFICATION --approve--> VERIFIED
                                  |
                                  +--reject (reason mandatory)--> REJECTED --re-submit--> PENDING_VERIFICATION
```
`VERIFIED` is terminal. "Sewing started" is recorded with `sewing_started_at/by` columns, so the Sewing Queue
filter is literally `WHERE status = 'VERIFIED'`.

### Server-side security (what the evaluator can attack with cURL)

| Attack | Result |
|---|---|
| Supervisor / Sewing POSTs `/api/verification/:id/approve` | **403** |
| No / forged cookie | **401** |
| Approve with any component RED, uncounted or missing | **422** (status is **recomputed from the counts** inside the transaction; stored/client status is never trusted) |
| Reject without a reason (empty / whitespace / <5 chars) | **400** (and a DB `CHECK` as backstop) |
| Send `verifierId`, `status`, `timestamp` in the body | **400** (strict schemas) — identity & time come from the session / DB clock |
| `GET /api/sewing/queue?status=PENDING_VERIFICATION` | query string is never read; SQL is hard-coded to `status = 'VERIFIED'` |
| Negative / decimal / string / empty quantities | **400** with per-field messages |
| Illegal transition via raw SQL (e.g. `IN_PROGRESS -> VERIFIED`, or `VERIFIED` with a RED item) | **blocked by Postgres triggers** |
| Edit/delete an audit log row, or change counts of a VERIFIED order | **blocked by Postgres triggers** |

Role is read from the database on every request (the JWT only carries the user id).

### Database schema

| Table | Purpose |
|---|---|
| `users` | id, email, password_hash (bcrypt), role, full_name, created_at |
| `recipes` | recipe_code, name, category, std_fabric_yards, wastage_cap |
| `recipe_components` | recipe_id, component_name, pieces_per_garment, image_url |
| `cutting_orders` | order_no (sequence), recipe_id, target_qty, fabric_roll_id, actual_fabric_yds, status, created_by, sewing_started_at/by |
| `verification_items` | order_id, component_id, expected_qty, actual_qty (NULL = uncounted), status GREEN/YELLOW/RED |
| `verification_logs` | **append-only** audit: verifier_id, decision, rejection_note, approval_note, wastage_pct, component_variances (JSON snapshot), timestamp |

Seeded recipes: **REC-BL01 Casual Blouse** (1.8 yd, cap 5%) and **REC-CT02 Crop Top** (1.1 yd, cap 8%) with the exact BOMs from the brief.

### Input rules
* Quantities and counts: whole numbers only (no negatives, decimals, letters, empty). A physical count of `0` is allowed (it is a shortage → RED).
* Fabric yards: positive, **up to 2 decimals** (fabric is measured in fractions of a yard; the brief's "reject decimals" is applied to piece counts).
* Errors appear inline under each field, and are re-validated on the server.

### UI contrast
`globals.css` forces dark text (`#111827`) on white for every `input/select/textarea/option` in normal, hover, focus, disabled, invalid and autofill states, and sets `color-scheme: light` so dark-mode browsers cannot produce white-on-white fields. Traffic lights use icon + text + colour (never colour alone).

## Tests (`npm test`)

| File | Covers |
|---|---|
| `approve-green.test.ts` | Test 1 — all-GREEN approval by Verifier, audit row, wastage %, YELLOW does not block |
| `block-red.test.ts` | Test 2 — RED / uncounted / zero count → 422; tampered stored status cannot bypass |
| `reject-no-note.test.ts` | Test 3 — 7 invalid reject payloads → 400, order unchanged |
| `rbac-403.test.ts` | Test 4 — supervisor & sewing get 403, anonymous 401, separation of duties |
| `sewing-isolation.test.ts` | Test 5 — only VERIFIED orders in the queue; start-sewing rules |
| `db-guards.test.ts` | Raw-SQL attacks blocked by triggers |
| `domain-and-validation.test.ts` | multiplier, traffic light, wastage, state machine, input guards |

Tests call the same service functions the API routes call, against a real Postgres engine (PGlite) running the real `schema.sql`.
