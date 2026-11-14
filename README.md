# PharmaTrack Pro

PharmaTrack Pro is pharmacy management software for independent medical shops and small chains. It tracks stock **batch by batch**, bills from the earliest-expiring stock first (FEFO), receives supplier invoices, warns about expiry and low stock, and reports sales and GST. Every figure comes from the pharmacy's own records in Supabase.

Each pharmacy is a separate tenant. Postgres Row Level Security and transactional database functions make sure a pharmacy only ever sees its own data, and that stock and money cannot drift.

- [Technical audit](docs/TECHNICAL_AUDIT.md): what was wrong with the previous version
- [System design](docs/SYSTEM_DESIGN.md): architecture, data model, security model, workflows, AI design
- [Implementation summary](docs/IMPLEMENTATION_SUMMARY.md): what was built, what was tested, and what still needs configuration

---

## Features

| Area | What it does |
|---|---|
| **Point of sale** | Scan (camera or USB scanner) or search, adjust quantities and discounts, take cash/UPI/card/credit, print a GST tax invoice. Stock is allocated FEFO across batches and never sold expired. Schedule H/H1/X items require the patient and doctor. Retries are safe (idempotent). |
| **Inventory** | Products with generic name, composition, manufacturer, barcode, category, schedule, HSN, GST, rack, minimum level and usual supplier. Batch-wise stock with mfg/expiry dates, purchase price, selling price and MRP. Search, category and status filters, CSV export, archive instead of delete. |
| **Barcode scanning** | Native `BarcodeDetector` or ZXing fallback, EAN/UPC/Code-128/Code-39/ITF/QR/DataMatrix, USB/Bluetooth wedge scanners anywhere in the app, manual entry. Codes are checksum-validated, unknown codes show an error and offer **Register product**. |
| **Purchases** | Receive stock against a supplier invoice: batch, mfg, expiry, quantity, free quantity, rate, MRP, selling price, GST. Creates or tops up batches, records the payable and due date, attaches the invoice copy. Supplier payments and outstanding/overdue tracking. |
| **Returns & cancellations** | Partial or full returns with pro-rata refunds and automatic restocking (not for damaged/expired/adverse-reaction returns). Owners/managers can cancel a bill with a reason, and all stock is restored. |
| **Stock ledger** | Every change (opening, purchase, sale, return, cancel, adjustment, damage, expiry write-off) is an immutable movement with balance and user. |
| **Alerts** | Expired, expiring (critical/warning), low stock, out of stock, slow-moving and dead stock, using thresholds each owner configures. Deduplicated notifications delivered in real time. |
| **Dashboard & reports** | Today's sales, period sales vs previous period, gross profit, stock value at cost/MRP, expiry exposure, payables, trend, top products, payment mix. Daily sales, GST summary (CGST/SGST), supplier-wise purchases, stock valuation, all exportable as CSV. |
| **Staff & roles** | Owner, manager, pharmacist and cashier, optionally pinned to a branch. Invite by email or set a temporary password. Activity (audit) log. |
| **Multi-branch** | Stock, bills and purchases per branch; branch switcher for owners and managers. |
| **Platform admin** | Super-admin view of all pharmacies, plans, status (suspend/reactivate), platform GMV and activity. |
| **Assistant (AI)** | Ask questions about stock, expiry, reordering and sales. Reorder suggestions and expiry-risk tables are computed in SQL and work without AI. Optional invoice OCR fills the purchase form as a draft for review. |

## Technology

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 6, Recharts, lucide-react, react-hot-toast, `@zxing/library` (lazy-loaded) |
| Data & auth | Supabase: Postgres 15+, Auth, Row Level Security, RPC functions, Realtime, Storage |
| Backend | Node 20+, Express 5, zod, helmet, express-rate-limit, `@anthropic-ai/sdk` |
| AI | Claude (`claude-opus-5-5` by default) via the backend only |
| Tests | Node test runner; PGlite (real Postgres in WebAssembly) for database tests |

```
frontend/            React app (browser talks to Supabase directly under RLS)
  src/lib/           Supabase client, API client, formatting, pricing, barcode, roles, CSV
  src/services/      one module per domain (inventory, sales, purchases, …)
  src/context/       session, pharmacy and branch selection
  src/components/    design system (ui/), layout, scanner, inventory, sales
  src/pages/         screens
backend/             Express API for secret-bearing work only (staff invites, AI)
supabase/migrations/ schema, RLS, workflow RPCs, read models, platform + demo seed
supabase/tests/      end-to-end database tests (PGlite)
docs/                audit, system design, implementation summary
```

---

## Getting started

### 1. Prerequisites
- Node.js 20 or newer
- A Supabase project (free tier works), or the Supabase CLI with Docker for a local stack
- Optional: an Anthropic API key for the assistant and invoice reading

### 2. Install
```bash
npm run install:all
```

### 3. Supabase configuration
1. **Create a project** at supabase.com and note the project URL, the `anon` key and the `service_role` key (Project Settings → API).
2. **Apply the migrations** in `supabase/migrations`, in filename order. With the CLI:
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   Or paste each file, in order, into the SQL editor. The migrations create the tables, RLS policies, functions, the private storage buckets `pharmacy-assets` and `purchase-invoices`, and add `notifications`, `sales` and `medicine_batches` to the `supabase_realtime` publication.
3. **Auth settings** (Authentication → URL configuration): set the Site URL to your frontend (e.g. `http://localhost:5173`) and add `http://localhost:5173/reset-password` to the redirect URLs. Email confirmation can stay on; sign-up will then ask users to confirm their email.
4. The old single-tenant migrations are kept for reference in `supabase/legacy/`. **Do not apply them.**

### 4. Environment variables

