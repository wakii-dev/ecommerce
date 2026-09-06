# SF-4 Catalog + Browse — Design Spec (FI-314)

Status: Approved (autonomous — self-answered per context pack + epic spec; epic-level Q&A đã đóng từ bracket/user)
Sources: `docs/superpowers/contexts/sf-4.md` (spec slice — AUTHORITY) · epic spec `2026-09-06-ecommerce-platform-design.md` (D15/D16/D17) · design direction `docs/superpowers/designs/fi310-storefront-direction.md` (Hướng A "Chợ Sôi Động") · contract `contracts/openapi/catalog.yaml` (READ-ONLY)

## 1. Problem

Khách (guest) chưa duyệt được sản phẩm: chưa có catalog-service, chưa có storefront. SF-4 dựng đủ dọc để guest mở `/` → duyệt category → search (ES) → xem PDP (SSR SEO) — nền cho 10 SF sau (cart/checkout/admin/reviews/affiliate đều tiêu thụ catalog API).

## 2. Scope

**In:** catalog-service (port 8082, db_catalog): Flyway V1 products/categories/images/variants i18n JSONB; public APIs list/detail/categories/search/suggest theo `catalog.yaml`; admin products/categories CRUD + publish (guard ADMIN); SearchEngine interface + PgFtsEngine + EsEngine (per-locale fields); ES indexer consume `product.changed` + startup bulk reindex; Redis cache + invalidate qua `product.changed`; seed bilingual idempotent (~24 products / 6 categories) + reindexAll sau seed; storefront-web Next.js App Router (port 3000): `[locale]` routing vi (không prefix) / en (`/en/*`), hreflang alternates, home/PLP/PDP/search/coupon-center/sitemap/robots; gateway route split D16 (un-comment catalog + append khối Next); IT tests.

**Out (KHÔNG làm):** reviews/wishlist/stock-alert/uploads endpoints của catalog.yaml (SF-8/D21 — path tồn tại trong contract nhưng return 404 tự nhiên), cart hoạt động (stub UI + toast), admin UI (SF-7), inventory logic (SF-5 — availability 404 → ẩn), notifications, sửa contracts.

## 3. Brainstorm Q&A (self-answered, autonomous)

