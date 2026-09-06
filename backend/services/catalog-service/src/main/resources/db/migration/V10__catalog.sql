-- V10: domain schema catalog — categories/products/product_images/product_variants (SF-4, FI-314).
-- V1 giữ nền dùng chung (outbox + processed_messages); V2-V9 reserve — xem header V1__init.sql.
-- Thứ tự BẮT BUỘC: (1) extensions → (2) f_unaccent wrapper → (3) tables → (4) indexes.

-- (1) Extensions: unaccent cho FTS bỏ dấu tiếng Việt, pg_trgm cho suggest
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- (2) Wrapper IMMUTABLE: unaccent() gốc là STABLE → không dùng trực tiếp trong
-- generated column / index expression; bọc qua hàm IMMUTABLE này.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
AS $$ SELECT public.unaccent($1) $$
LANGUAGE sql IMMUTABLE;

-- (3a) categories — cây 1 cấp self-fk, tên i18n JSONB {vi,en} (D17)
CREATE TABLE IF NOT EXISTS categories (
    id         UUID PRIMARY KEY,
    name       JSONB NOT NULL,
    slug_vi    VARCHAR(255) UNIQUE,
    slug_en    VARCHAR(255) UNIQUE,
    parent_id  UUID REFERENCES categories (id),
    icon       VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (3b) products — giá VND integer (bigint), soft-delete deleted_at,
-- search_vec GENERATED từ name->>'vi' qua f_unaccent (fallback search D15)
CREATE TABLE IF NOT EXISTS products (
    id                 UUID PRIMARY KEY,
    name               JSONB NOT NULL,
    slug_vi            VARCHAR(255) NOT NULL UNIQUE,
    slug_en            VARCHAR(255) NOT NULL UNIQUE,
    description        JSONB NOT NULL,
    brand              VARCHAR(255),
    category_id        UUID REFERENCES categories (id),
    status             VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    price              BIGINT NOT NULL CHECK (price >= 0),
    compare_price      BIGINT,
    flash_sale_ends_at TIMESTAMPTZ,
    official           BOOLEAN NOT NULL DEFAULT FALSE,
    tags               TEXT[] NOT NULL DEFAULT '{}',
    seo_title          JSONB,
    seo_description    JSONB,
    rating_avg         NUMERIC(2,1) NOT NULL DEFAULT 0,
    rating_count       INT NOT NULL DEFAULT 0,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    search_vec         TSVECTOR GENERATED ALWAYS AS (
                         to_tsvector('simple', f_unaccent(coalesce(name->>'vi', '')))
                       ) STORED
);

-- (3c) product_images — sort theo position (0 = ảnh đại diện ProductCard)
CREATE TABLE IF NOT EXISTS product_images (
    id         UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    alt        TEXT,
    position   INT NOT NULL DEFAULT 0
);

-- (3d) product_variants — price NULL = không override; giá trị = giá TUYỆT ĐỐI
-- của biến thể (contract gửi priceDelta → service cộng với product.price khi ghi).
-- KHÔNG cột stock — stock là inventory (SF-5).
CREATE TABLE IF NOT EXISTS product_variants (
    id         UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    name_i18n  JSONB,
    size       VARCHAR(64),
    color      VARCHAR(64),
    price      BIGINT,
    sku_code   VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (4) Indexes — GIN FTS + GIN trgm cho suggest, btree cho filters/sort
CREATE INDEX IF NOT EXISTS idx_products_search_vec ON products USING GIN (search_vec);
CREATE INDEX IF NOT EXISTS idx_products_name_vi_trgm ON products USING GIN ((name->>'vi') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_price ON products (price);
CREATE INDEX IF NOT EXISTS idx_products_rating_avg ON products (rating_avg);
