-- V12 (SF-14, D22): RMA đổi trả + cột points_discount cho loyalty burn.
-- RMA lifecycle REQUESTED → APPROVED → RECEIVED → REFUNDED, nhánh REJECTED
-- (terminal) từ REQUESTED — guard ở tầng service (RmaStatus.canTransitionTo)
-- như state machine §3.6 của orders; DB không CHECK cross-row transition.

-- ── Yêu cầu trả/đổi hàng ────────────────────────────────────────────────────
-- Cửa sổ tạo: RMA_WINDOW_DAYS (default 7) kể từ lần DELIVERED cuối trong
-- orders.timeline — check ở tầng service (RmaService.create).
-- items jsonb: [{lineId, qty}] — lineId là id của order_items trong đơn.
CREATE TABLE rma_requests (
    id            UUID PRIMARY KEY,
    order_id      UUID         NOT NULL,
    user_id       UUID         NOT NULL,
    status        VARCHAR(16)  NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED')),
    reason        VARCHAR(1000) NOT NULL,
    items         JSONB        NOT NULL,
    refund_amount BIGINT,                          -- set khi REFUNDED (MVP: full total; COD = offline)
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_rma_order ON rma_requests (order_id);
CREATE INDEX idx_rma_user_created ON rma_requests (user_id, created_at DESC);
CREATE INDEX idx_rma_status ON rma_requests (status);

-- ── Loyalty burn (D22): số tiền giảm từ điểm trên đơn ───────────────────────
-- pointsDiscount trên contract Order (frozen) — default 0 nên đơn cũ không vỡ.
ALTER TABLE orders ADD COLUMN points_discount BIGINT NOT NULL DEFAULT 0;