| # | Câu hỏi | Trả lời |
|---|---------|---------|
| Q1 | Java side dùng gì map i18n JSONB? | Hibernate `@JdbcTypeCode(SqlTypes.JSON)` trên record nhúng `I18nText(vi, en)` — serialize JSONB `{vi,en}`; resolve helper `resolve(locale) = text[locale] non-blank ? : vi`. |
| Q2 | PG FTS thế nào khi `unaccent()` không immutable? | Migration V1 tạo `CREATE EXTENSION unaccent` + wrapper `f_unaccent(text) IMMUTABLE` (pattern chuẩn), generated column `search_vec tsvector = to_tsvector('simple', f_unaccent(name->>'vi'))` + GIN index; search native query dùng cùng biểu thức cho query side. Suggest PG-mode: `pg_trgm` GIN trên `name->>'vi'` + `similarity()`. |
| Q3 | ES client nào? | `elasticsearch-java` (version do Boot 3.3.5 BOM quản — 8.13.x client ok với server 8.17) + low-level RestClient, query build bằng raw JSON qua Jackson — toàn quyền query DSL, không dùng Spring Data repositories. Index `products` tạo-if-missing lúc startup với mapping per-locale fields. |
| Q4 | Admin JWT khi identity (SF-3) song song chưa merge? | `spring-boot-starter-oauth2-resource-server`; `JwtDecoder` custom: nếu env `SECURITY_JWKS_URI` set → `NimbusJwtDecoder.withJwkSetUri` (SF-3+, future), else decode RS256 bằng PEM public key `JWT_PUBLIC_KEY_PATH` (infra/keys — `make keys`). Role claim: đọc linh hoạt `roles[]` / `role` / `scope` chứa `ADMIN` → authority `ROLE_ADMIN`. `/api/catalog/admin/**` requires `ROLE_ADMIN`, fail-closed 401. Dev: script bash+openssl `mint-admin-token.sh` trong service (sinh JWT từ `infra/keys/jwt-private.pem`) để curl/Swagger test. |
| Q5 | Filter `official` không có trong contract listProducts? | Gap thật (context pack yêu cầu, contract không có): implement query param `official` server-side (additive, không break client nào) + REQUIREMENT-GAP comment lên FI-310, KHÔNG tự sửa contract. |
| Q5b | Admin write i18n: contract `I18nText required [vi,en]` vs pack §1b "en optional" + acceptance §5.11 (product chỉ-vi phải tạo được)? | **Giải theo D17/pack (giống cách xử lý Q5):** server validate `vi` non-blank; `en` optional (key vắng HOẶC blank = missing → resolve fallback `vi`). REQUIREMENT-GAP comment lên FI-310 cạnh Q5 (không sửa contract). Test §5.11 dùng payload **omit `en`** (server-accepted). |
| Q5c | Variant DB ↔ contract mapping (pack: size/color/price-override/sku_code, không name/stock; contract: nameI18n/options/priceDelta/stock required)? | **Chốt 1 mapping duy nhất:** V1 lưu `name_i18n jsonb NULL`, `size varchar NULL`, `color varchar NULL`, `price bigint NULL` (override TUYỆT ĐỐI), `sku_code varchar NULL` (internal/seed-only, không暴露 contract). **Read (`Variant`):** `name` = `name_i18n.resolve(locale)`, fallback ghép `[color,size]` non-null join `" / "`; `options` = `{color?, size?}` (bỏ null); `priceDelta` = `price != null ? price - product.price : 0`; `stock: 0` (SF-5 sở hữu stock). **Write (`VariantWrite`):** `nameI18n` → `name_i18n`; `options.color/size` → cột tương ứng; `priceDelta != null` → lưu `price = product.price + priceDelta` (đổi lại khi đọc ra delta đúng); `stock` accept-và-ignore; `sku_code` nếu client gửi qua options không có — chỉ seed set. |
| Q6 | Next.js version? | Workspace React 18.3 → **next@14.2.x** + react catalog 18.3.1 (Next 15 cần React 19). Thêm `next` vào catalog `pnpm-workspace.yaml` (append). `make dev-fe app=storefront-web` chạy được không cần sửa Makefile (`pnpm --filter` resolve theo package.json **name = đúng `storefront-web`** + script `dev`). |
| Q7 | Locale routing vi-no-prefix trong App Router? | `app/[locale]/...` với locale ∈ {vi,en}; `middleware.ts` **rewrite** (không redirect) `/`, `/c/*`, `/p/*`, `/search`, `/coupons` → `/vi/...` (URL giữ nguyên); `/en/*` pass-through locale=en. `generateStaticParams` = vi,en; locale lạ → notFound(). |
| Q8 | Server fetch + ISR? | Dùng `createCatalogClient` từ `@ecommerce/contracts` với `baseURL = GATEWAY_URL` (env, default `http://localhost:8080`), inject `fetchImpl` wrapper gắn `next: { revalidate: 60 }`. |
| Q9 | Home flash rail + featured lấy từ đâu? | 1 lần gọi `listProducts?size=24&sort=discount&locale=` → server tách: flash rail = items có `flashSaleEndsAt > now`, featured = top theo rating/ratingCount. Không cần endpoint riêng (YAGNI, contract đóng). **`sort=discount` semantics chốt:** PG `ORDER BY CASE WHEN compare_price > price THEN (compare_price-price)::float/compare_price ELSE 0 END DESC`; ES index-time field `discount` (double, 0 khi không có compare) cùng công thức, sort field trực tiếp. **Server default size = 20 (theo contract); PLP/home tự truyền `size=12` rõ ràng.** |
| Q10 | Coupon center khi ordering chưa có (SF-9)? | Fetch `GET /api/ordering/coupons/public` qua gateway → **route chưa tồn tại → Spring Cloud Gateway default 404 (JSON mặc định Boot, KHÔNG phải RFC 7807)** → storefront coi mọi non-2xx/parse-error là "chưa có dữ liệu" → empty state "Chưa có coupon nào" — mock-gate đúng pack, KHÔNG crash. |
| Q11 | Stock trên PDP/variant? | `Variant.stock` trả 0 (chưa có inventory); PDP gọi `GET /api/inventory/availability` — lỗi/404 → ẨN phần tồn kho (graceful, không "hết hàng"). |
| Q12 | Seed chạy khi nào? | `ApplicationRunner` gated `catalog.seed.enabled` (default `true` cho dev; IT tắt). Idempotent: products count > 0 → skip. Sau seed → `searchEngine.reindexAll()` (§5.9). `flash_sale_ends_at` = now + 2 ngày lúc seed. **Flash-refresh:** mỗi startup (seed enabled), nếu tồn tại product có flash_sale_ends_at nhưng TẤT CẢ đã < now → bump các row đó lên `now + 2 ngày` (idempotent, log INFO) — chống acceptance "countdown thật" chết vì verify chạy >2 ngày sau seed. UI: flash hết hạn → card render thường (badge -% giữ nếu comparePrice còn), countdown block ẩn. |
| Q15 | Sitemap/hreflang/JSON-LD cần absolute URL từ đâu? | Env `SITE_URL` (default `http://localhost:3000`) — Next app đọc cho sitemap origin + canonical + JSON-LD url. |
| Q16 | ES sống lại sau downtime thì index stale thế nào? | EsEngine giữ degraded flag; call đầu tiên thành công sau degraded → fire **async `reindexAll()` đúng 1 lần** (guard AtomicBoolean) + log INFO — không stale index kéo dài tới restart. |
| Q13 | Cache TTL + keys? | Redis `cat:prod:{slugVi}:*` + `cat:cat-tree:{locale}` + `cat:home:{locale}` — TTL 600s/1800s/300s. Consumer `product.changed` (queue riêng `q.catalog.product-changed.cache`) xóa keys theo slugVi/slugEn (mọi locale, dùng SCAN pattern) + tree + home. Indexer dùng queue riêng `q.catalog.product-changed.indexer`. |
| Q14 | IT tests chạy infra nào? | Testcontainers: PostgreSQL (harness chuẩn) + `ElasticsearchContainer` (8.17.4, security off) + Redis `GenericContainer`. EsEngine ITs bật; PG FTS ITs chạy khi tắt ES (đặt `elasticsearch.uri` rỗng). Storefront: vitest unit cho lib helpers + render smoke qua `next build && next start` assert HTML (chạy ở Phase 5 verify — cần catalog live + seeded). |

