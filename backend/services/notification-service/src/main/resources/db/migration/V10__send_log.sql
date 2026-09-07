-- V10 (SF-10, D18): send-log — nhật ký mọi email attempt của notification.
-- status: SENT | SKIPPED_NO_EMAIL | FAILED. attachment = PDF hóa đơn gắn được.
CREATE TABLE IF NOT EXISTS send_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID        NOT NULL,
    event_type   VARCHAR(64) NOT NULL,
    recipient    VARCHAR(255),
    subject      VARCHAR(500),
    status       VARCHAR(32) NOT NULL,
    attachment   BOOLEAN     NOT NULL DEFAULT FALSE,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_send_log_event_type_created ON send_log (event_type, created_at DESC);
