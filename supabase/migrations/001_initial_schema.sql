-- ============================================
-- SPMS — Migration 001: Initial Schema
-- Core tables: users, branches, suppliers, medicines, sales
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS
-- ============================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  full_name       TEXT,
  role            TEXT DEFAULT 'pharmacist' CHECK (role IN ('admin', 'pharmacist', 'owner')),
  pharmacy_name   TEXT,
  phone           TEXT,
  gst_number      TEXT,
  logo_url        TEXT,
  plan            TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- BRANCHES (multi-branch pharmacy chains)
-- ============================================
CREATE TABLE branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own branches" ON branches FOR ALL USING (owner_id = auth.uid());

-- ============================================
-- SUPPLIERS
-- ============================================
CREATE TABLE suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  contact_person  TEXT,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  gst_number      TEXT,
  whatsapp_number TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own suppliers" ON suppliers FOR ALL USING (user_id = auth.uid());

-- ============================================
-- MEDICINES
-- ============================================
CREATE TABLE medicines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  branch_id        UUID REFERENCES branches(id),
  supplier_id      UUID REFERENCES suppliers(id),
  name             TEXT NOT NULL,
  generic_name     TEXT,
  manufacturer     TEXT,
  batch_no         TEXT NOT NULL,
  category         TEXT CHECK (category IN ('Tablet', 'Capsule', 'Syrup', 'Injection', 'Topical', 'Other')),
  quantity         INT NOT NULL DEFAULT 0,
  min_stock_level  INT DEFAULT 10,
  unit             TEXT DEFAULT 'strips',
  cost_price       NUMERIC(10,2) NOT NULL,
  selling_price    NUMERIC(10,2) NOT NULL,
  mrp              NUMERIC(10,2),
  expiry_date      DATE NOT NULL,
  barcode          TEXT,
  hsn_code         TEXT,
  is_archived      BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own medicines" ON medicines FOR ALL USING (user_id = auth.uid());

-- Performance indexes
CREATE INDEX idx_medicines_user_id ON medicines(user_id);
CREATE INDEX idx_medicines_barcode ON medicines(barcode);
CREATE INDEX idx_medicines_expiry_date ON medicines(expiry_date);
CREATE INDEX idx_medicines_user_expiry ON medicines(user_id, expiry_date);
CREATE INDEX idx_medicines_category ON medicines(category);
CREATE INDEX idx_medicines_name ON medicines(name);
CREATE UNIQUE INDEX idx_medicines_user_batch ON medicines(user_id, batch_no) WHERE is_archived = FALSE;

-- ============================================
-- SALES
-- ============================================
CREATE TABLE sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  branch_id        UUID REFERENCES branches(id),
  customer_id      UUID,  -- FK added in migration 002
  prescription_id  UUID,  -- FK added in migration 002
  invoice_no       TEXT UNIQUE NOT NULL,
  discount_pct     NUMERIC(5,2) DEFAULT 0,
  subtotal         NUMERIC(10,2) NOT NULL,
  tax_amount       NUMERIC(10,2) DEFAULT 0,
  total_amount     NUMERIC(10,2) NOT NULL,
  payment_method   TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'upi', 'card')),
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sales" ON sales FOR ALL USING (user_id = auth.uid());

CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_user_id ON sales(user_id);
CREATE INDEX idx_sales_payment_method ON sales(payment_method);

-- ============================================
-- SALE ITEMS
-- ============================================
CREATE TABLE sale_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id      UUID REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id  UUID REFERENCES medicines(id),
  quantity     INT NOT NULL,
  unit_price   NUMERIC(10,2) NOT NULL,
  subtotal     NUMERIC(10,2) NOT NULL
);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage sale items via sales" ON sale_items FOR ALL 
  USING (EXISTS (SELECT 1 FROM sales WHERE sales.id = sale_items.sale_id AND sales.user_id = auth.uid()));

-- ============================================
-- AUDIT LOG
-- ============================================
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  action      TEXT CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'SALE', 'IMPORT')),
  table_name  TEXT,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own audit log" ON audit_log FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own audit log" ON audit_log FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================
-- Auto-update updated_at trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_medicines_updated_at
  BEFORE UPDATE ON medicines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
