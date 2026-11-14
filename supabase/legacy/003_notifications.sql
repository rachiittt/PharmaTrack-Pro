-- ============================================
-- SPMS — Migration 003: Notifications
-- ============================================

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT CHECK (type IN ('expiry_expired', 'expiry_critical', 'expiry_warning', 'expiry_upcoming', 'low_stock')),
  title        TEXT,
  message      TEXT,
  medicine_id  UUID REFERENCES medicines(id),
  is_read      BOOLEAN DEFAULT FALSE,
  sent_via     TEXT[] DEFAULT ARRAY['in_app'],
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notifications" ON notifications FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
