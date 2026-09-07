-- SF-15 (FI-325) — stock alert "nhắn tôi khi có hàng" (D22).
-- status: ACTIVE (đang chờ) → NOTIFIED (đã gửi email restock, đúng 1 lần).
-- Partial unique: 1 email đang chờ tối đa 1 alert/variant (idempotent đăng ký).
CREATE TABLE stock_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  varchar(254) NOT NULL,
  product_id  uuid NOT NULL,
  variant_id  uuid NOT NULL,
  status      varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','NOTIFIED')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE UNIQUE INDEX uq_stock_alerts_active ON stock_alerts(user_email, variant_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_stock_alerts_status ON stock_alerts(status);
CREATE INDEX idx_stock_alerts_variant ON stock_alerts(variant_id);
