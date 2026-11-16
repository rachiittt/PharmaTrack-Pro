# CLAUDE.md — PharmaTrack Pro

This file tells any model how to work in this repository. Read it fully before
touching anything. It is the contract for every task here.

---

## 0. Working protocol (applies to EVERY prompt)

**Read first, then implement. Never write code from memory of what the project
"probably" looks like.**

For every request, in this order:

1. **Read the files you will touch, and the files that call them.** At minimum:
   - the page/component/service/route you are changing;
   - the SQL migration that defines any table or RPC you depend on (`supabase/migrations/`);
   - the matching test (`supabase/tests/run-db-tests.mjs`, `backend/test/api.test.js`, `frontend/test/logic.test.js`);
   - `frontend/src/lib/roles.js` and `supabase/migrations/20261114000005_rls.sql` if roles or permissions are involved.
   Use `grep -rn` to find every usage of a function, RPC name, column or token before changing it.
2. **State what you found in one or two lines** (which files, which RPC, which role gate) before changing anything. If the request conflicts with how the project works (see §4 and §6), say so in a sentence and continue with the correct approach.
3. **Implement the whole request.** Do not narrow scope silently. If part is blocked, finish the rest and say exactly what was left and why.
4. **Run the checklist in §8** and report real results (paste failing output if anything fails).

Do not ask the user questions that the code can answer. Do not stop at a plan when the user asked for a change.

---

## 1. What this project is

PharmaTrack Pro is a **multi-tenant pharmacy management SaaS** for Indian medical shops and small chains.

- Stock is tracked **per batch** (product × branch × batch number) with manufacturing/expiry dates and purchase/selling/MRP prices.
- Billing is **FEFO** (first-expiry, first-out) and never sells expired stock.
- It receives supplier invoices (purchases), handles returns and cancellations, keeps an append-only stock ledger, raises expiry/low-stock alerts, and reports sales and GST.
- Indian retail conventions are baked in: **MRP is tax-inclusive**, GST slabs 0/5/12/18/28 %, **financial year April–March** (invoice numbers like `INV/2026-27/00001`), Schedule H/H1/X drugs need a doctor's name at billing, amounts in ₹ with `en-IN` formatting.
- Every pharmacy is a **tenant**. Isolation is enforced by Postgres Row Level Security and `SECURITY DEFINER` RPCs, not by the UI.
- An optional AI assistant (Claude, backend-only) answers stock/sales questions from read-only SQL tools and can draft a purchase from an uploaded invoice.

Reference docs (read when the task touches architecture, security or workflows):
`docs/SYSTEM_DESIGN.md`, `docs/TECHNICAL_AUDIT.md`, `docs/IMPLEMENTATION_SUMMARY.md`, `README.md`.

### How it is built

| Layer | Stack | Trust |
|---|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), React Router 6, Recharts, lucide-react, react-hot-toast, `@zxing/library` (lazy) | untrusted |
| Data & auth | Supabase: Postgres, Auth, RLS, RPCs (plpgsql), Realtime, private Storage buckets | **enforcing** |
| Backend | Node ≥20, Express 5, zod 4, helmet, express-rate-limit, `@anthropic-ai/sdk`, `@supabase/supabase-js` | enforcing for its own endpoints only |
| Tests | Node built-in test runner; PGlite (real Postgres in WASM) for database tests | — |

**Data flow:** the browser talks to Supabase **directly** with the anon key + the user's JWT. The Express backend exists only for work that needs secrets: staff logins with a temporary password (service-role Auth admin API) and AI (Anthropic key, quotas). Everything else — products, batches, sales, purchases, reports — is a Supabase table read or an RPC call from `frontend/src/services/*`.

---

## 2. Folder map

