-- Shared snippet: transactional outbox + consumer idempotency (SF-1 common-lib).
-- Convention: service copy nội dung file này vào migration V1__init.sql của mình
-- (Flyway không include cross-jar; giữ file này là nguồn duy nhất, không sửa hand).

CREATE TABLE IF NOT EXISTS outbox (
    id             UUID PRIMARY KEY,
    event_type     VARCHAR(128) NOT NULL,
    payload        JSONB        NOT NULL,
    correlation_id VARCHAR(64),
    status         VARCHAR(16)  NOT NULL,
    attempts       INT          NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    sent_at        TIMESTAMPTZ,
    last_error     VARCHAR(1024)
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, id);

CREATE TABLE IF NOT EXISTS processed_messages (
    message_id   VARCHAR(64) PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
