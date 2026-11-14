# Implementation summary

Date: 15 Nov 2026 · Branch `feat/pharmatrack-saas`

## What was built

### Commit 1: Supabase integration and pharmacy workflows
- **Seven migrations** (`supabase/migrations/2026111400000{1..7}_*.sql`) replacing the single-tenant schema:
  tenancy and roles, catalogue and batches, purchases/sales/returns/notifications/audit, transactional RPCs, RLS, read models, and platform admin plus the demo tenant.
- **Transactional RPCs** for every stock or money change: `create_sale`, `process_return`, `cancel_sale`, `receive_purchase`, `record_supplier_payment`, `adjust_stock`, `add_opening_stock`, `create_pharmacy`.
- **Read models** computed from live rows: `dashboard_summary`, `inventory_list`, `stock_alerts`, `refresh_alert_notifications`, `sales_report`, `supplier_summary`, `reorder_suggestions`, `expiry_risk`, `lookup_barcode`, `pos_search`, `get_sale`, `platform_overview`.
- **Backend** reduced to the work that needs secrets: staff invitations and AI (assistant and invoice OCR), with config validation, auth (no bypass), role guard, quotas, safe error mapping.
- **Frontend data layer**: Supabase client with the anon key only, domain services, session context, role map, barcode normalisation, USB-scanner hook, pricing previews.
- **Tests and docs**: database, backend and frontend suites; technical audit; system design.

### Commit 2: UI redesign and application experience
- A design system built on CSS tokens (light and dark): Button, Field/Input/Select, Badge, Panel, DataTable with pagination, Modal/Drawer/ConfirmDialog, loading/empty/error/permission states, Stat, Segmented control, an **expiry runway bar**, and a stock level meter.
- App shell with role-aware sidebar navigation, pharmacy and branch switchers, a real-time notification bell, a theme toggle and a demo badge.
- Screens, each with a layout suited to its job:
  - **POS**: search-first, keyboard-driven (`/`, arrow keys, Enter, `F9`), sticky checkout panel.
  - **Inventory**: table-first, with filters and an expiry bar per product.
  - **Product detail**: batches, adjustments and the stock ledger.
  - **Purchases**: a dense line editor, optional AI invoice draft, payables.
  - Also: sales and returns, alerts (6 tabs), reports and CSV exports, staff and the audit log, settings (profile, pharmacy, thresholds, branches), assistant, notifications, platform admin, auth (login, sign-up, password reset), onboarding, and a "Supabase not configured" screen.
- Rebuilt **barcode scanner** (camera, USB wedge, manual entry; checksum validation; unknown-code registration).
- Printable A4 GST tax invoice (print or save as PDF).
- Removed every hard-coded or random demo dataset and the fake scan; dropped `axios`, `framer-motion`, `qrcode` and `xlsx`.

## Problems found → resolution
| Problem | Resolution |
|---|---|
| `Bearer demo_token…` granted admin access | Removed; every request is verified with Supabase Auth |
| Users could set their own role or plan | Profile and pharmacy protection triggers; roles live in `pharmacy_members`, which only the owner can change |
| Service-role key used for all queries (RLS ineffective) | Browser and backend use the caller's JWT; the service role is limited to Auth admin calls and metering |
| Non-atomic billing, client prices, no idempotency | `create_sale` locks batches, prices from the database, idempotency key, all-or-nothing |
| Barcode lookup leaked other tenants' data | `lookup_barcode` is scoped to the caller's pharmacy |
| Fake dashboard and demo arrays | All numbers come from RPCs; the demo tenant lives in the database |
| Scanner never worked | See the audit, §2 "Medicine scanning"; rewritten and wired into POS, Inventory and Purchases |
| Returns route unmounted; MedicineDetail unrouted | `process_return` / `cancel_sale` with UI; product detail page routed |

## Verification performed
| Check | Result |
|---|---|
| `npm run test:db`: 41 Postgres tests (PGlite, RLS enforced as `authenticated`) | **41 / 41 pass** |
| `npm test --prefix backend`: auth, roles, invites, AI loop, invoice draft | **19 / 19 pass** |
| `npm test --prefix frontend`: barcode checksums, pricing parity with SQL, role map | **5 / 5 pass** |
| `npm run lint`: backend syntax, frontend ESLint (react-hooks v7 rules) | **clean** |
| `npm run build`: Vite production build | **succeeds** |
| Browser check: login (desktop/dark, mobile/light), network-error message, "not configured" screen, no horizontal scroll at 375 px | **pass** |

The requested workflow checklist, as covered by the database tests:

1. **Register and log in:** profile created from `auth.users`. The real Supabase Auth UI flow was **not** run (no project available).
2. **Create a pharmacy:** `create_pharmacy`, with its default branch and owner membership.
3. **Add staff and assign roles:** service-role insert as the backend does it; roles enforced afterwards.
4. **Add a medicine:** pharmacist insert under RLS; the cashier is denied; duplicate barcodes are rejected.
5. **Add stock with a purchase:** batches, ledger rows, GST total, payable status, duplicate-invoice rejection, expired and MRP checks.
6. **Barcode lookup:** found, with batches in FEFO order; an unknown code returns nothing.
7. **Generate a bill:** FEFO across two batches, database prices (a client-supplied price is ignored), inclusive GST, invoice numbering.
8. **Stock deduction:** verified per batch; overselling rolls back completely; the retry with the same key does not double-deduct.
9. **Return:** pro-rata refund, restocked to the original batch, over-returns rejected, damaged returns not restocked.
10. **Stock adjustments:** reason required, cannot go negative, cashier denied; ledger sum equals quantity for every batch.
11. **Expiry and low-stock alerts:** correct classification; notifications deduplicated.
12. **Reports and dashboard:** dashboard revenue equals net sales in the database; reorder and sales report run.
13. **Tenant isolation:** a second pharmacy sees zero rows across 12 tables and is denied on every RPC. Cross-tenant references are blocked and suspended pharmacies lose access.

Plus: platform admin restricted, and the demo seed is service-role only, repeatable and ledger-consistent, with clean removal.

## Not verified (needs credentials or services)
- **Against a hosted Supabase project:** the Supabase-specific parts of the migrations (`storage.buckets`, storage policies, the realtime publication) are skipped by PGlite. Auth emails, the realtime bell and invoice uploads also need a live project. The repository's `backend/.env` contains placeholder (`dummy_…`) credentials.
- **Signed-in screens in the browser:** they compile, lint and use the tested RPCs, but were not clicked through against live data.
- **AI calls to Claude:** no `ANTHROPIC_API_KEY` is available. The tool loop, refusal handling, output validation and quotas are tested with a fake client.
- **Camera scanning on a physical device:** the logic and checksum handling are unit-tested; camera access needs HTTPS or localhost and a device with a camera.

## Remaining configuration
1. Create a Supabase project, `supabase db push`, and set the Auth Site URL and redirect URLs (see README §3).
2. Fill `backend/.env` and `frontend/.env.local` from the examples.
3. Optional: `ANTHROPIC_API_KEY` for the assistant and invoice reading; `npm run seed:demo` for the demo tenant; `npm run platform-admin -- <email>`.

## Known limitations and next steps
- Alert notifications refresh when staff open the app; a scheduled server-side job (pg_cron with a service wrapper) is not included.
- Stock transfers between branches have an enum value but no workflow yet.
- Bulk product import (CSV) was removed with the vulnerable `xlsx` dependency and should be re-added with a CSV parser.
- Prescriptions are captured as patient and doctor on the bill; prescription image storage is not implemented.
- Subscription billing is tracked (`plan`, `plan_renews_at`) but not connected to a payment provider.
