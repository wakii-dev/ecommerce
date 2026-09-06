-- V10: domain inventory (SF-5) — stocks + reservations variant-level.
-- V2-V9 reserve cho schema nền dùng chung (convention template SF-1).

CREATE TABLE stocks (
    variant_id    VARCHAR(64) PRIMARY KEY,
    quantity      INT NOT NULL CHECK (quantity >= 0),      -- available duy nhất: trừ lúc reserve, hoàn lúc release, GIỮ lúc commit
    threshold_low INT NOT NULL DEFAULT 10,                 -- ngưỡng low-stock warning
    product_id    VARCHAR(64),                              -- denormalized nullable (REQUIREMENT-GAP FI-310 — writer-supply sau)
    product_name  VARCHAR(255),                             -- denormalized nullable (REQUIREMENT-GAP FI-310)
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
    id         UUID PRIMARY KEY,
    order_id   VARCHAR(64) NOT NULL,
    status     VARCHAR(16) NOT NULL,                       -- RESERVED | COMMITTED | RELEASED
    expires_at TIMESTAMPTZ NOT NULL,
    items      JSONB NOT NULL,                             -- [{"variant_id": "...", "qty": n}] — SNAKE (DB convention; event payload camel do consumer remap)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservations_order ON reservations (order_id, status);
CREATE INDEX idx_reservations_expiry ON reservations (status, expires_at);

-- 1 order chỉ 1 reservation ACTIVE — chống double-reserve khi saga retry double-fire
-- (2 request cùng order_id race qua bước check). RELEASED được loại để cancel → re-reserve được.
CREATE UNIQUE INDEX uq_reservations_active_order
    ON reservations (order_id) WHERE status IN ('RESERVED', 'COMMITTED');
