-- V10: domain affiliate (SF-12, D20) — registry + clicks + ledger.
-- Status enum: PENDING/APPROVED/REJECTED theo contract freeze affiliate.yaml;
-- SUSPENDED là superset additive (acceptance pack: "suspend → link không track" —
-- reject của contract chỉ từ PENDING, không chặn được affiliate đã APPROVED).
-- Ledger PENDING → CONFIRMED (contract: "khi qua cửa hoàn tiền") — SF-12 chỉ
-- tạo PENDING; payout/chuyển CONFIRMED thủ công (boundary pack: KHÔNG payout thật).

CREATE TABLE affiliates (
    id              UUID PRIMARY KEY,
    user_id         UUID         NOT NULL UNIQUE,
    code            VARCHAR(8)   UNIQUE,          -- null tới khi APPROVED
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    commission_rate NUMERIC(4,2),                 -- null → fallback AFFILIATE_DEFAULT_RATE
    portfolio_url   VARCHAR(500),
    note            VARCHAR(1000),
    payout_note     VARCHAR(500),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE clicks (
    id              UUID PRIMARY KEY,
    code            VARCHAR(8)   NOT NULL,
    affiliate_id    UUID         NOT NULL REFERENCES affiliates (id),
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ip_hash         VARCHAR(64)  NOT NULL,
    user_agent_hash VARCHAR(64)
);

-- Dedupe record 1 click/(code, ip)/10' — query theo (code, ip_hash, occurred_at)
CREATE INDEX IF NOT EXISTS idx_clicks_code_ip_time ON clicks (code, ip_hash, occurred_at);

CREATE TABLE ledger (
    id           UUID PRIMARY KEY,
    affiliate_id UUID        NOT NULL REFERENCES affiliates (id),
    order_id     VARCHAR(64) NOT NULL UNIQUE,     -- idempotency lớp 2 (sau marker eventId)
    order_total  BIGINT      NOT NULL,
    rate         NUMERIC(4,2) NOT NULL,           -- % chốt tại thời điểm đơn (ledger cũ giữ rate cũ)
    commission   BIGINT      NOT NULL,            -- floor(order_total × rate / 100) VND
    status       VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_affiliate ON ledger (affiliate_id, created_at);
