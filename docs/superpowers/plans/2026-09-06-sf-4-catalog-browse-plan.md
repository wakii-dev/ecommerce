# SF-4 catalog-browse — Implementation Plan (FI-314)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guest duyệt được catalog Tiki-style: catalog-service (products/categories/i18n JSONB, search ES chính + PG FTS fallback, Redis cache, seed bilingual) + storefront-web Next.js SSR (home/PLP/PDP/search/coupons/sitemap) + gateway route split D16.

**Architecture:** Contract-first theo `contracts/openapi/catalog.yaml` (READ-ONLY — SF-4 slice: products/categories/search/admin; reviews/wishlist/uploads → 404 tự nhiên, SF-8/D21). SearchEngine interface (D15): EsEngine khi ES reachable, PgFtsEngine fallback (degraded không 500). Indexer + cache-invalidate consume `product.changed` (outbox common-lib). Storefront = Next 14 App Router `[locale]` (vi không prefix qua middleware rewrite), SSR/ISR 60s qua gateway, client components chỉ cho tương tác.

**Tech Stack:** Spring Boot 3.3.5/Java 21 · Flyway/PostgreSQL 16 (JSONB, tsvector `f_unaccent`, pg_trgm) · elasticsearch-java (Boot BOM) · spring-data-redis · spring-oauth2-resource-server (PEM/JWKS) · Testcontainers (PG+ES+Redis) · Next 14.2 + React 18.3 (catalog) · @ecommerce/{contracts,ui-kit,i18n} · pnpm catalog

**Linear Issue:** FI-314 · **Nhánh đích:** `story/fi310-ecommerce-platform` · **Spec:** `docs/superpowers/specs/2026-09-06-sf-4-catalog-browse-design.md` + pack `docs/superpowers/contexts/sf-4.md`

---

## Conventions dùng chung mọi task (đọc trước khi chạy task nào)

1. **Contract = LAW:** tên field/schema khớp CHÍNH XÁC `contracts/openapi/catalog.yaml` — `ProductCard {id, slug, slugEn, name, brand?, price, comparePrice?, discountPercent?, flashSaleEndsAt?, ratingAvg, ratingCount, image{url,alt?}, tags[], categoryId}`, `ProductDetail = ProductCard + {description, images[{url,alt,position}], variants[{id,name,options,priceDelta,stock}], relatedCount}`, page `{items,page,size,total}` (page **1-based**), `SuggestResponse {products[≤5], categories[≤5]{slug,name}}`. Giá VND integer. Error RFC 7807 qua common-lib.
2. **Ports/DB:** catalog 8082 · db_catalog · PG host **5433** · storefront-web 3000 · gateway 8080 · ES 9200 · Redis 6379.
3. **Java layout:** fork `backend/services/template-service` → `backend/services/catalog-service`, package `com.ecommerce.catalog`, artifact `catalog-service`; thêm `<module>services/catalog-service</module>` vào `backend/pom.xml`; pom giữ cặp flyway+postgres, thêm `spring-boot-starter-data-redis`, `spring-boot-starter-amqp` (T1), `spring-boot-starter-security` + `spring-boot-starter-oauth2-resource-server` (T8b), `co.elastic.clients:elasticsearch-java` (version do BOM), testcontainers `elasticsearch` + `junit-jupiter`. **GIỮ NGUYÊN `@EntityScan({"com.ecommerce.catalog", "com.ecommerce.common.outbox"})` (dual package — Boot chỉ cho 1 @EntityScan; mất package common = outbox repos chết im lặng). Copy cả `src/test/resources/docker-java.properties` (api.version=1.44 — thiếu → IT SKIP im lặng, build vẫn xanh!).**
4. **i18n (D17):** JSONB `{vi,en}` record `I18nText(vi,en)` với `@JdbcTypeCode(SqlTypes.JSON)`; resolve: `locale != vi && en non-blank ? en : vi` (fallback vi mọi trường hợp thiếu). GET nhận `?locale=vi|en` + `Accept-Language` (locale param thắng). Admin write nhận `{vi,en}` — validate **đủ `vi`** (en optional — vắng key hoặc blank = missing, theo pack §1b; contract schema ghi required cả hai — đã REQUIREMENT-GAP FI-310; acceptance §5.11 là chủ: product chỉ-vi phải tạo được).
5. **Slugs:** `slug_vi` + `slug_en` UNIQUE riêng biệt; public GET `/products/{slug}` khớp cả hai; `CategoryWrite`/`ProductWrite` có `slugVi`+`slugEn`.
6. **Events:** producer `OutboxWriter.write("product.changed", payload, correlationId)` trong tx admin; payload theo `contracts/events/product.changed.schema.json` `{productId, action: CREATED|UPDATED|DELETED, slugVi, slugEn, changedAt}`. Consumer queues: `q.catalog.product-changed.indexer` + `q.catalog.product-changed.cache` (topic exchange `ecommerce.events`, routing key `product.changed`), idempotent qua `IdempotentConsumer` (marker cùng tx).
7. **Commit:** mỗi task 1 atomic commit, stage ĐÚNG file từ `git status` (KHÔNG `git add -A`). Format `<type>(<scope>): <summary>`. KHÔNG `--no-verify`.
8. **Boundary READ-ONLY:** `contracts/**`, `frontend/packages/{contracts,auth,ui-kit,i18n}` (import-only), file shell, services khác. Shared files append-only: `gateway-routes.yml`, `docker-compose.yml`, `pnpm-workspace.yaml` catalog, `backend/pom.xml` modules.
9. **Chạy IT:** `mvn -pl services/catalog-service -am verify` từ `backend/`; IT tag `integration` + Testcontainers `disabledWithoutDocker=true`. IT base copy `AbstractIntegrationTest` (đổi db `db_catalog`, thêm ES + Redis containers; **IT có @RabbitListener thêm `RabbitMQContainer` theo pattern `OutboxIntegrationTest`**). **Exit criteria: failsafe report `Tests run: > 0` — KHÔNG chỉ "build xanh" (IT skip im lặng nếu thiếu docker-java.properties).**
10. **Frontend:** deps mới CHỈ qua `frontend/pnpm-workspace.yaml` catalog + `catalog:` protocol (thêm `next: ^14.2.32`, `@types/node`, `@types/react-dom`). Tokens-only cho màu (ui-kit vars; tints §1.6 direction doc đặt thêm CSS vars ở app layout nếu thiếu). Ảnh placeholder = gradient theo danh mục (§1.8) khi `image.url` rỗng. **Package name đúng `storefront-web`** (make dev-fe filter theo name). **Next KHÔNG transpile TS của linked packages** → `next.config.mjs` phải có `transpilePackages: ['@ecommerce/ui-kit','@ecommerce/contracts','@ecommerce/i18n']` (các package ship raw TS entry). **Client components gọi API qua relative `/api/...` + Next `rewrites()` proxy → `${GATEWAY_URL}`** (tránh cross-origin :3000→:8080 không CORS; server components vẫn fetch trực tiếp GATEWAY_URL).
11. **Path mapping (giải nghiễm mâu thuẫn gateway-routes.yml):** controllers map **FULL prefix `@RequestMapping("/api/catalog")`** (khớp template PingController `/api/template` + contract paths + mọi curl trong pack); block gateway `catalog` của SF-4 un-comment **KHÔNG StripPrefix** (comment giải thích trong yml — placeholder StripPrefix=1 mâu thuẫn chính comment của nó; file yml ghi chú decision 2026-09-06). Cấu hình ES: `elasticsearch.uri: ${ELASTICSEARCH_URI:http://localhost:9200}` (default ES-primary vì container chạy từ SF-1 compose; đặt env rỗng → PgFts).

