-- V10: domain payment (SF-5) — payment_intents (Stripe).
-- V2-V9 reserve cho schema nền dùng chung (convention template SF-1).

CREATE TABLE payment_intents (
    id               UUID PRIMARY KEY,
    order_id         VARCHAR(64) NOT NULL,
    stripe_intent_id VARCHAR(128) UNIQUE,                  -- pi_... (null khi chưa tạo được — degraded/retry)
    amount_vnd       BIGINT NOT NULL CHECK (amount_vnd > 0), -- VND zero-decimal nguyên (D10)
    currency         VARCHAR(8)  NOT NULL,                 -- 'VND' uppercase thống nhất
    status           VARCHAR(32) NOT NULL,                 -- CREATED|REQUIRES_CONFIRMATION|SUCCEEDED|FAILED|VOIDED|REFUNDED (pack enum)
    idempotency_key  VARCHAR(128) NOT NULL UNIQUE,          -- ordering sinh 1 lần; retry dùng lại
    payload_hash     VARCHAR(64) NOT NULL,                  -- sha256(orderId|amount|currency) — replay mismatch → 409
    client_secret    VARCHAR(255),                          -- FE Stripe Elements confirm
    stripe_status    VARCHAR(32),                           -- mirror status Stripe (response contract enum) — replay không gọi lại adapter
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_order ON payment_intents (order_id);
