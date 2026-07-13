# PharmaTrack Pro — Smart Pharmacy Management System

> Production-ready, multi-tenant SaaS for Indian pharmacy operations. Solves expiry losses, stock chaos, and slow billing.

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm 10+
- A Supabase project (free tier works)

### 1. Setup Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_customers_prescriptions.sql`
   - `supabase/migrations/003_notifications.sql`
3. Copy your project URL and keys

### 2. Backend
```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npm run dev
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS v4 |
| Backend | Node.js 20 + Express 5 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) |
| Charts | Recharts |
| Icons | Lucide React |

## 📁 Project Structure

```
PharmaTrack-Pro/
├── frontend/          React + Vite + Tailwind
│   └── src/
│       ├── components/  UI, Layout, Charts, Domain
│       ├── pages/       12 page components
│       ├── context/     Auth, Cart, Alert
│       ├── services/    API layer (Axios)
│       ├── hooks/       Custom hooks
│       └── utils/       Formatters, expiry, WhatsApp
├── backend/           Express REST API
│   └── src/
│       ├── routes/      10 route modules
│       ├── middleware/  Auth, Validation, Errors
│       └── db/queries/  SQL query layer
└── supabase/          Migration files
```

## 🔐 Demo Credentials
- **Admin**: admin@pharmacy.com / Admin123!
- **Staff**: staff@pharmacy.com / Staff123!

## ⚡ Key Features
- 🔍 5-tier expiry tracking (Expired → Critical → Warning → Upcoming → Healthy)
- 📷 Barcode scanning (camera + USB)
- 📊 Bulk Excel/CSV import
- 🛒 POS with cart, GST, discounts
- 📈 Analytics dashboard with Recharts
- 💬 WhatsApp reorder integration
- 🌙 Dark mode
- 📱 Responsive design

## 📋 License
Proprietary — PharmaTrack Pro © 2026