```
package.json                root scripts (dev, test, lint, build, seed)
.claude/launch.json         preview config: name "frontend" → Vite on :5173
README.md, docs/            product/README, audit, system design, implementation summary

backend/                    Express API (CommonJS, 'use strict')
  src/server.js             boot: loadConfig → Supabase factory → Anthropic client → app.listen
  src/app.js                createApp({config, supabase, anthropic}) — DI so tests need no network
  src/config.js             zod-validated env; SUPABASE_* required, ANTHROPIC_API_KEY optional
  src/lib/supabase.js       {admin (service role, may be null), authClient (anon), forUser(jwt)}
  src/lib/errors.js         HttpError, PG error-code → HTTP status map, unwrap()
  src/middleware/auth.js    requireAuth (Supabase getUser on every request), requireMember(...roles)
  src/middleware/validate.js validate(zodSchema) → req.validatedBody
  src/middleware/errorHandler.js  every error leaves as {error, code, details?}; never raw SQL
  src/routes/team.js        POST /api/pharmacies/:id/members (owner; temp password or email invite)
  src/routes/ai.js          GET status, POST ask, POST invoice-extract (owner/manager/pharmacist)
  src/services/ai/          assistant.js (tool loop), tools.js (5 read-only tools), invoiceExtraction.js
  scripts/                  check-syntax.js (lint), seed-demo.js, make-platform-admin.js
  test/api.test.js          backend tests with fake Supabase + fake Anthropic
  .env.example              copy to backend/.env (never commit .env)

frontend/                   React app (ESM)
  index.html                fonts (Inter, JetBrains Mono), theme-before-paint script
  vite.config.js            /api → http://localhost:5001 proxy; envPrefix VITE_ and NEXT_PUBLIC_
  eslint.config.js          @eslint/js recommended + react-hooks + react-refresh
  src/main.jsx              StrictMode + ErrorBoundary + App
  src/App.jsx               routes; lazy pages; guard(permission, what, element)
  src/index.css             ALL design tokens (light + .dark), Tailwind @theme mapping, print CSS
  src/lib/supabase.js       client (anon only), unwrap(), rpc(), AppError, toAppError(), SETUP_ERROR_CODES
  src/lib/api.js            apiRequest(path, {method, body, timeout}) → backend with Bearer JWT
  src/lib/roles.js          PERMISSIONS map, can(role, action), homeFor(role) — mirrors RLS
  src/lib/format.js         money, moneyCompact, number, date, dateTime, expiryShort, daysUntil…
  src/lib/pricing.js        previewTotals (tax-inclusive sale), purchaseLineTotals (tax on top)
  src/lib/barcode.js        GTIN checksum, normalizeScannedCode (GS1 (01), leading-zero GTIN-14)
  src/lib/csv.js            downloadCsv (BOM + formula-injection guard)
  src/context/SessionContext.jsx  session, profile, memberships, pharmacy, branch, role, can()
  src/hooks/useAsync.js     useAsync(loader, deps) → {data, error, loading, reload, setData}; useDebounced
  src/hooks/useBarcodeWedge.js    global USB/Bluetooth scanner listener
  src/services/             ONE module per domain: pharmacy, inventory, sales, purchases,
                            suppliers, insights, notifications, ai — the only place Supabase is called
  src/components/ui/        design system: Button, IconButton, Field/Input/Select/Textarea/
                            BareInput/BareSelect/Checkbox, Badge(+Sale/Payment/Stock/Schedule),
                            Panel, DetailList, DataTable, Pagination, Modal, ConfirmDialog,
                            PageHeader, Segmented, Stat, ExpiryBar, StockLevel, Kbd,
                            Spinner, Skeleton, PageLoader, EmptyState, ErrorState, Forbidden, InlineAlert
  src/components/layout/    AppShell (sidebar, topbar, bell, theme), RequirePermission
  src/components/scanner/   BarcodeScanner (camera + manual)
  src/components/inventory/ ProductFormModal, AdjustStockModal
  src/components/sales/     InvoiceView (printable A4), ReturnDialog
  src/pages/                one file per screen (Pos, Inventory, ProductDetail, Purchases,
                            PurchaseNew, PurchaseDetail, Sales, SaleDetail, Suppliers, Alerts,
                            Reports, Team, Settings, Assistant, Notifications, Platform, Auth,
                            Onboarding, Dashboard, NotFound)
  test/logic.test.js        pure-logic tests (barcode, pricing parity with SQL, roles)
  dist/                     build output (gitignored; stale copies named "* 2.js" are junk)

supabase/
  migrations/               THE schema, in filename order (001 tenancy … 009 staff_invites)
  setup-all.sql             concatenation of migrations for first-time paste into SQL editor
  seed/sample-catalogue.sql optional: 30 products + stock for one named pharmacy (is_demo=true)
  tests/run-db-tests.mjs    44 end-to-end Postgres tests on PGlite, run as `authenticated`
  tests/supabase-stub.sql   stand-in auth schema/roles for PGlite
  legacy/                   OLD single-tenant schema. Reference only. NEVER apply.
```