---

### Task 1: catalog-service-scaffold

**Files:** Create `backend/services/catalog-service/**` (copy từ template-service, đổi package/artifact/port); Modify `backend/pom.xml` (append module)

- [x] Copy template → catalog-service: package `com.ecommerce.catalog`, class `CatalogServiceApplication` (GIỮ `@EntityScan` dual package — Conventions #3), `server.port: 8082` (**GIỮ NGUYÊN `V1__init.sql` — outbox + processed_messages DDL, OutboxRelay/IdempotentConsumer cần sống; KHÔNG xóa**), xóa PingController, datasource default `jdbc:postgresql://localhost:5433/db_catalog`, `spring.application.name: catalog-service`, application.yml thêm `elasticsearch.uri: ${ELASTICSEARCH_URI:http://localhost:9200}` + block redis/rabbitmq (theo template comment)
- [x] pom: deps theo Conventions #3 TRỪ security/oauth2 (thêm ở Task 8b — tránh Boot default security khóa mọi endpoint trước khi có SecurityConfig); `backend/pom.xml` append `<module>services/catalog-service</module>`
- [x] docker-compose.yml append block `catalog-service` (image build từ Dockerfile copy template, `profiles: ["full"]`, port internal 8082, depends_on postgres/redis/rabbitmq/elasticsearch healthy) — KHÔNG bật ở dev (host JVM `make dev svc=catalog` đã có trong Makefile case)
- [x] Verify: `mvn -pl services/catalog-service -am verify` xanh (không IT bắt buộc ở task này); `make dev svc=catalog` boot được → `curl :8082/actuator/health` = UP (không 401 — chưa có security)
- [x] Commit: `feat(catalog): scaffold service từ template — port 8082, giữ V1 outbox, deps redis/amqp/es`

### Task 2: flyway-products-categories-variants-i18n-jsonb

**Files:** Create `backend/services/catalog-service/src/main/resources/db/migration/V10__catalog.sql`; Create entity/domain classes

- [x] **Migration domain = V10** (V1 là outbox schema dùng chung — giữ; V2–V9 reserve theo header V1__init.sql). V10 thứ tự BẮT BUỘC: (1) `CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;` (2) wrapper `CREATE FUNCTION f_unaccent(text) RETURNS text AS $$ SELECT public.unaccent($1) $$ LANGUAGE sql IMMUTABLE;` (3) tables, (4) indexes
- [x] `categories(id uuid pk, name jsonb NOT NULL, slug_vi varchar unique, slug_en varchar unique, parent_id uuid null fk self, icon varchar, created_at timestamptz default now())`
- [x] `products(id uuid pk, name jsonb NOT NULL, slug_vi varchar unique NOT NULL, slug_en varchar unique NOT NULL, description jsonb NOT NULL, brand varchar, category_id uuid fk, status varchar check in ('DRAFT','PUBLISHED') default 'DRAFT', price bigint NOT NULL check >= 0, compare_price bigint null, flash_sale_ends_at timestamptz null, official boolean default false, tags text[] default '{}', seo_title jsonb null, seo_description jsonb null, rating_avg numeric(2,1) default 0, rating_count int default 0, deleted_at timestamptz null (soft-delete), created_at timestamptz default now(), search_vec tsvector GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent(coalesce(name->>'vi','')))) STORED)`
- [x] `product_images(id, product_id fk cascade, url text, alt text, position int, sort preserved by position)`; `product_variants(id, product_id fk cascade, name_i18n jsonb null, size varchar null, color varchar null, price bigint null (override tuyệt đối), sku_code varchar, created_at)`
- [x] Indexes: GIN `search_vec`; GIN trgm `((name->>'vi')) gin_trgm_ops`; btree `products(category_id)`, `products(status)`, `products(price)`, `products(rating_avg)`
- [x] Entities `domain/`: `ProductEntity`, `CategoryEntity`, `ProductImageEntity`, `ProductVariantEntity` + record `I18nText(String vi, String en)` JSONB với helper `String resolve(String locale)`; status enum
- [x] Verify: `mvn -pl services/catalog-service -am verify` với 1 IT flyway migrate (copy pattern template IT, db_catalog) → migration chạy sạch trên PG 16 testcontainer
- [x] Commit: `feat(catalog): flyway V10 — products/categories/variants i18n jsonb + f_unaccent + tsvector`

### Task 3: product-category-apis-locale-resolution

**Files:** Create `web/` (ProductController, CategoryController, dto/), `repo/`, `service/CatalogQueryService`, `service/LocaleResolver`; Modify `backend/gateway/src/main/resources/gateway-routes.yml` (un-comment block `catalog`)

- [x] `LocaleResolver`: đọc `?locale` param → else `Accept-Language` (parse `en`/`vi` prefix) → else `vi`; chỉ chấp nhận `vi|en`
- [x] `GET /api/catalog/products`: params `category` (slug vi hoặc en → resolve categoryId qua slug), `minPrice`, `maxPrice`, `minRating`, `brand`, `official` (boolean — GAP FLAG: không có trong contract, implement + đã flag REQUIREMENT-GAP), `sort` enum `price_asc|price_desc|rating|newest|discount` (discount = comparePrice>0 ORDER BY (compare-price)/compare DESC nulls last), `locale`, `page` 1-based, `size` (default 20 — storefront tự truyền 12), chỉ `status=PUBLISHED AND deleted_at IS NULL`; trả `ProductCardPage`; `discountPercent` computed `(comparePrice-price)*100/comparePrice` khi comparePrice > price
- [x] `image` trong ProductCard = ảnh position=0 (empty url "" + alt = name khi không có ảnh); `slug` = theo locale (vi → slug_vi, en → slug_en), `slugEn` luôn = slug_en; `tags` từ cột tags
- [x] `GET /api/catalog/products/{slug}`: khớp slug_vi HOẶC slug_en, published only → `ProductDetail` (description resolved, images sort theo position, variants: `name` = name_i18n resolved, fallback ghép `[color, size] non-null join " / "`; `options` = `{color?, size?}` bỏ null; `priceDelta` = `variant.price != null ? variant.price - product.price : 0`; `stock: 0`); 404 khi không thấy/draft; `relatedCount: 0`
- [x] `GET /api/catalog/categories`: cây recursive (roots parent_id null), tên/slug resolved, `children[]` recursive; cache-friendly (service-level)
- [x] **Controllers map FULL prefix `@RequestMapping("/api/catalog")`** (Conventions #11); gateway block `catalog` un-comment KHÔNG StripPrefix + comment line giải thích (Conventions #11) — verify `curl :8080/api/catalog/products` qua gateway khớp `curl :8082/api/catalog/products` *(gateway yml Để nguyên theo boundary task này — coordinator xử lý block un-comment)*
- [x] Bilingual JSONB đọc qua `I18nText.resolve`; mọi DTO trả string ĐÃ resolve (KHÔNG trả object i18n ở public API)
- [x] Verify: IT — seed 2 category + 3 product (1 en-slug riêng, 1 draft) qua repository → list filter/sort/pagination đúng, detail slug vi+en 200, draft 404, categories tree đúng
- [ ] Commit: `feat(catalog): public products/categories APIs — locale resolution + ProductCard/Detail`

### Task 4: searchengine-interface-pgfts-impl

**Files:** Create `search/SearchEngine`, `search/PgFtsEngine`, `search/SearchQuery`, `search/SearchEngineConfig`

- [x] `interface SearchEngine`: `Page<ProductCard> search(SearchQuery q)` + `SuggestResponse suggest(String q, String locale)` + `void index(ProductEntity p)` + `void delete(String productId)` + `void reindexAll()` + `String name()`
- [x] `SearchQuery`: `q, locale, categorySlug, sort, page, size` (+ filters dùng chung list khi cần)
- [x] `PgFtsEngine`: native query `WHERE search_vec @@ to_tsquery('simple', f_unaccent(:q)::regconfig...)` — build tsquery từ q (split terms + `:*` prefix); JOIN filter category/price/rating/brand/official + sort giống listProducts; fallback content vi-only (pack spec); suggest: trgm `similarity(name->>'vi', :q) > 0.1 ORDER BY similarity DESC LIMIT 5` products + categories ilike
- [x] `SearchEngineConfig` (`@Configuration`): bean chọn lúc startup — `elasticsearch.uri` blank → PgFtsEngine + log INFO; else ping ES (`ping` timeout 2s): reachable → EsEngine, fail → PgFtsEngine + log **WARN degraded**
- [x] Verify: IT (chưa có ES container trong classpath? vẫn pass — PgFts được chọn) — seed qua repo → search "điện thoạı" (sai dấu) khớp product "Điện thoại" (unaccent), sort/pagination đúng, suggest trả ≤5+5
- [x] Commit: `feat(catalog): SearchEngine interface + PgFtsEngine — simple+unaccent, trgm suggest`

### Task 5: es-indexer-perlocale-productchanged-reindex

**Files:** Create `search/EsEngine` (phần index), `search/ProductIndexer`, `search/EsIndexConfig`, `config/RabbitMqConfig`, `search/StartupReindexRunner`; Modify pom (đã có dep ES)

- [x] `EsIndexConfig`: lúc startup nếu ES reachable → tạo index `products` if-missing với mapping: `name.vi/name.en` (text, analyzer standard), `description.vi/.en` (text), `brand` (keyword), `categorySlugs` (keyword[] — chứa cả slug_vi + slug_en của category path), `price` (long), `discount` (double — `(compare-price)/compare` khi compare>price else 0, cho sort=discount), `ratingAvg` (double), `ratingCount` (int), `official` (boolean), `status` (keyword), `tags` (keyword[]), `slugVi/slugEn` (keyword), `flashSaleEndsAt` (date), `imageUrl/imageAlt`, `createdAt` (date)
- [x] `ProductIndexer`: build document từ ProductEntity (published only); `@RabbitListener(queues = "q.catalog.product-changed.indexer")` consume `EventEnvelope` payload `product.changed`: idempotent tryConsume → action CREATED/UPDATED → re-load entity, nếu published → `index()` else delete doc; DELETED → `delete(productId)`; ES throw → log ERROR, KHÔNG rethrow crash app (message ack; startup reindex sẽ tự heal)
- [x] `StartupReindexRunner` (`ApplicationRunner`, `@ConditionalOnProperty` enable): nếu ES reachable → `reindexAll()` (xóa index + tạo lại + bulk toàn bộ published; log count); chạy SAU seed (xử lý: seed trước runner theo `@Order` — SeedDataRunner order thấp hơn)
- [x] Rabbit config: `TopicExchange("ecommerce.events", durable)` + 2 `Queue` durable + `Binding` routing key `product.changed` (indexer queue); common-lib relay đã publish — NHỚ khai báo exchange BEAN kiểu `TopicExchange` idle (không declare trùng conflicting args)
- [x] Verify: IT với `ElasticsearchContainer` (image `elasticsearch:8.17.4`, enabled security off) — tạo product published + outbox event mô phỏng → listener index doc (assert `GET /products/_doc/{id}` có name.vi + name.en); DELETED → doc biến mất; `reindexAll()` → `_count` = số published
- [x] Commit: `feat(catalog): ES indexer per-locale + product.changed consumer + startup reindex`

### Task 6: es-search-query-suggest-locale

**Files:** Modify `search/EsEngine` (search + suggest)

- [x] `search()`: bool query — must `multi_match` `q` trên `name.{locale}^3, description.{locale}` (operator AND, fuzziness AUTO); 0 hit → retry query `name.vi` (fallback vi, pack D15); filters: `term categorySlugs` (slug truyền vào khớp cả vi/en), `term official`, `range price`, `range ratingAvg`; sort map: price_asc/price_desc/rating (ratingAvg desc, ratingCount tiebreak)/newest (createdAt desc)/**discount (sort field index-time `discount` DESC — đã map ở Task 5)**; sau search → **hydrate ProductCard từ PG theo ids (`WHERE id = ANY`), giữ thứ tự score ES** — PG là nguồn sự thật giá/ảnh/slug resolve locale
- [x] `suggest()`: `match_phrase_prefix` trên `name.{locale}` size 5 + categories từ PG ilike (dùng chung query Task 4) → `SuggestResponse`
- [x] Runtime degradation: mọi ES call bọc try — fail → delegate `PgFtsEngine` + log WARN (state flag, không 500)
- [x] Verify: IT ES container — index 3 docs (vi+en names khác nhau) → search q vi khớp doc vi, `?locale=en` khớp name.en, suggest prefix đúng, ES dừng (container pause) → fallback vẫn trả kết quả
- [x] Commit: `feat(catalog): EsEngine search/suggest — per-locale fields + runtime fallback PgFts`

### Task 7: redis-cache-invalidate-productchanged-outbox

**Files:** Create `cache/CatalogCacheService`, `cache/CacheInvalidateConsumer`, `config/RedisConfig`; Modify `service/CatalogQueryService` (wrap detail/tree/home), `config/RabbitMqConfig` (**append cache Queue + Binding — queue phải được khai báo hoặc listener 404-loop**)

- [x] Keys + TTL: `cat:prod:{slugVi}:vi|en` (600s — key theo slugVi gốc cả 2 locale; lookup qua slugEn resolve entity trước rồi key theo slugVi), `cat:cat-tree:{locale}` (1800s); `cat:home:{locale}` BỎ (xem bullet home bên dưới)
- [x] Cache-aside: query service check Redis trước; miss → load PG → serialize JSON (`ObjectMapper`, có `@ClassProperty`? KHÔNG — record DTO thuần, GenericJackson2JsonRedisTemplate hoặc String + ObjectMapper) → set TTL *(chọn String + ObjectMapper qua `config/RedisConfig`; mọi redis op bọc try/catch — Redis chết → WARN rate-limited 1 phút/lần, bypass cache serve nguồn, không throw — §5)*
- [x] `CacheInvalidateConsumer`: `@RabbitListener("q.catalog.product-changed.cache")` idempotent → xóa `cat:prod:{slugVi}:*` + `cat:prod:{slugEn}:*` (SCAN match, không KEYS); DELETED cũng invalidate tương tự *(KHÔNG wipe `cat:cat-tree:*` — tree chỉ đổi khi write category, mà category write KHÔNG emit event (T8b) nên wipe ở đây vô nghĩa; tree stale tự hết TTL 1800s)*
- [x] cat:home backend cache BỎ (deviation: Next ISR 60s đã cache home listing; double-cache = YAGNI — invalidate consumer chỉ wipe prod keys; coordinator duyệt trong dispatch)
- [x] Verify: IT Redis `GenericContainer("redis:7")` — detail gọi 2 lần (hit Redis, key tồn tại TTL>0); publish event → key biến mất *(thêm: redis-down bypass test + marker `cache:` prefix per-consumer — marker IdempotentConsumer global theo messageId, 2 queue cùng eventId không prefix = consumer poll trước "ăn" marker của queue kia)*
- [x] Commit: `feat(catalog): redis cache detail/tree + product.changed invalidate consumer`

### Task 8: product-fields-compareprice-flash-rating

**Files:** Modify `web/dto` + `service` (đã có từ Task 3 — task này bảo đảm đủ fields + admin view)

- [ ] Kiểm tra/hoàn thiện (read-side DONE ở 6f4ae42): `comparePrice`, `discountPercent` computed, `flashSaleEndsAt` (ISO-8601 UTC), `ratingAvg` (1 chữ số thập phân), `ratingCount`, `official` (API field + filter), `tags[]` — chạy sạch trên ProductCard + ProductDetail; flash product = `flashSaleEndsAt > now()` (helper `isFlashActive()` — storefront tự lọc từ response, KHÔNG thêm endpoint) *(flashSaleEndsAt chỉ trả khi còn active — hết hạn = vắng field, card render thường khớp Q12)*
- [x] `ProductWrite` admin fields map đủ (write-side → Task 8b): `nameI18n, descriptionI18n, seoTitleI18n, seoDescriptionI18n (nullable), slugVi, slugEn, brand, price, comparePrice, flashSaleEndsAt, tags, categoryId, images[{url,alt,position}], variants[{nameI18n,options,size?,color?,priceDelta?→price override...}]` — CHỐT mapping variant write: contract gửi `nameI18n + options + priceDelta + stock`; SF-4 lưu: `name_i18n = nameI18n`, `color = options.color`, `size = options.size`, `price = priceDelta != null ? product.price + priceDelta : null` (không có stock — ignore input stock, trả stock 0) *(write mapping là việc của Task 8b AdminCatalogService — read-side mapping Q5c đã hoàn thiện + IT verify)*
- [x] Verify: IT create product qua service với comparePrice (→ Task 8b) + flash + variants có priceDelta → ProductCard trả đủ discountPercent + flashSaleEndsAt; variant priceDelta đúng hiệu *(verify bằng ProductApiTest seed qua repository — cùng surface đọc, admin write chưa tồn tại ở Task 3/8)*
- [ ] Commit: `feat(catalog): complete product fields — compare/flash/rating/official/tags + variant delta mapping`

### Task 8b: admin-crud-security-outbox-producer

**Files:** Create `config/SecurityConfig`, `config/JwtDecoderConfig`, `web/AdminProductController`, `web/AdminCategoryController`, `admin/AdminCatalogService`, `web/dto/ProductAdmin*`, `web/dto/CategoryAdmin*`; Create `backend/services/catalog-service/scripts/mint-admin-token.sh`; Modify pom (thêm `spring-boot-starter-security` + `spring-boot-starter-oauth2-resource-server` — Conventions #3); IT `admin/AdminCatalogIT`

- [x] `SecurityConfig`: `SecurityFilterChain` — permitAll: `GET /api/catalog/products/**`, `/api/catalog/categories/**`, `/api/catalog/search/**`, `/actuator/**`, `/v3/api-docs/**`, `/swagger-ui/**`; **`/api/catalog/admin/**` requires `hasRole("ADMIN")`** (path service-side giữ full prefix — Conventions #11); mọi method khác admin = authenticated; session STATELESS; CSRF off (API token-only); fail-closed 401 khi không token
- [x] `JwtDecoderConfig`: bean `JwtDecoder` — nếu env `SECURITY_JWKS_URI` set → `NimbusJwtDecoder.withJwkSetUri(...)` (SF-3+ dùng); else RS256 từ PEM `JWT_PUBLIC_KEY_PATH` (default `infra/keys/jwt-public.pem`, đọc file lúc startup); `JwtAuthenticationConverter` map claim linh hoạt: `roles[]` array / `role` string / `scope` chứa `ADMIN` → `ROLE_ADMIN`
- [x] Admin endpoints theo contract §admin (đường dẫn service-side = gateway path, không strip): `GET/POST /api/catalog/admin/products`, `GET/PUT/DELETE /api/catalog/admin/products/{id}`, `GET/POST /api/catalog/admin/categories`, `GET/PUT/DELETE /api/catalog/admin/categories/{id}`; DTO `ProductAdminItemPage {items[{...ProductCard, status, slugVi}], page, size, total}`, `ProductAdminView = ProductDetail + {status, nameI18n, descriptionI18n, seoTitleI18n?, seoDescriptionI18n?, slugVi}` (trả i18n GỐC để edit), `CategoryAdmin = Category + {nameI18n, slugVi}`; publish/unpublish = PUT `ProductWrite.status` DRAFT↔PUBLISHED (contract không có endpoint riêng)
- [x] Validation: `nameI18n.vi`/`descriptionI18n.vi` non-blank; `en` optional (Q5b); slug unique vi+en → 409 qua DataIntegrityViolation handler; DELETE category có product/con → 409; DELETE product = soft-delete (`deleted_at`) + event action DELETED
- [x] **Outbox producer:** MỌI write (create/update/delete + tạo/xóa category) → `OutboxWriter.write("product.changed", payload{productId, action CREATED|UPDATED|DELETED, slugVi, slugEn, changedAt}, correlationId)` trong CÙNG tx (`@Transactional`) — correlationId từ header `X-Request-Id`
- [x] `mint-admin-token.sh` (bash + openssl, không deps): build JWT RS256 từ `infra/keys/jwt-private.pem` với claim `{roles: ["ADMIN"], sub: "dev-admin", exp: +1h}` → in token ra stdout (usage: `TOKEN=$(scripts/mint-admin-token.sh); curl -H "Authorization: Bearer $TOKEN" ...`)
- [x] Verify (IT): admin list/create/update/delete product + categories happy-path; không token → 401; token không role ADMIN → 403; create product PUBLISHED → row `outbox` event_type `product.changed` action CREATED (assert qua JdbcTemplate); delete category có con → 409; i18n chỉ-vi (omit en) → 201
- [x] Commit: `feat(catalog): admin CRUD + ROLE_ADMIN JWT guard + outbox product.changed producer + mint token script`

### Task 9: seed-data-tiki-categories-bilingual

**Files:** Create `seed/SeedDataRunner`, `seed/SeedData` (data holder)

- [x] `@Component SeedDataRunner implements ApplicationRunner`, `@ConditionalOnProperty(name = "catalog.seed.enabled", havingValue = "true", matchIfMissing = true)`; `@Order` TRƯỚC StartupReindexRunner; IT đặt `catalog.seed.enabled=false`
- [x] Idempotent: `productRepository.count() > 0` → skip + log; transactional. **Flash-refresh chạy cả khi skip seed:** nếu có product `flash_sale_ends_at` mà TẤT CẢ < now → bump các row đó lên `now + 2 ngày` (log INFO — chống acceptance countdown chết khi verify >2 ngày sau seed)
- [x] 6 categories gốc + children (tổng ~10 node), tên/icon bilingual: Điện Tử/Electronics ⚡, Thời Trang/Fashion 👕, Nhà Cửa/Home & Living 🏠, Sách/Books 📚, Làm Đẹp/Beauty 💄, Mẹ & Bé/Mom & Baby 🍼 (icon = emoji hoặc tên gradient key §1.8)
- [x] ~24 products Tiki-realistic bilingual vi+en (tên dễ search, KHÔNG trùng nhau): ĐT Xiaomi Redmi 13C / Nokia 110, Laptop ASUS VivoBook, Tai nghe Bluetooth, Smart TV, Áo thun, Váy, Giày sneaker, Nồi chiên không dầu, Máy xay sinh tố, Bộ chăn ga, Sách "Nhà Giả Kim" (Paulo Coelho / The Alchemist), Tiểu thuyết, Son dưỡng, Kem chống nắng, Tã dán, Sữa bột... — mỗi product: name/description {vi,en}, slug_vi (không dấu, dash) + slug_en, brand, price VND thực (290.000–24.990.000), 6-8 sản có `compare_price` > price, **3-4 sản `flash_sale_ends_at = Instant.now() + Duration.ofDays(2)`** (lúc seed), rating_avg phân bố 3.5–5.0 + rating_count 5–2.500, `official=true` ~nửa (badge Chính hãng), tags ví dụ `["Chính hãng"]`, `["Freeship"]`, `["Hàng mới"]` (kèm en? tags là string[] đơn — dùng vi), 2-3 ảnh/ SP url "" + alt, 1-2 variant (màu/size) cho ~6 SP áo/giày
- [x] Sau seed (cùng runner): `searchEngine.reindexAll()` nếu ES engine (gọi an toàn — PgFts reindexAll = no-op) → ES có docs (§5.9)
- [x] Verify: chạy local `make dev svc=catalog` (seed bật; **export ELASTICSEARCH_URI=http://localhost:9200 trước khi chạy — đảm bảo ES container up từ `make infra`**) → log seed 24 products; `curl :8082/api/catalog/products?size=100` total=24; `curl :9200/products/_count` > 0; chạy lại service lần 2 → KHÔNG seed doubling (total vẫn 24)
- [x] Commit: `feat(catalog): seed 6 categories + 24 products bilingual idempotent + reindex`

### Task 10: nextjs-storefront-scaffold-locale-routing-hreflang

**Files:** Create `frontend/apps/storefront-web/**`; Modify `frontend/pnpm-workspace.yaml` (catalog: next + @types/node); gateway-routes.yml (un-comment catalog + append Next block)

- [x] Scaffold Next 14 App Router thủ công (không create-next-app): `package.json` (`@ecommerce/storefront-web`, scripts: `dev: next dev -p 3000`, `build: next build`, `lint: next lint --max-warnings=0` HOẶC tsc, `start: next start -p 3000`, `test: vitest run`), `tsconfig.json` strict, `next.config.mjs` (transpilePackages không cần — ui-kit plain), `next-env.d.ts`
- [x] Deps: `next: catalog:, react: catalog:, react-dom: catalog:, @ecommerce/contracts + @ecommerce/ui-kit + @ecommerce/i18n: workspace:*`; devDeps `@types/react: catalog:, @types/react-dom: catalog:, @types/node: catalog:, typescript: catalog:, vitest: catalog:`; chạy `pnpm install` cập nhật lockfile; `next.config.mjs` có **`transpilePackages: ['@ecommerce/ui-kit','@ecommerce/contracts','@ecommerce/i18n']`** + `rewrites()` proxy `/api/:path*` → `${process.env.GATEWAY_URL || 'http://localhost:8080'}${'/'}` (client components gọi relative `/api/...` — Conventions #10)
- [x] `app/[locale]/layout.tsx`: parse locale param (khác vi/en → notFound); html lang; fonts Be Vietnam Pro (next/font/google); import ui-kit tokens.css + styles.css; `<Header locale>` (logo + SearchBar client + cart/account icon links `/cart`, `/account`) + mini-nav primary (§2.1) + `<Footer>`; metadata `alternates.languages` (hreflang vi/en) qua helper `buildAlternates(path, slugs)`
- [x] `middleware.ts`: rewrite `/`→`/vi`, `/c/:slug`→`/vi/c/:slug`, `/p/:slug`→`/vi/p/:slug`, `/search`→`/vi/search`, `/coupons`→`/vi/coupons` (URL không đổi); `/en/*` pass; matcher loại `/_next|favicon|robots.txt|sitemap.xml`
- [x] `lib/catalog-api.ts`: `createCatalogClient({ baseURL: GATEWAY_URL env default http://localhost:8080, fetchImpl: cachedFetch })` với `cachedFetch` gắn `next: { revalidate: 60 }` + `Accept-Language` không cần (locale qua query); helper `resolveText`, `formatVnd(1_290_000) → "1.290.000 ₫"` (dấu chấm nghìn + khoảng trắng trước ₫ — khớp direction §3), `categoryGradient(slug)` map §1.8, `discountPercent` guard
- [x] `lib/seo.ts`: `buildAlternates`, `pdpMetadata(product, locale)` — priority `seoTitle/seoDescription` (đã resolve) → fallback `name | text` từ name/description; trả `robots: noindex` khi `locale=en && dùng fallback` (thiếu bản dịch); absolute URLs từ env `SITE_URL` default `http://localhost:3000`; **locale-switcher header: vi → cùng path không prefix, en → `/en/` + path (luôn có trailing segment, không link `/en` bare)**
- [x] **gateway-routes.yml**: append block `storefront-web` MỚI (block `catalog` đã un-comment ở Task 3): `id: storefront-web, uri: http://localhost:3000, predicates: [ "Path=/,/c/**,/p/**,/search,/coupons,/sitemap.xml,/robots.txt,/en,/en/**,/_next/**" ]` (append-only, ĐẶT TRƯỚC các block placeholder sau; không xóa comment template của SF khác; `/en` bare cho locale-switcher từ home; không filter — Next serve paths gốc)
- [x] Verify: `pnpm -C frontend --filter @ecommerce/storefront-web dev` → :3000 mở được `/` (trang stub "loading catalog"), `/en/` variant, `curl :3000/robots.txt` 200; gateway :8080 route `/` → Next (không cần catalog live)
- [x] Commit: `feat(storefront): next scaffold — locale routing vi/en + hreflang + gateway route split D16`

### Task 11: home-ssr-flashdeal-featured

**Files:** Create `app/[locale]/page.tsx` (home server) + `components/home/*` + client components

- [x] Server component: fetch `listProducts?size=24&sort=discount&locale=` (1 call) → flash rail = items `flashSaleEndsAt > now` (≤10), featured grid = còn lại sort rating desc (8), categories = `getCategories` cho tile grid 6 cột (+ tile "Xem thêm" dashed)
- [x] Hero carousel (client `HeroCarousel`): 3 slide gradient `120deg` §1.8, kicker + title 44px + nút "Mua ngay" accent, arrows/dots, auto-rotate 5s (nếu đơn giản), track translateX .45s
- [x] FlashDealSection: nền gradient vàng `180deg #FFD839→#FFB800`, h2 + `<Countdown endsAt>` client (hh:mm:ss, tabular-nums, hộp #212121 chữ accent, tick 1s, hết → ẩn block); card 186px scroll-x: badge -% primary, gradient thumb theo category, giá danger + gạch
- [x] CategoryTiles: grid 6 cột, gradient theo danh mục + emoji, hover translateY(-2px)
- [x] FeaturedGrid: dùng `ProductCardView` DÙNG CHUNG (components/ProductCardView.tsx — anatomy §2.3: thumb 190px gradient + badge -% + tint badges §1.6 từ tags, tên clamp 2 dòng 13px/600, giá danger 17px/800 + gạch, StarRating ui-kit + count) — link `/p/{slug}` (en: `/en/p/{slugEn}`)
- [x] Footer 4 cột nền #212121 (§2.2.5)
- [x] Verify: IT-ready — `curl :3000/` HTML chứa tên sản phẩm seed + giá (SSR thật, KHÔNG skeleton-only); `/en` HTML chứa tên tiếng Anh; chạy `pnpm --filter @ecommerce/storefront-web test` (vitest smoke render lib) xanh
- [x] Commit: `feat(storefront): home SSR — hero carousel + flash countdown + featured grid`

### Task 12: plp-ssr-sidebar-filter-grid-pagination

**Files:** Create `app/[locale]/c/[slug]/page.tsx` + `components/plp/*`; Modify `lib/catalog-api.ts` (nếu cần)

- [x] Server: parse searchParams (`price` ranges? — CHỐT UI: checkbox khoảng giá map `minPrice/maxPrice`; `rating` `minRating`; `brand` text; `official`) + `sort` + `page` → fetch `listProducts` — URL params = state (SEO friendly, server-rendered), KHÔNG client fetch cho results
- [x] Breadcrumb (Trang chủ → {category name}), h1 28px/800 uppercase + count
- [x] Sidebar `256px + 1fr`: block cây danh mục (fetch categories, highlight active + children), block giá (checkbox preset: Dưới 500k / 500k–1tr / 1–2tr / 2–5tr / Trên 5tr → minPrice/maxPrice), block rating (4★+ / 3★+), block thương hiệu (từ seed list static? — từ results meta nếu API không có — CHỐT: filter brand = text input), nút "Xóa tất cả" (link bỏ params)
- [x] Toolbar: kết quả text + sort select (price_asc/price_desc/rating/newest/discount — đổi = navigate URL, giữ filters) + grid 3 cột ProductCardView + Pagination (34×34 nút, active primary; window ±2 đầu/cuối; prev/next; đổi page = URL)
- [x] Empty state (ui-kit EmptyState): "Không tìm thấy sản phẩm phù hợp" + nút xóa filter
- [ ] Verify: `curl ":3000/c/dien-tu"` HTML có products thuộc Điện Tử; `?sort=price_asc` đổi thứ tự trong HTML; `?minRating=4` lọc; page=2 khác page=1; sidebar categories đúng active
- [x] Commit: `feat(storefront): PLP SSR — sidebar filters + sort + pagination server-rendered`

### Task 13: pdp-ssr-gallery-variant-jsonld-og

**Files:** Create `app/[locale]/p/[slug]/page.tsx` + `components/pdp/*` (client: GalleryClient, VariantSelector, QtyStepper, AddToCartStub)

- [x] `generateMetadata`: theo spec `lib/seo.ts` — seo_title/seo_description ưu tiên, OG `{title, description, images: [imageUrl hoặc gradient placeholder]}`; `alternates.languages` với slugVi/slugEn; fallback-en → `robots: { index: false }` + render `<meta name="robots" content="noindex">` (Task 13 còn FIX bug hreflang en: enPath giờ mang prefix `/en` — `/en/p/{slugEn}`)
- [x] JSON-LD: `<script type="application/ld+json">` Product schema — name (locale), image, description, brand, sku? bỏ, `offers {price, priceCurrency VND, availability InStock, url}` + `aggregateRating {ratingValue, reviewCount}` (chỉ khi count > 0)
- [x] Gallery client: ảnh chính aspect 1/1 (url rỗng → gradient theo category + emoji), 4 thumbs 72px, active border primary; flag -% góc
- [x] Info: h1 23px, meta "Đã bán X" (rating_count làm proxy "đánh giá"), price-block #FFF1F0 (34px/800 danger + gạch + pill -% + note), Variants client (swatch màu 38px / chip size — chọn đổi giá hiển thị = price + priceDelta, đổi gallery thumb nếu biến thể có ảnh riêng → dùng chung ảnh), QtyStepper (1–99), tồn kho: fetch `GET /api/inventory/availability?variantIds=` client-side — lỗi/404 → KHÔNG render tồn kho (ẩn) *(contract thật: availability theo VARIANT, không phải productIds — adapt theo inventorySchema.d.ts)*; **AddToCartStub** client: nút "THÊM VÀO GIỎ" (outline 2px) + "MUA NGAY" (gradient) — click gọi `POST /api/cart/items {productId, variantId?, qty}` (cart contract) qua gateway, lỗi mọi loại → toast êm "Giỏ hàng sẽ sớm khả dụng" (Toast nội bộ tối giản, KHÔNG import ui-kit Toast stateful), KHÔNG crash
- [x] Perks row (Chính hãng/Freeship icons tint) + tabs (Mô tả / Thông tin / Đánh giá — đánh giá tab: "Sắp ra mắt" placeholder TEXT ONLY, KHÔNG components/reviews của SF-8) + breadcrumb category path (fetch categories, tìm path theo categoryId); tồn kho + add-to-cart gọi **relative `/api/inventory/availability`, `/api/cart/items`** (qua Next rewrites proxy — Conventions #10)
- [x] Related: skip (relatedCount 0 — section chỉ hiện khi có, pack KHÔNG yêu cầu API related ở SF-4)
- [ ] Verify: view-source `/p/{slug-vi}` chứa tên + giá VND + JSON-LD Product + og:title; `/en/p/{slug-en}` tên tiếng Anh; product chỉ-vi → `/en/p/...` hiện nội dung vi + meta noindex; product có seo_title seed → metadata dùng giá trị tay (check view-source `<title>`) *(catalog :8082 DOWN khi execute Task 13 — verify SSR-content này cần catalog live: chạy ở Phase 5 render-smoke; đã verify phần không-cần-catalog: catalog-down → 200 graceful "tạm thời không khả dụng" + `/fr/p/x` → 404 custom page)*
- [x] Commit: `feat(storefront): PDP SSR — metadata/JSON-LD/OG + gallery/variant client + cart stub`

### Task 14: search-couponcenter-sitemap-robots + wiring

**Files:** Create `app/[locale]/search/page.tsx`, `app/[locale]/coupons/page.tsx`, `app/sitemap.ts`, `app/robots.ts`, `components/SearchBar.tsx` (client); Modify gateway (nếu thiếu), docker-compose (đã ở Task 1)

- [x] `/search?q=`: server fetch `searchProducts({q, locale, page, size:12})` → grid ProductCardView + pagination + count; q rỗng → empty state; không kết quả → EmptyState gợi ý từ khóa
- [x] `SearchBar` client (header): input viền 2px primary + nút search; focus mở dropdown suggest — debounce 250ms gọi `suggestProducts({q, locale})` → nhóm "Sản phẩm" (5, link PDP) + "Danh mục" (5, link PLP); blur/click-outside đóng; Enter → navigate `/search?q=`; tag "ĐANG HOT" cho item flash (nếu có flashSaleEndsAt)
- [x] `/coupons`: server fetch `GET /api/ordering/coupons/public` qua gateway fetch helper — **lỗi mọi loại (route chưa có/SF-9) → render empty state "Chưa có mã giảm giá nào — quay lại sau nhé"** (mock-gate đúng pack); khi có data → card list mã + nút "Copy" (client, clipboard + toast)
- [x] `app/sitemap.ts`: fetch products (loop size=100 all pages, locale vi dùng slug_vi + en dùng slug_en qua alternates) + static routes (`/`, `/search`, `/coupons` + `/en/...`) → `MetadataRoute.Sitemap` với `alternates.languages`; cache 3600; lỗi fetch → trả static-only (không crash build)
- [x] `app/robots.ts`: allow all, disallow `/cart|/checkout|/account|/admin`, sitemap absolute URL từ env `SITE_URL` default `http://localhost:3000`
- [ ] Wiring check cuối: `make dev svc=catalog` + `make dev-fe app=storefront-web` + `make dev svc=gateway` → qua gateway :8080: `/` 200 Next HTML, `/api/catalog/products` JSON, `/robots.txt` 200, `/_next/static` asset 200 — **DEFER → Phase 5** (backend/gateway ngoài boundary executor Task 14; verify full-stack bằng render-smoke + browser ở Phase 5)
- [ ] Verify: curl qua gateway từng route trên + `/search?q=xiaomi` trả HTML có kết quả (**export ELASTICSEARCH_URI=http://localhost:9200 khi chạy catalog**; ES container up) — **DEFER → Phase 5** (cần catalog+ES live); curl storefront standalone (:3000, gateway down) đã pass tại Task 14
- [x] Commit: `feat(storefront): search page + suggest bar + coupon center mock-gate + sitemap/robots` (wiring verify defer Phase 5)

### Task 15: storefront-it-tests + acceptance sweep chuẩn bị

**Files:** Create `frontend/apps/storefront-web/tests/*` (vitest), `scripts/render-smoke.mjs` (node — build+start+assert); Modify catalog-service ITs nếu còn thiếu case admin guard

- [ ] Vitest unit: `formatVnd`, `resolveText` fallback, `buildAlternates`, `pdpMetadata` priority (seo_title > fallback; fallback-en noindex flag), `categoryGradient` map, middleware rewrite table (viết test cho hàm match nếu tách được, nếu không → render-smoke phủ)
- [x] `scripts/render-smoke.mjs`: yêu cầu catalog live + seeded (check `curl :8082/actuator/health` trước, else exit 1 với hướng dẫn); `next build` + `next start` (hoặc dev server) → assert: `GET /` chứa tên product seed + giá format VND; `GET /p/{slug-vi}` chứa JSON-LD `"@type":"Product"` + tên + giá; `GET /en/p/{slug-en}` chứa tên EN; `GET /sitemap.xml` 200 chứa `/p/`; `GET /robots.txt` 200 chứa `Disallow: /cart`; `GET /c/dien-tu` chứa tên category; `GET /search?q=` có kết quả (**AUTHORED ở Task 15 — EXECUTE ở Phase 5**: health preflight qua `${GATEWAY_URL}/actuator/health`, env `GATEWAY_URL`/`BASE_URL`/`SLUG_VI`/`SLUG_EN`, tên product/category resolve động qua API; chạy `pnpm --filter storefront-web smoke`)
- [ ] catalog-service IT bổ sung (nếu thiếu): reviews/wishlist paths → default 404 (JSON Boot, không RFC 7807 — ghi nhận, không test shape); **PgFts-only IT dùng context riêng `elasticsearch.uri=` rỗng + tắt ES container properties (2 context config trong suite — thiết kế sẵn, không để ES container auto-start chung)**. Admin guard/crud ITs đã nằm ở Task 8b — không nhân bản
- [ ] Verify: `pnpm --filter @ecommerce/storefront-web test` xanh + `mvn -pl services/catalog-service verify` xanh toàn bộ (failsafe Tests run > 0). **`render-smoke.mjs` chỉ AUTHOR ở task này — EXECUTE ở Phase 5** (cần catalog live + seeded + ES; worker KHÔNG block chạy nó)
- [ ] Commit: `test(storefront): unit helpers + render smoke script (authored, execute Phase 5)`

---

## Verification cuối (Phase 5 — KHÔNG phải task của executor)

1. Chạy từng dòng ACCEPTANCE của `docs/superpowers/contexts/sf-4.md` (10 dòng user-visible) — bằng lệnh thật (curl/browser), ghi evidence từng dòng.
2. Rule 0 browser 3 tầng: DOM đo thật → mở Orca browser (`orca tab create`) nhìn home/PLP/PDP/search → đi flow guest: home → category → filter → PDP → variant → search → suggest → locale switch.
3. §5.9: `curl :9200/products/_count` > 0; `docker stop ecommerce-elasticsearch` → `curl ":8080/api/catalog/search?q=xiaomi"` VẪN 200 (PgFts fallback, không 500) → start lại ES.
4. Admin publish → PLP/PDP thấy trong ~60s.
5. Code-reviewer độc lập APPROVED (comment VERDICT trên FI-314) → merge → story-verify → Done.