## 4. Architecture

```
                    ┌─ gateway :8080 ──────────────────────────────┐
browser ──► /,/c,/p,/search,/coupons,/en/**,/_next/** ──► storefront-web :3000 (Next SSR/ISR 60s)
            /api/catalog/** ──────────────────────────► catalog-service :8082
                                                        ├─ PG db_catalog (Flyway V1)
                                                        ├─ SearchEngine ─ EsEngine ──► ES :9200 (index products)
                                                        │               └ PgFtsEngine (fallback, degraded)
                                                        ├─ Redis cache (detail/tree/home)
                                                        └─ RabbitMQ ecommerce.events (outbox product.changed)
```

**catalog-service packages** (`com.ecommerce.catalog`): `web` (public + admin controllers, DTO khớp schema names catalog.yaml) · `domain` (Product/Category/ProductImage/ProductVariant entities + I18nText JSONB) · `repo` (Spring Data + native queries) · `search` (`SearchEngine`, `PgFtsEngine`, `EsEngine`, `SearchEngineConfig` chọn lúc startup, `ProductIndexer` consumer + `StartupReindexRunner`) · `cache` (CatalogCacheService + `CacheInvalidateConsumer`) · `admin` (service + outbox write) · `seed` (SeedDataRunner). Common-lib: OutboxWriter (producer), IdempotentConsumer (2 consumer), ApiError/GlobalExceptionHandler, RequestIdMdcFilter.

