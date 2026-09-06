-- V11: reviews + wishlist (SF-8, FI-318).
-- SỐ THỨ TỰ: context pack ghi V2 nhưng V1 header reserve V2-V9 + V10 đã chiếm
-- bởi SF-4 (domain migrations từ V10 trở đi); V2 chạy TRƯỚC V10 trên fresh DB
-- → FK products vỡ. Dùng V11 — kế tiếp V10 (quyết định ghi spec SF-8 Q2 +
-- REQUIREMENT-GAP FI-310).
-- reviews: 1 review/user/product (UNIQUE race-safe — policy 409, spec Q3/Q4).

-- (1) reviews — moderation states + verified-purchase + rating
CREATE TABLE IF NOT EXISTS reviews (
    id           UUID PRIMARY KEY,
    product_id   UUID NOT NULL REFERENCES products (id),
    user_id      UUID NOT NULL,
    user_name    VARCHAR(255) NOT NULL,
    rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title        VARCHAR(255),
    content      TEXT NOT NULL,
    status       VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_reviews_user_product UNIQUE (user_id, product_id)
);

-- (2) review_eligibility — verified-purchase từ event order.confirmed (fat
-- payload §6.1.5). PK (user_id, product_id): mua 2 lần vẫn 1 row — verified
-- là boolean, dedupe ON CONFLICT DO NOTHING phía consumer.
CREATE TABLE IF NOT EXISTS review_eligibility (
    user_id    UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products (id),
    order_id   UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

-- (3) wishlist_items — unique pair (user, product)
CREATE TABLE IF NOT EXISTS wishlist_items (
    user_id    UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES products (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

-- (4) Indexes — public list (APPROVED, mới nhất trước), me/reviews, admin queue
CREATE INDEX IF NOT EXISTS idx_reviews_product_status_created ON reviews (product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user_created ON reviews (user_id, created_at DESC);
