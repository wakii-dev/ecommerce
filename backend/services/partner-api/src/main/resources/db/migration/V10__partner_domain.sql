-- V10: domain partner (SF-11, D19) — partners + api_keys + refs + webhook deliveries.
-- (V2-V9 reserve cho schema nền dùng chung tương lai — convention template-service.)

CREATE TABLE partners (
    id                UUID PRIMARY KEY,
    name              VARCHAR(255) NOT NULL,
    status            VARCHAR(16)  NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    webhook_url       VARCHAR(512),
    webhook_secret    VARCHAR(128) NOT NULL,
    rate_limit_per_min INT         NOT NULL DEFAULT 60,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id         UUID PRIMARY KEY,
    partner_id UUID NOT NULL REFERENCES partners(id),
    -- SHA-256 hex của raw key — raw key KHÔNG BAO GIỜ lưu DB (chỉ in 1 lần lúc seed)
    key_hash   VARCHAR(64) NOT NULL,
    -- 8 ký tự đầu của raw key — nhận diện + lookup trước constant-time compare
    prefix     VARCHAR(16) NOT NULL,
    scopes     VARCHAR[]   NOT NULL,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_prefix ON api_keys (prefix);

-- Idempotency partnerRef theo partner (layer 1 — layer 2 là Idempotency-Key
-- deterministic gửi ordering, xem OrderingClient).
CREATE TABLE partner_order_refs (
    id         UUID PRIMARY KEY,
    partner_id UUID NOT NULL REFERENCES partners(id),
    partner_ref VARCHAR(128) NOT NULL,
    order_id   UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_partner_order_ref UNIQUE (partner_id, partner_ref),
    -- 1 đơn thuộc đúng 1 partner — lookup webhook theo order_id O(1)
    CONSTRAINT uq_partner_order UNIQUE (order_id)
);

-- DLQ dạng bảng (ADR-11b): delivery PENDING → DELIVERED | DEAD (quá
-- max-attempts); payload + last_error giữ nguyên cho ops tra cứu/replay.
CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY,
    partner_id      UUID NOT NULL REFERENCES partners(id),
    event_id        UUID NOT NULL,
    order_id        UUID NOT NULL,
    order_status    VARCHAR(16) NOT NULL,
    payload         TEXT NOT NULL,
    attempts        INT  NOT NULL DEFAULT 0,
    delivery_status VARCHAR(16) NOT NULL CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'DEAD')),
    next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      VARCHAR(512),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at    TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_due ON webhook_deliveries (delivery_status, next_retry_at);
