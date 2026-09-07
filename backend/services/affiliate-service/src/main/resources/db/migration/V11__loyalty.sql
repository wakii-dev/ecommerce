-- V11 (SF-14, D22): loyalty điểm — file-slice riêng trong affiliate-service
-- (cùng nhà ledger hoa hồng, pack: "tables trong affiliate-service").
-- Quy đổi (quyết định spec D3): 1 điểm = 100đ → earn 1% = total/10000 điểm.
-- EARN: consume order.confirmed (1 entry/đơn — UNIQUE(order_id, type)).
-- REDEEM: ordering gọi internal /loyalty/redeem khi checkout dùng điểm
--         (1 entry/đơn — dedupe + idempotency lớp 2 sau marker eventId).
-- ADJUST: admin chỉnh tay (order_id NULL — không rơi vào UNIQUE theo order).
-- points là DELTA có dấu: EARN >0, REDEEM <0, ADJUST ±; balance = Σ delta.

CREATE TABLE loyalty_accounts (
    user_id      UUID PRIMARY KEY,
    balance      BIGINT      NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_earned BIGINT      NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_ledger (
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL,
    order_id   VARCHAR(64),                      -- NULL với ADJUST thủ công
    type       VARCHAR(8)   NOT NULL CHECK (type IN ('EARN', 'REDEEM', 'ADJUST')),
    points     BIGINT       NOT NULL,           -- delta có dấu (xem đầu file)
    note       VARCHAR(500),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- idempotency theo đơn: 1 EARN + 1 REDEEM / order (loại trừ ADJUST order NULL)
    CONSTRAINT uq_loyalty_ledger_order_type UNIQUE (order_id, type)
);

CREATE INDEX idx_loyalty_ledger_user ON loyalty_ledger (user_id, created_at DESC);
