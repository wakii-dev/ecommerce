# SF-4 Context Pack — catalog + browse

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)

1. **catalog-service** từ template (port 8082, db_catalog): Flyway `V1__catalog.sql` — `categories` (id, name jsonb `{vi,en}` — **D17**, slug unique, parent_id tree, icon), `products` (id, name jsonb `{vi,en}`, slug unique editable (vi-slug mặc định + en-slug riêng cho `/en/p/*`), description jsonb `{vi,en}`, brand, category_id, status draft/published, price bigint VND, compare_price bigint nullable (giá gạch), flash_sale_ends_at timestamptz nullable, official boolean, **seo_title jsonb `{vi,en}` nullable + seo_description jsonb `{vi,en}` nullable (SEO override — D16/D17)**, rating_avg numeric(2,1) default 0, rating_count int default 0, created_at; tsvector generated column trên name->>'vi' (fallback search)), `product_images` (url, alt, sort), `product_variants` (id, product_id, size nullable, color nullable, price bigint nullable = override, sku_code). **KHÔNG lưu stock ở catalog** — stock là inventory (SF-5).
1b. **Locale resolution (D17)**: mọi GET content nhận `?locale=vi|en` + `Accept-Language`; resolve `{vi,en}` → giá trị locale, thiếu → fallback `vi`; admin write nhận full `{vi,en}` (validate đủ `vi`, `en` optional). Reviews = UGC giữ nguyên ngôn ngữ tác giả, KHÔNG dịch.
2. **APIs theo `catalog.yaml`**: `GET /api/catalog/products` (filters: category slug, price_min/max, rating_min, brand, official; sort price_asc|price_desc|rating|newest; page/size=12), `GET /api/catalog/products/{slug}` (detail + images + variants + category path), `GET /api/catalog/categories` (tree), `GET /api/catalog/search?q=`, `GET /api/catalog/search/suggest?q=`. Admin (internal, guard ADMIN): products/categories CRUD + publish/unpublish.
3. **SearchEngine abstraction (D15 + D17)**: interface `SearchEngine { search(q, filters, locale), suggest(q, locale), index(product), reindexAll() }`:
   - **PgFtsEngine** (fallback): PG FTS `simple` + `unaccent` trên name vi (fallback content), suggest `pg_trgm`.
   - **EsEngine** (CHÍNH khi `ELASTICSEARCH_URI` có trong env): query index `products`, analyzer `standard` + lowercase; **field per-locale** (`name.vi`, `name.en`, `description.*`) — search `?locale=en` query field `en`, fallback vi; binding qua spring elasticsearch client.
   - Chọn engine lúc startup theo config; ES down lúc RUNTIME → fallback PgFtsEngine + log WARN (degraded, KHÔNG crash, KHÔNG 500 cho user).
