-- ============================================
-- SPMS — Migration 005: Stock Adjustments & Returns
-- ============================================

-- ============================================
-- STOCK ADJUSTMENTS (damage, corrections, manual)
-- ============================================
CREATE TABLE stock_adjustments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  medicine_id  UUID REFERENCES medicines(id) ON DELETE CASCADE,
  adjustment   INT NOT NULL,  -- positive = add, negative = remove
  reason       TEXT CHECK (reason IN ('damage', 'expired_removal', 'correction', 'return', 'theft', 'other')),
  notes        TEXT,
  previous_qty INT NOT NULL,
  new_qty      INT NOT NULL,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own adjustments" ON stock_adjustments FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_stock_adjustments_user ON stock_adjustments(user_id);
CREATE INDEX idx_stock_adjustments_medicine ON stock_adjustments(medicine_id);
CREATE INDEX idx_stock_adjustments_created ON stock_adjustments(created_at);

-- ============================================
-- RETURNS / REFUNDS
-- ============================================
CREATE TABLE returns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  sale_id          UUID REFERENCES sales(id),
  invoice_no       TEXT NOT NULL,
  customer_id      UUID REFERENCES customers(id),
  return_reason    TEXT CHECK (return_reason IN ('defective', 'wrong_medicine', 'expired', 'customer_request', 'adverse_reaction', 'other')),
  notes            TEXT,
  refund_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  refund_method    TEXT DEFAULT 'cash' CHECK (refund_method IN ('cash', 'upi', 'card', 'store_credit')),
  status           TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'rejected')),
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own returns" ON returns FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_returns_user ON returns(user_id);
CREATE INDEX idx_returns_sale ON returns(sale_id);
CREATE INDEX idx_returns_created ON returns(created_at);

-- ============================================
-- RETURN ITEMS
-- ============================================
CREATE TABLE return_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id    UUID REFERENCES returns(id) ON DELETE CASCADE,
  medicine_id  UUID REFERENCES medicines(id),
  quantity     INT NOT NULL,
  unit_price   NUMERIC(10,2) NOT NULL,
  subtotal     NUMERIC(10,2) NOT NULL,
  restock      BOOLEAN DEFAULT TRUE  -- whether to add back to inventory
);

ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage return items" ON return_items FOR ALL
  USING (EXISTS (SELECT 1 FROM returns WHERE returns.id = return_items.return_id AND returns.user_id = auth.uid()));
