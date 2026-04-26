-- ============================================
-- SPMS — Migration 002: Customers & Prescriptions
-- ============================================

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  date_of_birth   DATE,
  loyalty_points  INT DEFAULT 0,
  total_spent     NUMERIC(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own customers" ON customers FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_customers_phone ON customers(phone);

-- ============================================
-- PRESCRIPTIONS
-- ============================================
CREATE TABLE prescriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  customer_id       UUID REFERENCES customers(id),
  doctor_name       TEXT,
  doctor_reg_no     TEXT,
  prescription_date DATE,
  image_url         TEXT,
  notes             TEXT,
  is_fulfilled      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own prescriptions" ON prescriptions FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_prescriptions_user_id ON prescriptions(user_id);
CREATE INDEX idx_prescriptions_customer_id ON prescriptions(customer_id);

-- ============================================
-- PRESCRIPTION ITEMS
-- ============================================
CREATE TABLE prescription_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_name    TEXT NOT NULL,
  medicine_id      UUID REFERENCES medicines(id),
  dosage           TEXT,
  duration         TEXT,
  quantity         INT
);

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage prescription items" ON prescription_items FOR ALL
  USING (EXISTS (SELECT 1 FROM prescriptions WHERE prescriptions.id = prescription_items.prescription_id AND prescriptions.user_id = auth.uid()));

-- ============================================
-- Add FK constraints to sales (deferred from 001)
-- ============================================
ALTER TABLE sales ADD CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE sales ADD CONSTRAINT fk_sales_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id);