### Migration contents (know where things live)

| File | Defines |
|---|---|
| `…0001_tenancy.sql` | enums (`member_role`, `pharmacy_status`, `subscription_plan`), `profiles`, `pharmacies` (+ `settings` jsonb validated by trigger), `branches`, `pharmacy_members`, helpers `private.is_member / has_role / member_role / require_role / is_platform_admin`, profile bootstrap trigger, column-protection triggers |
| `…0002_inventory.sql` | `suppliers`, `products`, `medicine_batches`, `customers`, `stock_movements` (append-only), `private.assert_same_pharmacy` trigger, `product_stock` view |
| `…0003_transactions.sql` | `document_sequences`, `purchases`, `purchase_items`, `supplier_payments`, `sales`, `sale_items`, `sale_returns`, `sale_return_items`, `notifications`, `audit_logs` (+ `private.audit`, row-change audit trigger), `ai_requests` |
| `…0004_workflows.sql` | guards (`guard_batch_quantity`, `keep_an_owner`, `require_branch`), helpers (`financial_year`, `next_document_no`, `setting`, `record_movement`), RPCs `create_pharmacy`, `add_opening_stock`, `adjust_stock`, `receive_purchase`, `record_supplier_payment`, `create_sale`, `get_sale`, `process_return`, `cancel_sale` |
| `…0005_rls.sql` | RLS on every table, role matrix in header comment, revokes on ledger tables, `anon` gets nothing |
| `…0006_insights.sql` | read models: `inventory_list`, `lookup_barcode`, `pos_search`, `stock_alerts`, `refresh_alert_notifications`, `dashboard_summary`, `supplier_summary`, `sales_report`, `reorder_suggestions`, `expiry_risk` |
| `…0007_platform_demo.sql` | `platform_overview`, `platform_update_pharmacy`, storage buckets + policies, realtime publication, `seed_demo_pharmacy` (service_role only) |
| `…0008_profile_repair.sql` | back-fill profiles, `ensure_profile()` |
| `…0009_staff_invites.sql` | `pharmacy_invites`, `add_staff_member`, auto-accept trigger on profile insert |

---

## 3. Commands

Node 20+ required (repo was verified on Node 22). Run from the repo root unless noted.

```bash
npm run install:all        # root + backend + frontend deps
```

```bash
npm run dev                # backend on :5001 and Vite on :5173 (concurrently)
```

```bash
npm test                   # DB (PGlite) + backend + frontend suites — the full gate
```

```bash
npm run test:db            # 44 Postgres tests: migrations, RLS, FEFO, idempotency, isolation
```

```bash
npm test --prefix backend  # 20 backend tests, no network (fake Supabase/Anthropic)
```

```bash
npm test --prefix frontend # 5 pure-logic tests (barcode, pricing, roles)
```

```bash
npm run lint               # backend: node --check every file; frontend: ESLint
```

```bash
npm run build              # Vite production build → frontend/dist
```

```bash
DEMO_PASSWORD='choose-a-strong-password' npm run seed:demo   # needs real service-role key
```

```bash
npm run platform-admin --prefix backend -- you@example.com   # grant (--revoke to remove)
```

Browser preview: use the `.claude/launch.json` config named **`frontend`** (it starts `npm run dev --prefix frontend`, which itself starts the backend too). Never start servers with raw Bash.

Environment: `backend/.env` from `backend/.env.example`; `frontend/.env.local` from `frontend/.env.example`. Keys matching `/dummy|your-|placeholder|changeme/` are treated as **not configured** (the backend disables staff passwords; the frontend shows the "Connect a Supabase project" screen). Only `VITE_`/`NEXT_PUBLIC_` vars reach the browser.

Regenerating `supabase/setup-all.sql` after adding a migration:

```bash
{ echo "-- PharmaTrack Pro: all migrations in order (generated from supabase/migrations)."; echo "-- First-time setup: paste into Supabase Dashboard -> SQL Editor -> New query -> Run."; for f in supabase/migrations/*.sql; do echo; echo "-- ===== FILE: $f ====="; cat "$f"; done; } > supabase/setup-all.sql
```

---

## 4. Coding rules

### Architecture rules (non-negotiable)

1. **The database is the security boundary.** Every table has RLS. Every RPC starts with `perform private.require_role(pharmacy_id, '{...}')` and, for branch-scoped writes, `private.require_branch(...)`. The UI's `can()` only hides buttons.
2. **All stock and money writes go through RPCs** (`create_sale`, `receive_purchase`, `process_return`, `cancel_sale`, `adjust_stock`, `add_opening_stock`, `record_supplier_payment`). Clients cannot insert/update ledger tables; a trigger rejects direct changes to `medicine_batches.quantity`. Never add a code path that bypasses this.
3. **Prices, GST, totals and invoice numbers are computed in SQL**, never trusted from the client. `frontend/src/lib/pricing.js` only *previews* with the same rounding (`round2`, tax-inclusive split, bill rounded to whole rupee) — if you change SQL maths, change the preview and the parity test too.
4. **Browser → Supabase directly.** Do not add Express routes for CRUD. The backend is only for secrets (service-role Auth admin, Anthropic key). New backend endpoints must sit under `/api/pharmacies/:pharmacyId`, behind `requireAuth` + `requireMember(...)`, validated with zod, and use `req.db` (caller-scoped) for data access.
5. **Service-role key never leaves the server.** `supabase.admin` may be `null`; code must degrade with a clear `HttpError(503, 'SERVICE_ROLE_MISSING', …)`, not crash.
6. **Every stock change writes a `stock_movements` row** via `private.record_movement` and an `audit_logs` row via `private.audit`. The test suite asserts `Σ quantity_change = batch.quantity` for every batch.
7. **Idempotency**: `create_sale` takes a client UUID `idempotency_key`; the POS keeps the same key until the bill succeeds. Preserve this on any POS change.
8. **Cross-tenant references are blocked** by `private.assert_same_pharmacy()`. New FK columns across tenant-scoped tables need the same check.
9. **Demo data lives in the database** (`is_demo = true`, fixed tenant id). Never hard-code sample arrays, random numbers or fake fallbacks in the UI. If data fails to load, show `ErrorState`.

### SQL / migration rules

- **Never edit an applied migration.** Add a new file `supabase/migrations/YYYYMMDD0000NN_name.sql` (next number), make it idempotent where practical (`create or replace`, `if not exists`, `drop policy if exists`), then regenerate `setup-all.sql` (command in §3).
- Every function: `language plpgsql` (or `sql`), `security definer`, `set search_path = ''`, fully-qualified names (`public.`, `private.`, `auth.`). Read-only ones are `stable`.
- After adding public functions: `revoke execute … from public, anon; grant execute … to authenticated` (see end of 0006 / 0008 / 0009 for the pattern). Internal helpers go in schema `private`.
- Raise errors with the codes the apps map: `22023` invalid input, `P0002` not found, `42501` permission, `23505` duplicate, `23514` constraint, `28000` unauthenticated, `54000` limit. Messages are shown to users verbatim for these codes — write them as plain sentences.
- Money is `numeric(12,2)`; quantities are `int` with `check (>= 0)`; dates are `date` (YYYY-MM-DD strings in JS).
- Every new table: `pharmacy_id`, `is_demo` where rows can be seeded, indexes on every FK, `enable row level security`, policies via `private.is_member / has_role`, and revokes for ledger-type tables.
- Storage, storage policies and the realtime publication are wrapped in `do $$ … $$` guards because PGlite has no `storage` schema — keep that pattern.
- `pharmacies.settings` keys are validated by `private.validate_settings()`; adding a key means updating that trigger, the Settings page and `README`.

### Backend rules (`backend/`)