`backend/.env` (copy from `backend/.env.example`):

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Project URL |
| `SUPABASE_ANON_KEY` | yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server only.** Used for staff invites and usage metering |
| `FRONTEND_URL` | yes | Allowed CORS origin(s), comma-separated |
| `PORT` | no | Default `5001` |
| `ANTHROPIC_API_KEY` | no | Enables the assistant and invoice reading |
| `AI_MODEL` | no | Default `claude-opus-5-5` |
| `AI_DAILY_LIMIT_PER_PHARMACY` | no | Default `200` requests/day |
| `DEMO_PASSWORD` | for demo seed | Password for the three demo logins |

`frontend/.env.local` (copy from `frontend/.env.example`). Everything here is public:

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | Same project URL |
| `VITE_SUPABASE_ANON_KEY` | Same anon key, **never the service-role key** |
| `VITE_API_URL` | Backend base URL; `/api` in development (Vite proxies to port 5001) |

### 5. Run
```bash
npm run dev            # backend on :5001 and frontend on :5173
```
Open http://localhost:5173, create an account, then create your pharmacy. You become its owner.

### 6. Demo data (optional)
```bash
DEMO_PASSWORD='choose-a-strong-password' npm run seed:demo
```
This creates three logins (`demo.owner@pharmatrack.demo`, `demo.pharmacist@…`, `demo.cashier@…`) and rebuilds one pharmacy named **“[DEMO] Sanjeevani Pharmacy”** with 30 products, 4 suppliers, two branches, purchases, about 60 days of sales, a return, a cancellation, expiring and expired batches, and slow and dead stock.

- All of it is stored in Supabase and flagged `is_demo = true`. The app shows a **Demo data** badge.
- Re-running it deletes and rebuilds **only** the demo pharmacy (fixed id), so it never duplicates rows or touches real pharmacies.
- Stock enters through `receive_purchase` and leaves through `create_sale`, the same code paths as a real shop, so the dashboard and alerts are computed exactly as they would be for a customer.
- Remove it with `delete from pharmacies where is_demo;` (child rows cascade). The app works the same without it.

### 7. Platform administrator
```bash
npm run platform-admin -- you@example.com            # grant
npm run platform-admin -- you@example.com --revoke   # revoke
```
This flag cannot be set from the app; it needs the service-role key.

---

## User roles

| Capability | Owner | Manager | Pharmacist | Cashier |
|---|:-:|:-:|:-:|:-:|
| Billing (POS), own sales history | ✓ | ✓ | ✓ | ✓ |
| All sales, returns | ✓ | ✓ | ✓ | – |
| Cancel a bill | ✓ | ✓ | – | – |
| Inventory edits, stock adjustments, purchases | ✓ | ✓ | ✓ | view only |
| Supplier payments, reports, audit log | ✓ | ✓ | – | – |
| Dashboard, alerts, assistant | ✓ | ✓ | ✓ | – |
| Staff, branches, pharmacy settings & thresholds | ✓ | – | – | – |
| Discount limit | manager limit | manager limit | manager limit | cashier limit |

The **platform super-admin** is a separate flag on the profile. Platform admins can manage pharmacies (status, plan) but cannot read a pharmacy's business data unless they are a member of it.

The UI hides what a role cannot use, but enforcement is in the database: RLS policies and role checks inside every RPC. `supabase/tests` verifies this, including that one pharmacy cannot read or act on another's data.

---

## AI integration

- Runs only on the backend. The API key never reaches the browser.
- The assistant calls **read-only tools** that execute the pharmacy's own RPCs with the **signed-in user's** token, so RLS scopes every answer. No tool exposes customer, prescription or staff data.
- Numbers come from deterministic SQL (`reorder_suggestions`, `expiry_risk`, `stock_alerts`, `dashboard_summary`). The model explains them, and the same tables are shown in the UI without AI.
- It never changes stock, prices or bills. Reorder and write-off suggestions need a person to act.
- It declines diagnosis, dosing, interaction and substitution questions.
- **Invoice reading** uploads the file to private storage, extracts it with a strict JSON schema, validates the result, matches it to the catalogue and returns a **draft** with per-line warnings. The user reviews it and saves through the normal purchase validation.
- Per-pharmacy daily quota. Usage metadata (not prompt text) is stored in `ai_requests`.

Planned: natural-language reports over `sales_report`, better demand forecasting than moving averages, and supplier price comparison. See [SYSTEM_DESIGN.md §7](docs/SYSTEM_DESIGN.md#7-ai-architecture).

---

## Testing

```bash
npm test          # database + backend + frontend suites
npm run test:db   # 41 Postgres tests: workflows, FEFO, idempotency, RLS, tenant isolation, demo seed
npm run lint      # backend syntax check + frontend ESLint
npm run build     # production frontend build
```
The database tests apply every migration to an in-process Postgres (PGlite) with a stub of Supabase's `auth` schema and run as the `authenticated` role, so RLS is enforced exactly as in Supabase.

## Deployment

1. **Database**: `supabase db push` to the production project, then set Auth URLs to the production domain.
2. **Backend** (Render, Railway, Fly.io or any Node host): `npm start` in `backend/` with the environment variables above. Set `FRONTEND_URL` to the deployed frontend origin. Put it behind HTTPS.
3. **Frontend** (Vercel, Netlify, Cloudflare Pages): build command `npm run build` in `frontend/`, output `dist/`. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` (e.g. `https://api.example.com/api`). Add an SPA fallback so every path serves `index.html`.
4. Camera scanning needs HTTPS (or `localhost`). USB scanners and manual entry work anywhere.

## Security notes
- Never commit `.env` files. Only `*.env.example` files are tracked.
- The service-role key belongs only on the backend server.
- If a real service-role key was ever used in development, rotate it in Supabase before going live.