4. **ES indexer** (trong catalog-service): consume `product.changed` (outbox event) → index/refresh document ES (id = product id, fields per-locale: name{vi,en}, description{vi,en}, brand, category, price, rating_avg, official, status published only); **startup bulk reindex** (AppRunner: nếu ES reachable → đẩy toàn bộ published products). KHÔNG sync products unpublished/đã xóa (xóa document ES).
5. **Redis cache**: product detail, category tree, home featured; TTL conventions; **invalidate qua consumer `product.changed`** — event này DÙNG CHUNG cho ES indexer + log-service (SF-10).
6. **Seed**: profile `seed` hoặc script — ~24 sản phẩm, 5-6 danh mục kiểu Tiki (Điện tử, Thời trang, Nhà cửa, Sách, Làm đẹp, Mẹ & bé — **tên/description bilingual vi+en, D17**), ảnh placeholder, 3-4 sản phẩm có `compare_price` + `flash_sale_ends_at` = now + 2 ngày, rating_avg/count phân bố, tên tiếng Việt dễ search (cấu trúc dễ mở rộng — SF-10 sẽ pin tên cụ thể). Idempotent. **Seed xong → trigger reindexAll() để ES có documents per-locale** (criterion §5.9).
6. **`frontend/apps/storefront-web`** (**Next.js App Router — D16+D17, port 3000**): **`app/[locale]/...` routing** (`vi` default không prefix, `en` prefix `/en/*`) + **hreflang alternates** trong head (mỗi page liệt kê URL vi/en tương ứng) + locale switcher header. Routes: `/` (home), `/c/[slug]`, `/p/[slug]`, `/search`, `/coupons`, `/sitemap.xml` (2 ngôn ngữ), `/robots.txt`. **SSR/ISR**: Server Components fetch catalog API qua gateway (env `GATEWAY_URL`) với `?locale=` theo route, revalidate 60s. Theo design direction + ui-kit (React thuần; **client components CHỈ cho tương tác**: countdown, variant selector, qty, modal — mọi nội dung phải có trong HTML server-render):
   - **Home**: hero carousel + flash-deal countdown + featured grid.
   - **PLP**: sidebar + filters (URL params — SEO friendly, kết quả server-rendered) + sort + pagination + `ProductCard` (giá gạch, badge %, StarRating, badge "Chính hãng"/"Freeship").
   - **PDP**: `generateMetadata` (title/description/OG — **priority: `seo_title`/`seo_description` theo locale admin nhập → fallback tự sinh từ name/description cùng locale**) + **JSON-LD `Product`/`Offer` script** (name theo locale) + gallery + variant selector (client) + qty + **add-to-cart STUB** (client, gọi `POST /api/cart/items`; chưa có service → toast êm — KHÔNG đòi hoạt động trong gate) + tabs + breadcrumb; tồn kho gọi `GET /api/inventory/availability` — 404/503 → ẩn gracefully; en thiếu bản dịch → fallback nội dung vi + `<meta name="robots" content="noindex">` cho trang fallback (tránh duplicate content).
   - **Search page**: kết quả `GET /api/catalog/search` (ES) + suggest.
   - **Coupon center**: danh sách coupon public theo `GET /api/ordering/coupons/public` (contract SF-2) + nút copy mã — **mock-gate** (ordering là SF-9; live ở SF-10).
   - **Sitemap/robots**: `sitemap.ts` sinh từ catalog products (mọi slug published) + static routes; `robots.txt` disallow `/cart|/checkout|/account|/admin`.
   - **Header riêng của Next app** (theo direction): logo + search bar + suggest + link giỏ hàng (`/cart` → shell) + account (`/account` → shell). KHÔNG dùng HeaderSlots của shell (search không còn là slot shell — shell chỉ giữ auth/cart slots cho app pages).
   - **Anti-duplicate cứng**: home/PLP/PDP/search/coupon center CHỈ ở đây — không làm bản Vite.
7. **Gateway route split (D16)**: append block route `/`, `/c/*`, `/p/*`, `/search`, `/coupons`, `/sitemap.xml`, `/robots.txt` → upstream `storefront-web:3000` (dev localhost:3000). Makefile `dev-fe app=storefront-web` = `next dev`.
8. **IT tests**: catalog APIs, search engines (ES primary + fallback), indexer/reindex; storefront-web render test (home/PDP HTML chứa tên + giá), sitemap/robots 200.

## Touch map (files SF-4 tạo/sở hữu)

```
backend/services/catalog-service/**
frontend/apps/storefront-web/** (Next.js — SF-4 sở hữu trừ components/reviews/* + components/wishlist/* của SF-8)
backend/gateway: routes/catalog.yml + khối route-split Next (D16) (append)
docker-compose.yml (append block catalog-service) · Makefile (append targets)
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
- **§5.10 SEO**: view-source `/p/<slug>` → HTML chứa tên + giá (không phải shell rỗng); `/sitemap.xml` + `/robots.txt` 200; PDP có JSON-LD Product + OG tags; product có `seo_title`/`seo_description` → metadata dùng giá trị nhập tay (không fallback).
- **§5.11 i18n data**: `/en/p/<slug-en>` hiển thị nội dung tiếng Anh từ seed; `<link hreflang="en">`/`vi` alternates trong head; admin (curl) tạo product chỉ có vi → `/en` page fallback vi + noindex, không crash; search `?locale=en` trả kết quả theo tên EN.

## Boundary (KHÔNG làm)

- KHÔNG reviews/wishlist (SF-8) — kể cả UI placeholder trên PDP.
- KHÔNG cart hoạt động (SF-6) — stub theo ghi trên.
- KHÔNG admin UI (SF-7) — chỉ admin APIs.
- KHÔNG inventory logic (SF-5).
- KHÔNG sửa contracts; KHÔNG sửa file Header shell (slot registration only).