- CommonJS, `'use strict';` at the top of every file, Node ≥20, no TypeScript, no build step.
- Validate input with zod via `validate(schema)`; read `req.validatedBody`.
- Throw `HttpError(status, CODE, message)`; wrap Supabase responses with `unwrap()`. Never send raw DB messages or stack traces to clients.
- Dependencies are injected through `createApp({config, supabase, anthropic})`; tests pass fakes. Do not import singletons that hit the network at module load.
- AI: tools are **read-only**, run with the **caller's** client (`req.db`), whitelist fields with `pick()`, strip customer data (`recent_sales`), never store prompt text (only token counts in `ai_requests`), per-pharmacy daily quota, refusals become a scoped message. Model id comes from `config.AI_MODEL` (default `claude-opus-5-5`); calls use `client.beta.messages.create` with `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, adaptive thinking, and the assistant turn is passed back **unchanged** (thinking + tool_use blocks) with tool results in one user message.
- `backend/scripts/check-syntax.js` is the lint: a file that fails `node --check` fails lint.

### Frontend rules (`frontend/`)

- ESM, JSX, no TypeScript, function components + hooks only. ESLint with `react-hooks` v7 rules must be clean (`eslint-disable` only with a reason, as in `SessionContext.jsx` and `useAsync.js`).
- **All Supabase access goes through `src/services/*`**, one module per domain. Pages/components never import `supabase` directly except `Auth.jsx`/`Settings.jsx` for `supabase.auth` calls.
- Wrap every query with `unwrap(...)` and every RPC with `rpc(name, args)` so errors become `AppError` with friendly messages. Catch and show with `toast.error(e.message)` or `ErrorState`.
- Load data with `useAsync(loader, deps)`; call `reload()` after mutations. Debounce search with `useDebounced`.
- Role gating: `const { can } = useSession(); can('inventory.edit')` and route guards in `App.jsx`. New permissions go in `lib/roles.js` **and** must match the RLS/RPC role arrays; extend `frontend/test/logic.test.js`.
- Branch scoping: use `branch?.id ?? null` from `useSession()`. Staff pinned to a branch cannot switch.
- Formatting: `money()`, `moneyCompact()`, `number()`, `date()`, `dateTime()`, `expiryShort()`, `daysUntil()`, `todayIso()` from `lib/format.js`. Never hand-roll `toFixed` for currency in UI text.
- Barcodes: always pass scanner/manual input through `normalizeScannedCode()`; a `null` result means reject, never "best guess". Inputs that may receive USB-scanner bursts set `data-scan-target="true"`.
- PostgREST `.or()`/`.ilike` filters: strip `%,()` from user input as `services/inventory.js` and `services/sales.js` do.
- Keep pages lazy (`lazy(() => import(...))` in `App.jsx`) and heavy libs lazy (`@zxing/library`).
- No new runtime deps without need. Removed on purpose and must not return: `axios`, `framer-motion`, `qrcode`, `xlsx`, `uuid`.
- Printing: wrap printable documents in `.print-area`; hide chrome with `.no-print`.

### Tests

- Every new RPC, policy or trigger gets a test in `supabase/tests/run-db-tests.mjs` using `as(userId, …)` (RLS on) or `asService(…)`. Include a negative case (wrong role, other tenant).
- Every new backend route gets a test in `backend/test/api.test.js` with the fake Supabase (`fakeSupabase({ role })`).
- Pure logic shared with SQL (pricing, checksums, roles) is tested in `frontend/test/logic.test.js`.
- Tests use `node:test` + `node:assert/strict`. No Jest, no Vitest.

---

## 5. Design rules

The UI is a dense, quiet operations tool for a busy pharmacy counter, not a marketing site.

