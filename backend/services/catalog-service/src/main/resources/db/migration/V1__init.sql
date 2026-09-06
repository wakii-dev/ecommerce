-- V1: nền dùng chung — outbox + processed_messages (copy từ common-lib sql/outbox-schema.sql).
-- SF fork service thật: giữ block này, migrations domain của mình viết từ V10 trở đi
-- (V2-V9 reserve cho schema nền dùng chung tương lai).

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
