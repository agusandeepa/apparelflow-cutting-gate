# AI Optimization Report

> **DRAFT — the candidate must review and rewrite this in their own words** after running the app, reading the code,
> and adding anything they personally find. Everything below describes what actually happened during this build; nothing
> here has been invented to fill the template. Delete this note when you finalise.

## 1. Tools & Prompting

| Tool | Used for |
|---|---|
| Claude (chat, with a sandbox to run code) | Architecture, schema + SQL triggers, services, API routes, UI, tests, README, this draft |

Prompting approach: the brief (PDF) was pasted as-is; the AI first proposed the stack + folder layout, then generated the
whole project in one pass inside a sandbox where it could install packages, run `vitest`, `tsc`, `next build` and
`curl` the running server. **[YOU: add what *you* prompted/changed yourself, e.g. styling tweaks, extra tests.]**

## 2. Flawed / Broken AI Code (found by running it)

1. **Embedded-DB bootstrap crashed on first run.** `src/db/client.ts` created `new PGlite("./.data/pglite")` without
   creating the parent `.data` folder, so *every* request returned HTTP 500 (`ENOENT: mkdir '.data/pglite'`).
   The 47 unit tests did **not** catch it because they use an in-memory database; only a real `curl` smoke test against
   the running server exposed it.
2. **A failed initialisation was cached forever.** `getDb()` stored the *promise* in `globalThis`; when that promise
   rejected, every later request re-used the rejected promise, so the app could never recover without a restart.
   (Same function as #1, but a separate logic bug: caching a failure.)
3. **Known weaknesses I (the AI) left in and you should be aware of** *(verify and decide if you want to fix them)*:
   * The persona switcher keeps the three demo passwords in client-side JS. Acceptable for a public demo, **not** for production.
   * "Approve" in the UI performs two requests (`/count` then `/approve`). The server re-validates everything, so it is
     safe, but it is not atomic from the client's point of view.
   * No login rate-limiting / lockout.
   * The UI was never opened in a real browser by the AI; contrast was reasoned from CSS and colour values, **not measured**.
     Please click every input/dropdown yourself (and ideally run Lighthouse / axe).

**[YOU: add at least 2 problems you personally discover while testing, with the symptom, root cause and fix.]**

## 3. Human Refactoring

Design decisions that deliberately go beyond a "naive" generated solution:

* **Services own the rules.** Route handlers only turn cookie → session → service call → JSON. Because tests call the
  same service functions, the rules cannot drift between "API" and "tests".
* **Never trust stored or client status.** `approve()` re-computes every traffic light from `expected_qty`/`actual_qty`
  inside the transaction. A test flips the stored status to GREEN with raw SQL and approval is still refused.
* **Identity from the session only.** Strict Zod schemas (`.strict()`) reject `verifierId` / `timestamp` / `status`
  in request bodies. The role is re-read from the database on every request (the JWT carries only the user id).
* **Row locking** (`SELECT … FOR UPDATE`) so two verifiers cannot approve/reject the same order concurrently.
* **Sewing started ≠ new status.** Instead of adding a fifth status, `sewing_started_at/by` columns keep the queue filter
  literally `WHERE status = 'VERIFIED'`.
* **Test-the-tests (mutation check).** I removed the RED check and the role check on purpose and confirmed the relevant
  tests failed, then restored them.
* **Decision I made on an ambiguous requirement:** the brief says to reject decimals, but fabric is measured in yards
  with fractions, so decimals (max 2 places) are allowed only for *fabric yards*; piece counts/quantities are integers only.
* **ORM change:** the plan said Prisma; Drizzle was used because it runs identically on Neon and on an embedded Postgres
  (PGlite), which lets the tests exercise real SQL triggers without Docker.

## 4. Defensive Architecture

Three layers, so one bug cannot open the gate:

1. **API layer** — `requireRole()` (401/403) → strict Zod validation (400) → state-machine check
   (`assertTransition`, 422) → hard-stop checks (uncounted / RED → 422).
2. **Transaction layer** — order row locked, items re-read, wastage computed, audit log inserted, status updated, all or nothing.
3. **Database layer (Postgres triggers + constraints)**
   * only the documented transitions are legal (`IN_PROGRESS→PENDING→VERIFIED|REJECTED→PENDING`);
   * `→ VERIFIED` is impossible unless an `APPROVED` log exists and no item is RED/uncounted;
   * `verification_logs` is append-only (UPDATE/DELETE raise); one approval per order (partial unique index);
   * a rejection log must carry a note (`CHECK`);
   * a `VERIFIED` order and its piece counts are frozen.

`tests/db-guards.test.ts` attacks layer 3 directly with raw SQL to prove it.