- **Tokens only.** All colours are CSS variables in `frontend/src/index.css` (`:root` and `.dark`), exposed to Tailwind as `bg-bg`, `bg-surface`, `bg-surface-2/3`, `border-line`, `border-line-strong`, `text-ink`, `text-ink-2/3`, `bg-primary`, `text-on-primary`, `bg-primary-soft`, `text-primary-ink`, `bg-sidebar…`, and status pairs `danger / warning / caution / info / success` (+ `-soft`), plus `text-on-danger` for text on a solid `bg-danger` (both themes). **Never write a hex colour or a stock Tailwind colour (`bg-blue-500`, `text-gray-600`) in a component.** The only exception is `InvoiceView.jsx`, which is a printed document and uses neutral greys deliberately.
- **Status colours mean something.** `danger` = expired / out of stock / overdue / cancel. `warning` = expiring soon / low / unpaid. `caution` = slow or dead stock, partial. `success` = in stock / paid / completed. `info` = schedule H badges, demo, informational. Do not use them decoratively.
- **One brand colour (teal `--primary`).** Use it for the primary action, active nav, focus rings and links. Not for backgrounds of whole sections.
- **Typography:** Inter for UI, JetBrains Mono (`.code`) for invoice numbers, batch numbers, GSTIN, barcodes, rack codes. Numbers in tables use `.num` (tabular figures) and right alignment. Base font 14 px; headings `text-xl font-semibold`; section titles `text-sm font-semibold`; helper text `text-xs text-ink-3`; labels `.eyebrow`.
- **Native controls are styled once, in `index.css`:** `Select`/`BareSelect` carry `.select-chevron` (custom dropdown arrow, both themes) — add it to any raw `<select>` you write; number inputs have their spin buttons hidden globally; `Input type="password"` already has a show/hide toggle. No emoji in toasts — pass a lucide icon via `icon:`. Never use `window.prompt`/`confirm`; use `Modal`/`ConfirmDialog`.
- **Build from `components/ui`.** Buttons: `Button` with `variant` (`primary | secondary | ghost | danger | danger-outline | soft`) and `size` (`xs | sm | md | lg`). Forms: `Input/Select/Textarea` (labelled, a11y wired) or `BareInput/BareSelect` in toolbars and table cells. Lists: `DataTable` with `columns`, `hideBelow`, `align: 'right'`, `empty`, `loading`. Dialogs: `Modal` / `ConfirmDialog` (`requireReason` for consequential actions). States: `EmptyState` (explain why empty + what to do), `ErrorState` (with `onRetry`), `Forbidden`, `InlineAlert`, `Skeleton`/`PageLoader`.
- **Pages are not grids of cards.** `Panel` is for a bordered section with a title; use it sparingly. Tables sit directly in a `rounded-xl border border-line bg-surface` container. KPI rows use `Stat` (max 4 per row, `tone` for accent, `to` for drill-down).
- **Layout:** `PageHeader` (title, description, actions, optional `back`) at the top of every page. Content max-width 1320 px with `px-4 py-5 sm:px-6` from `AppShell`; POS is full-bleed. Spacing scale: gaps of 2/3/4, `mt-4` between sections.
- **Responsive:** must work at **375 px with no horizontal page scroll**. Tables scroll inside their container (`overflow-x-auto`), columns hide with `hideBelow`. Sidebar collapses to a drawer below `lg`.
- **Dark mode** is the `.dark` class on `<html>` (persisted in `localStorage['pharmatrack.theme']`). Every new colour needs a `.dark` value. Test both.
- **Keyboard first:** POS supports `/` or `F2` to focus search, arrows + Enter to pick, `F9` / Ctrl+Enter to complete. Dialogs trap focus, close on Esc, restore focus. Use `data-autofocus` for the primary control in a modal.
- **Accessibility:** every icon-only control has `aria-label`; icons are `aria-hidden`; form fields get `aria-invalid`/`aria-describedby` through `Field`; live regions (`role="status"`, `aria-live`) for async messages; `:focus-visible` ring is global.
- **Motion:** minimal. `transition-colors` on interactive elements, `animate-pulse` skeletons, `animate-spin` loaders. No entrance animations, no animation libraries. `prefers-reduced-motion` is honoured globally.
- **Copy:** plain, specific, in the pharmacy's language (bill, batch, MRP, GST, rack, supplier). Toasts say what happened and the document number (`Bill INV/… saved`). Empty states say what to do next. Errors say how to fix (`Add SUPABASE_SERVICE_ROLE_KEY to backend/.env and restart`).
- Icons: `lucide-react` only, size 15–18 in controls.

---

## 6. Mistakes a weaker model makes here, and how to avoid each

