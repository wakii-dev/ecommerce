# SF-4 Context Pack — catalog + browse

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)

1. **catalog-service** từ template (port 8082, db_catalog): Flyway `V1__catalog.sql` — `categories` (id, name, slug unique, parent_id tree, icon), `products` (id, name, slug unique, description, brand, category_id, status draft/published, price bigint VND, compare_price bigint nullable (giá gạch), flash_sale_ends_at timestamptz nullable, official boolean, rating_avg numeric(2,1) default 0, rating_count int default 0, created_at; search tsvector generated column), `product_images` (url, alt, sort), `product_variants` (id, product_id, size nullable, color nullable, price bigint nullable = override, sku_code). **KHÔNG lưu stock ở catalog** — stock là inventory (SF-5).
2. **APIs theo `catalog.yaml`**: `GET /api/catalog/products` (filters: category slug, price_min/max, rating_min, brand, official; sort price_asc|price_desc|rating|newest; page/size=12), `GET /api/catalog/products/{slug}` (detail + images + variants + category path), `GET /api/catalog/categories` (tree), `GET /api/catalog/search?q=`, `GET /api/catalog/search/suggest?q=`. Admin (internal, guard ADMIN): products/categories CRUD + publish/unpublish.
3. **SearchEngine abstraction (D15)**: interface `SearchEngine { search(q, filters), suggest(q), index(product), reindexAll() }`:
   - **PgFtsEngine** (fallback): PG FTS `simple` + `unaccent` (tsvector generated column từ migration), suggest `pg_trgm`.
   - **EsEngine** (CHÍNH khi `ELASTICSEARCH_URI` có trong env): query index `products`, analyzer `standard` + lowercase; binding qua spring elasticsearch client.
   - Chọn engine lúc startup theo config; ES down lúc RUNTIME → fallback PgFtsEngine + log WARN (degraded, KHÔNG crash, KHÔNG 500 cho user).
4. **ES indexer** (trong catalog-service): consume `product.changed` (outbox event) → index/refresh document ES (id = product id, fields: name, description, brand, category, price, rating_avg, official, status published only); **startup bulk reindex** (AppRunner: nếu ES reachable → đẩy toàn bộ published products). KHÔNG sync products unpublished/đã xóa (xóa document ES).
5. **Redis cache**: product detail, category tree, home featured; TTL conventions; **invalidate qua consumer `product.changed`** — event này DÙNG CHUNG cho ES indexer + log-service (SF-10).
6. **Seed**: profile `seed` hoặc script — ~24 sản phẩm, 5-6 danh mục kiểu Tiki (Điện tử, Thời trang, Nhà cửa, Sách, Làm đẹp, Mẹ & bé), ảnh placeholder, 3-4 sản phẩm có `compare_price` + `flash_sale_ends_at` = now + 2 ngày, rating_avg/count phân bố, tên tiếng Việt dễ search (cấu trúc dễ mở rộng — SF-10 sẽ pin tên cụ thể). Idempotent. **Seed xong → trigger reindexAll() để ES có documents** (criterion §5.9).
6. **`frontend/apps/mfe-storefront`** (remote mới): routes `/` (home), `/c/:slug` (PLP), `/p/:slug` (PDP), `/search?q=`. Theo design direction + ui-kit:
   - **Home**: hero carousel (banner static data), flash-deal section (products `flash_sale_ends_at > now`, **countdown component**), featured categories, product grid.
   - **PLP**: sidebar category tree + filter panel (giá range, rating, brand) + sort dropdown + pagination + `ProductCard` (ảnh, tên 2 dòng, Price + compare_price gạch + badge % giảm, StarRating + count, badge "Chính hãng" nếu official + "Freeship").
   - **PDP**: gallery trái + info phải (tên, rating + count, Price + badge, variant selector size/color cập nhật giá, qty stepper, **nút Add to cart STUB** — render theo cart contract shape, click gọi `POST /api/cart/items`; service chưa có → toast lỗi êm "Tính năng đang triển khai" — KHÔNG đòi hoạt động trong gate), tabs mô tả/spec, breadcrumb, tồn kho: gọi `GET /api/inventory/availability` theo contract — endpoint 404/503 (SF-5 chưa merge) → ẩn phần tồn kho gracefully.
   - **Header search**: đăng ký search widget (search bar + suggest dropdown) qua **HeaderSlots** TỪ storefront bootstrap — KHÔNG sửa file Header shell.
7. **IT tests**: search, filters, pagination, cache invalidation qua product.changed, admin CRUD APIs.

## Touch map (files SF-4 tạo/sở hữu)

```
backend/services/catalog-service/**
frontend/apps/mfe-storefront/**
frontend/apps/shell: remote manifest + slot mount entry (append 1 block)
docker-compose.yml (append block catalog-service) · Makefile (append target)
```
READ-ONLY: `contracts/**`, `packages/{contracts,auth,ui-kit,i18n}`, `backend/gateway` (append route block catalog vào routes/), services khác.

## Dep states

- SF-1 + SF-2 merged (infra, gateway, template, common-lib, contracts, packages, shell slots, design direction). **Elasticsearch container chạy sẵn từ SF-1 compose** (`ELASTICSEARCH_URI` trong .env — nếu thiếu container, coordinator đã append theo D15; kiểm `curl :9200` trước khi code EsEngine).
- **SF-3/5 CÙNG T2 SONG SONG — có thể CHƯA merge**: storefront hoạt động GUEST-FIRST (không cần auth); tồn kho ẩn khi inventory endpoint chưa có; không giả định identity JWKS live (guest không cần token).

## ACCEPTANCE (user-visible)

- Guest mở `/` → hero carousel + flash deal có countdown đếm ngược thật + featured grid.
- `/c/dien-tu` → grid đúng danh mục; filter giá/rating/brand chạy; sort chạy; phân trang chạy.
- Search tên sản phẩm seed → kết quả đúng (qua **ES**); suggest dropdown hiện khi gõ.
- **§5.9**: `curl :9200/products/_count` > 0 sau seed; dừng ES container (`docker stop`) → search VẪN chạy qua PG FTS fallback, KHÔNG 500.
- PDP: gallery chuyển ảnh; đổi variant → giá đổi; breadcrumb đúng; nút add-to-cart hiển thị (stub).
- Gọi admin API publish product mới (Swagger/curl) → PLP/PDP thấy trong ~60s (cache invalidate).

## Boundary (KHÔNG làm)

- KHÔNG reviews/wishlist (SF-8) — kể cả UI placeholder trên PDP.
- KHÔNG cart hoạt động (SF-6) — stub theo ghi trên.
- KHÔNG admin UI (SF-7) — chỉ admin APIs.
- KHÔNG inventory logic (SF-5).
- KHÔNG sửa contracts; KHÔNG sửa file Header shell (slot registration only).