**storefront-web**: `app/[locale]/layout.tsx` (header theo direction §2.1 + footer + hreflang) · `page.tsx` home (hero carousel client, flash rail + countdown client, featured grid server) · `c/[slug]/page.tsx` PLP (server; sidebar filters URL params; pagination) · `p/[slug]/page.tsx` PDP (`generateMetadata` + JSON-LD + gallery/variant/qty client + add-to-cart stub) · `search/page.tsx` (server + suggest client trong header) · `coupons/page.tsx` · `sitemap.ts` · `robots.ts` · `middleware.ts`. CSS: import `@ecommerce/ui-kit` tokens/styles + CSS modules theo direction A (tokens-only, không hex cứng — tints dùng giá trị §1.6 của direction doc, đặt là CSS vars trong :root của app nếu thiếu trong ui-kit).

**Data flow chính:** admin PUT product → tx: update PG + OutboxWriter(product.changed) → relay publish → indexer (ES doc per-locale) + cache invalidate → PLP/PDP thấy mới trong ≤60s (ISR) hoặc ngay sau revalidate.

## 5. Error handling

- Public API: 400 (param sai) / 404 (slug, product draft/đã xóa) qua GlobalExceptionHandler RFC 7807.
- ES down lúc runtime: EsEngine gọi fail → PgFtsEngine fallback + log WARN 1 lần/state (degraded, không 500). ES down lúc startup → chọn PgFtsEngine ngay + WARN. ES sống lại: call đầu thành công sau degraded → async `reindexAll()` 1 lần (Q16). ES trả ids theo score → **hydrate full ProductCard từ PG (`WHERE id IN`)** — resolve locale + giá/ảnh luôn là nguồn sự thật PG.
- Redis down lúc runtime: cache get/set bọc try → miss/bypass, serve PG trực tiếp + WARN (không 500, không crash).
- Cache key detail dùng slugVi gốc làm canonical (`cat:prod:{slugVi}:{locale}`) — request bằng slugEn vẫn resolve về cùng product; slug đổi → key cũ tự hết hạn theo TTL (600s, chấp nhận stale-short).
- Inventory/coupon/cart endpoint chưa có: storefront bắt mọi fetch lỗi → render empty/ẩn/toast êm — không bao giờ crash page.
- Locale thiếu bản dịch: resolve fallback `vi`; trang `/en` đang fallback → `<meta name="robots" content="noindex">`.

## 6. Testing

- **catalog-service IT** (Testcontainers PG+ES+Redis, tag `integration`): products filters/sort/pagination; detail slug vi/en + 404 draft; categories tree; search PG FTS unaccent khớp seed-term; search ES per-locale (vi query khớp name.vi, en query khớp name.en); suggest ≤5+5; admin CRUD + publish → outbox row product.changed; indexer index doc + DELETED xóa doc + reindexAll; cache set + invalidate qua event; admin guard 401/403.
- **storefront-web**: vitest unit (locale/path helpers, price format); render smoke script (build+start, assert home/PDP HTML chứa tên+giá seed, sitemap.xml/robots.txt 200) — chạy Phase 5.
- **Gate verification** = từng dòng ACCEPTANCE của context pack + Rule 0 browser 3 tầng (DOM → visual Orca browser → flow) + §5.9 curl `_count` + docker stop ES → search vẫn chạy.

## 7. Risks

- `f_unaccent` wrapper phải tạo trong CÙNG migration trước generated column/index (thứ tự statement trong V1).
- ES testcontainers image pull lần đầu (nếu chưa có local) — dùng đúng `elasticsearch:8.17.4` đã pull từ compose.
- pnpm-lock.yaml churn (thêm next + deps Next) — commit lock regenerated; merge coordinator serialize (đã ghi audit).
- Gateway route Next block phải đứng trước mọi route catch-all tương lai; nhóm route: Path=/,/c/**,/p/**,/search,/coupons,/sitemap.xml,/robots.txt,/en/**,/_next/** — thiếu `/_next/**` thì static assets chết qua :8080 (asset qua :3000 trực tiếp vẫn sống ở dev).
- Rule outbox: OutboxWriter MANDATORY transaction — admin service gọi trong cùng tx.