| Mistake | Why it is wrong here | Do this instead |
|---|---|---|
| Adding an Express route for products/sales/etc. | Duplicates tenancy logic; the browser already has RLS-protected access | Add/extend an RPC or table policy in a new migration and call it from `frontend/src/services/*` |
| Using `supabase.admin` (service role) for a data read/write | Bypasses RLS; the audit this project was built to fix | Use `req.db` (caller JWT). `admin` only for Auth admin calls, usage metering, audit rows |
| Putting a secret in `frontend/.env*` or a `VITE_` var | Everything `VITE_`/`NEXT_PUBLIC_` ships to the browser | Secrets live only in `backend/.env` |
| Sending `unit_price`/`total` from the POS and saving it | SQL ignores client prices by design (test "uses database prices") | Send `product_id`, `quantity`, `discount_pct` only; let `create_sale` price it |
| `update medicine_batches set quantity = …` from the client or a new RPC without a ledger row | Trigger rejects client updates; ledger would drift | Go through `adjust_stock`/`receive_purchase`… or, in SQL, update + `private.record_movement` + `private.audit` inside one function |
| Editing `20261114000004_workflows.sql` to change a function | Applied migrations are history; prod DBs will not re-run them | New migration with `create or replace function …`, then regenerate `setup-all.sql` |
| Forgetting `set search_path = ''` / unqualified table names in SQL | `search_path` hijack risk; PGlite runner will also fail on unqualified names in `security definer` fns | Copy the exact function header pattern from an existing RPC |
| Forgetting `revoke … from public, anon; grant … to authenticated` on a new function | `anon` could call it, or `authenticated` cannot | Add the grants at the end of the migration (see 0009) |
| Creating a table without RLS/policies/indexes | Cross-tenant leak; slow FK joins | Enable RLS, add `is_member`/`has_role` policies, index every FK |
| Checking the role only in `roles.js` or only in SQL | They must agree; the DB is the enforcer, the UI the mirror | Change both, and the `role permissions mirror the database policies` test |
| Hard-coding demo arrays / `Math.random()` trend data / fake fallback when fetch fails | The previous version did this and shipped fake numbers | Compute in SQL (`dashboard_summary`, `stock_alerts`…), show `ErrorState` on failure |
| Hex colours or `bg-gray-100` in JSX | Breaks dark mode and the token system | Use token classes (`bg-surface-2`, `text-ink-3`, `border-line`) |
| Wrapping every block in a `Panel`/card grid | Visual noise; not the product's style | Tables in a bordered container, `Panel` only for titled sections |
| Making a page that overflows at 375 px | Counter staff use phones/tablets | `overflow-x-auto` on tables, `hideBelow` columns, flex-wrap toolbars; check with the mobile viewport |
| Treating a scanner misread as a match | Checksums exist so a one-digit misread never bills the wrong product | `normalizeScannedCode()` → `null` means reject; unknown code → offer **Register product** |
| Selling or receiving expired stock, or selling price > MRP | SQL rejects it (`22023`) | Validate in the form too (`PurchaseNew.lineErrors`, `ProductFormModal.validate`) so the user sees it before submit |
| Computing invoice totals with JS floats and shipping them | Rounding must equal the SQL (`round2`, bill rounded to ₹) | Use `previewTotals`/`purchaseLineTotals` for preview; the DB result is the truth |
| Building a new POS flow that regenerates the idempotency key on retry | Double-billing on flaky networks | Keep `idempotencyKey` until `createSale` succeeds; `resetBill()` is the only place it changes |
| Forwarding `recent_sales` / customer names / staff data to the AI, or letting a tool write | Privacy and the "AI never changes stock" rule | Whitelist fields with `pick()`, strip customer data, tools call read-only RPCs only |
| Medical advice in the assistant prompt/UI | Out of scope and risky | Keep the refusal rules in `SYSTEM_PROMPT`; refusals map to the scoped message |
| Hand-rolling a Supabase call inside a page | Error mapping and setup-detection are in `lib/supabase.js` | Add a function to the domain service and use `unwrap`/`rpc` |
| Assuming the backend is up for normal screens | Only staff-with-password and AI need it; `apiRequest` maps a Vite 502 to "server is not running" | Features that need the backend check `serverCapabilities()` / `aiStatus()` and degrade with a message |
| Expecting PGlite tests to cover storage buckets, realtime, Auth emails | Those blocks are skipped (`do $$ if exists storage …`) | Say explicitly that those parts were not verified when reporting |
| Using Jest/Vitest/Playwright or adding a TS toolchain | Project is plain JS with `node --test` | Add tests to the three existing suites |
| Running `supabase/legacy/*.sql` or "fixing" it | It is the pre-rebuild schema | Leave it; it is reference only |
| Starting servers with raw `npm run dev` in Bash | Blocks the shell; no preview | Use the preview tool with config `frontend` |
| In zsh, `echo ====` or any arg starting with `=` | zsh expands `=cmd` to a path and errors (`=== not found`) | Quote it or use a different separator |
| Reporting "done" without running `npm test` / `npm run lint` / `npm run build` | The suites are fast (seconds) and catch RLS/role regressions | Run them and paste the pass/fail lines |

