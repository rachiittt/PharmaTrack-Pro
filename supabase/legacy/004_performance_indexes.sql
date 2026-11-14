-- ============================================
-- SPMS — Migration 004: Performance Indexes & sale_items.created_at
-- ============================================

-- Add created_at to sale_items (was missing, causing analytics date filters to silently fail)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Set created_at on existing rows to match the parent sale's created_at
UPDATE sale_items si
SET created_at = s.created_at
FROM sales s
WHERE si.sale_id = s.id
  AND si.created_at IS NULL;

-- ============================================
-- Performance Indexes
-- ============================================

-- sale_items: fast lookup by sale (JOIN performance)
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);

-- sale_items: fast lookup by medicine (inventory deduction, analytics)
CREATE INDEX IF NOT EXISTS idx_sale_items_medicine_id ON sale_items(medicine_id);

-- sale_items: date-based analytics filtering (top sellers, trends)
CREATE INDEX IF NOT EXISTS idx_sale_items_created_at ON sale_items(created_at);

-- sales: fast customer purchase history lookups
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);

-- prescriptions: fast filtering by fulfillment status
CREATE INDEX IF NOT EXISTS idx_prescriptions_is_fulfilled ON prescriptions(is_fulfilled);

-- medicines: composite index for low-stock queries
CREATE INDEX IF NOT EXISTS idx_medicines_user_qty ON medicines(user_id, quantity, min_stock_level) WHERE is_archived = FALSE;
