# Technical audit — PharmaTrack Pro (before the rebuild)

Audit date: 14 Nov 2026 · Baseline commit `3f2ad4d`

## 1. Architecture found

```
React 19 + Vite + Tailwind 4 (frontend/)
  └─ axios → /api (Vite proxy) → Express 5 (backend/)
                                   └─ supabase-js with SERVICE-ROLE key → Postgres
```

- 13 pages, 3 React contexts (Auth, Cart, Alert), 1 axios service.
- Express exposed 11 route files backed by 7 query modules. Every query used the
  **service-role client**, so Row Level Security never applied; tenancy relied on
  `.eq('user_id', …)` filters in JavaScript.
- 5 SQL migrations defined a single-tenant schema keyed on a custom `users` table
  (one user = one pharmacy). Stock was a single `quantity` column on each
  `medicines` row; each batch was a separate "medicine".
- Supabase credentials in `backend/.env` were placeholders (`dummy_…`), so nothing
  had ever reached a real database.

## 2. Problems

### Security (critical)
| # | Issue | Where |
|---|---|---|
| S1 | **Authentication bypass.** Any request with `Authorization: Bearer demo_token…` was treated as an admin. | `backend/src/middleware/requireAuth.js` |
| S2 | Hard-coded demo credentials accepted by the API and by the browser (`admin@pharmacy.com` / `Admin123!`). | `routes/auth.js`, `context/AuthContext.jsx` |
| S3 | **Privilege escalation.** `PUT /auth/profile` wrote `req.body` straight into `users`, so a user could set their own `role` or `plan`. | `routes/auth.js` |
| S4 | Signup accepted `role` from the client. | `routes/auth.js` |
| S5 | Service-role key used for every query → RLS policies were decorative. | `db/supabase.js`, all queries |
| S6 | `lookupBarcode` searched **all tenants'** medicines, leaking other pharmacies' prices. | `queries/medicines.js` |
| S7 | Search strings interpolated into PostgREST `or()` filters without escaping. | `queries/medicines.js` |
| S8 | Error handler returned raw database messages to clients. | `middleware/errorHandler.js` |
| S9 | Bulk import used `xlsx@0.18.5` (known prototype-pollution / ReDoS advisories). | `frontend/package.json` |

### Correctness
| # | Issue |
|---|---|
| C1 | **Non-atomic billing.** A sale was inserted, then items one by one, then stock was read and written back (`max(0, qty - sold)`). Concurrent bills oversold; a failure midway left a sale with partial items and partial stock deduction; overselling was silently clamped to 0. |
| C2 | Prices and totals came from the client; the server trusted `unit_price` and `total_amount`. |
| C3 | No idempotency — a retried checkout created a duplicate bill and deducted stock twice. |
| C4 | No FEFO: the cashier picked a "medicine" row, which was really one batch. |
| C5 | Returns route existed but was never mounted (`app.js`). |
| C6 | `MedicineDetail` page existed but had no route. |
| C7 | Invoice numbers generated in the browser (`UNIQUE` across *all* tenants → collisions between pharmacies). |
| C8 | Expiry status computed after pagination, so filters returned short pages. |

### Fake or hard-coded data
- `Dashboard.jsx`: KPIs, 30-day trend (`Math.random()`), top sellers, categories, alerts, recent sales, low-stock and expiring lists were constants, shown first and kept if the API failed.
- `Inventory.jsx`, `Billing.jsx`, `Customers.jsx`: `DEMO_*` arrays used whenever "demo mode" was on or the API failed; saves in demo mode only showed a toast.
- `Signup`: on network error, silently created a fake local account.
- Analytics, Prescriptions, Sales History, Expiry Alerts: same pattern.

### Medicine scanning (why it failed)
1. **The Inventory "scan" was a simulation**: `handleSimulatedScan()` waited 2 s and filled the form with a hard-coded *Aspirin 500mg* — no camera, no decoding.
2. The real `BarcodeScanner` component was **never used by any page**.
3. Inside it: `listVideoInputDevices()` ran before camera permission, which returns an empty list on Safari/Firefox → it fell back to "No camera found".
4. The `<video>` lacked `playsInline`/`muted`, so iOS Safari never played the stream.
5. The decode callback closed over a stale `lastScanned` (always `null`), so a code in view fired `onScan` on every frame.
6. No HTTPS/secure-context check (camera APIs are unavailable on `http://<LAN-IP>`).
7. Billing had no scanner at all; USB scanners only worked by accident through the search box.
8. No checksum validation → misreads could match the wrong product.

### Code quality
- Repeated hex colours in every component instead of tokens; large page files (Dashboard 472 lines) mixing data, demo data and UI.
- `framer-motion` animations on nearly every element; identical card layouts on every page.
- `drugInteractions.js` shipped clinical advice (out of scope and risky for a POS).
- Unused dependencies (`uuid`, `compression` loaded via try/catch, `qrcode`).
- No tests; `npm test` scripts were placeholders.

## 3. Missing functionality
Multi-pharmacy tenancy and branches · staff management and roles · batch-level stock · purchase receiving / GRN · supplier payables · stock ledger · configurable alert thresholds · slow-moving / dead stock · cancellations · real invoices · platform admin · demo tenant in the database · AI foundation.

## 4. Database requirements
- Tenant table (`pharmacies`) with branches and a membership table carrying a role.
- Stock on **batches**, not products; quantity changes only through audited transactions.
- Append-only stock ledger whose sum equals batch quantity.
- Transactional RPCs for sale, return, cancel, purchase, payment and adjustment, with row locks (`FOR UPDATE`), server-side prices, idempotency keys and gap-free per-tenant numbering.
- RLS on every table using membership-based helper functions; cross-tenant FK checks.
- Indexes on every FK and on the FEFO path `(product_id, branch_id, expiry_date) WHERE quantity > 0`.

## 5. Recommended architecture (implemented)
- **Supabase is the system of record and the security boundary**: RLS + `SECURITY DEFINER` RPCs that re-check the caller's role.
- **Browser → Supabase directly** with the anon key and the user's JWT for all business data.
- **Express backend only for secrets**: staff invitations (Auth admin API) and AI (Anthropic key, quotas, validation).
- Frontend split into `lib/` (clients, formatting, pricing, barcode), `services/` (one module per domain), `hooks/`, `context/` and UI.

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for the resulting design.