---

## 7. Domain facts you must not get wrong

- Roles: `owner` (everything), `manager` (all but staff/branches/settings; can cancel bills, pay suppliers, see reports), `pharmacist` (inventory, purchases, returns, alerts, billing; no cancel, no reports, no payments), `cashier` (POS + own sales; inventory view only; smaller discount cap). `is_platform_admin` is a separate flag on `profiles`, set only by `make-platform-admin.js`.
- Discount caps come from `pharmacies.settings.max_discount_pct` / `cashier_max_discount_pct` and are enforced in `create_sale` (`42501`).
- Document numbers: `INV/<FY>/00001` (prefix from settings), `RET/<FY>/n`, `GRN/<FY>/n`; FY starts 1 April.
- Returns: refund pro rata by `line_total`; restock to the original batch unless the batch is expired or reason ∈ {damaged, expired, adverse_reaction}; only `completed` bills can be cancelled.
- Alerts: thresholds `expiry_warning_days`, `expiry_critical_days`, `slow_moving_days`, `dead_stock_days` from settings; `refresh_alert_notifications` dedupes by `dedupe_key` (per batch, or per product per ISO week) and runs once per browser session per pharmacy from the notification bell (no cron job yet).
- Staff onboarding: `add_staff_member` RPC (no backend needed; pending invite auto-accepted on sign-up) or `POST /members` with `temporary_password` (needs service-role key).
- Storage paths start with `<pharmacy_id>/`; `invoice-extract` rejects any other path and downloads with the caller's client.
- Known gaps (do not claim they exist): inter-branch stock transfers (enum value only), CSV bulk import, prescription image storage, payment-provider billing, scheduled alert job.

---

## 8. Definition of done — run this before saying a task is complete

Run every applicable line and report the actual output. "Should work" is not done.

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

Then confirm, item by item:

1. **Read before write:** you read every file you changed and its callers/tests before editing (§0).
2. **Scope:** the whole request is implemented; anything left out is listed with the reason.
3. **Security:** no service-role or Anthropic key in the frontend; every new RPC has `require_role`, `security definer set search_path = ''`, grants/revokes; every new table has RLS + policies + FK indexes; cross-tenant references are blocked.
4. **Ledger integrity:** any stock change writes `stock_movements` + `audit_logs` inside the same RPC; no client path edits quantities, sales, purchases or returns.
5. **Migrations:** changes are in a new numbered file (no edits to applied ones), `supabase/setup-all.sql` regenerated, `npm run test:db` passes with the new file applied.
6. **Roles mirrored:** `frontend/src/lib/roles.js` matches SQL; the role test is updated.
7. **Tests added:** DB test for SQL changes (positive + negative), backend test for routes, logic test for shared maths. `npm test` shows the new tests passing (44 DB / 20 backend / 5 frontend was the baseline on 16 Nov 2026 — your counts should be ≥ those).
8. **Design:** tokens only, both themes checked, no horizontal scroll at 375 px, `PageHeader` + ui components used, empty/error/loading/forbidden states present, icon buttons labelled.
9. **Preview verified** for UI changes: open the `frontend` preview, exercise the screen (and the mobile viewport + dark mode where layout/theme changed), check the console for errors, and describe or screenshot what you saw. If you could not run it against a live Supabase project, say so.
10. **Docs:** README/`docs/SYSTEM_DESIGN.md` updated if commands, env vars, roles, RPC names or workflows changed; this file updated if a rule changed.
11. **Report honestly:** what was verified, what was not (hosted Supabase features, camera on a device, real Claude calls), and anything that failed with its output.
