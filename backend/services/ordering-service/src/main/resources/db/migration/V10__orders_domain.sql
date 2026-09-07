-- V10 (SF-9): domain ordering — orders / order_items / coupons / coupon_reservations /
-- saga_state / invoice_sequences. Tiền VND zero-decimal (integer). State machine §3.6
-- được guard ở tầng service (OrderStatus.canTransition) — DB không CHECK cross-row.

-- ── Đơn hàng ────────────────────────────────────────────────────────────────
-- idempotency: BẮT BUỘC header Idempotency-Key (contract). Replay cùng (user, key)
-- + cùng payload_hash → trả lại đơn cũ; khác payload → 409 (không double-charge).
CREATE TABLE orders (
    id                  UUID PRIMARY KEY,
    user_id             UUID         NOT NULL,
    email               VARCHAR(255) NOT NULL,          -- snapshot cho order.confirmed fat payload
    status              VARCHAR(20)  NOT NULL,          -- enum §3.6: PENDING..FAILED
    subtotal            BIGINT       NOT NULL,
    discount            BIGINT       NOT NULL DEFAULT 0,
    shipping_fee        BIGINT       NOT NULL DEFAULT 0,
    total               BIGINT       NOT NULL,
    currency            VARCHAR(8)   NOT NULL DEFAULT 'VND',
    coupon_code         VARCHAR(64),
    affiliate_code      VARCHAR(64),
    payment_method      VARCHAR(16)  NOT NULL DEFAULT 'stripe',
    shipping_method     VARCHAR(32)  NOT NULL,
    tracking_code       VARCHAR(64),
    stripe_intent_id    VARCHAR(128),
    stripe_client_secret VARCHAR(255),                  -- replay cùng key → cùng clientSecret
    address             JSONB        NOT NULL,
    timeline            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    idempotency_key     VARCHAR(64)  NOT NULL,
    payload_hash        VARCHAR(64)  NOT NULL,
    invoice_number      BIGINT,                          -- D18: cấp 1 lần khi in lần đầu
    invoice_issued_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version             BIGINT       NOT NULL DEFAULT 0,   -- optimistic lock (race consumer/sweeper)
    CONSTRAINT uq_orders_user_idem UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_orders_created_at ON orders (created_at);

-- ── Dòng hàng (snapshot tên + giá tại thời điểm đặt — re-price từ catalog §6.1) ──
CREATE TABLE order_items (
    id         UUID PRIMARY KEY,
    order_id   UUID         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id UUID         NOT NULL,
    variant_id UUID         NOT NULL,       -- level variant (pin §6.1.4)
    name       VARCHAR(512) NOT NULL,       -- tên ĐÃ resolve (vi) lúc đặt
    unit_price BIGINT       NOT NULL,
    qty        INT          NOT NULL CHECK (qty >= 1),
    line_total BIGINT       NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

-- ── Coupon ─────────────────────────────────────────────────────────────────
-- type PERCENT → value là %; FIXED → value là số VND (khớp PublicCoupon contract).
-- §6.1.3: % trên VND làm tròn XUỐNG (floor) — xử lý ở tầng service.
CREATE TABLE coupons (
    code            VARCHAR(64) PRIMARY KEY,
    type            VARCHAR(16)  NOT NULL CHECK (type IN ('PERCENT', 'FIXED')),
    value           BIGINT       NOT NULL,
    min_order_value BIGINT,
    starts_at       TIMESTAMPTZ  NOT NULL,
    ends_at         TIMESTAMPTZ,
    usage_limit     INT,                         -- NULL = không giới hạn
    used_count      INT          NOT NULL DEFAULT 0,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    description     VARCHAR(512) NOT NULL
);

-- ── Giữ chỗ usage coupon theo đơn (RESERVED → FINALIZED | RELEASED) ────────
-- used_count TĂNG ngay lúc reserve (UPDATE ... WHERE used_count < usage_limit —
-- nguyên tử, 2 đơn cùng lúc không vượt limit); release/finalize flip status row này.
CREATE TABLE coupon_reservations (
    id         UUID PRIMARY KEY,
    order_id   UUID        NOT NULL,
    coupon_code VARCHAR(64) NOT NULL REFERENCES coupons (code),
    status     VARCHAR(16) NOT NULL CHECK (status IN ('RESERVED', 'FINALIZED', 'RELEASED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_coupon_res_active_order UNIQUE (order_id)   -- 1 coupon / đơn
);

CREATE INDEX idx_coupon_res_coupon ON coupon_reservations (coupon_code, status);

-- ── Saga state (orchestration §3.3 — theo dõi bước hiện tại) ───────────────
CREATE TABLE saga_state (
    order_id       UUID PRIMARY KEY,
    step           VARCHAR(32) NOT NULL,   -- RE_PRICE → COUPON_RESERVED → INVENTORY_RESERVED → PAYMENT_INTENT → DONE | FAILED
    correlation_id VARCHAR(64),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── D18: số hóa đơn tuần tự theo (mẫu, ký hiệu, năm) — business truth thuộc Java ──
CREATE TABLE invoice_sequences (
    mau_so      VARCHAR(32) NOT NULL,
    ky_hieu     VARCHAR(32) NOT NULL,
    year        INT         NOT NULL,
    last_number BIGINT      NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (mau_so, ky_hieu, year)
);
