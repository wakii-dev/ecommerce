# SF-11 — partner Open API (D19) — Design Spec

- **Linear:** FI-321 · **Story:** FI-310 · **Nhánh đích:** `story/fi310-ecommerce-platform`
- **Context pack:** `docs/superpowers/contexts/sf-11.md` · **Contract (frozen):** `contracts/openapi/partner-api.yaml`
- **Status:** Approved (autonomous — spec-critic gate chạy trước Phase 3)
- **Date:** 2026-09-07

## 1. Problem & goals

Đơn vị đối tác bên ngoài cần cửa kết nối công khai **an toàn** với platform: xác thực bằng API key (không JWT customer), rate-limit theo key, đọc catalog, tạo/tra cứu đơn, nhận webhook HMAC khi đơn đổi trạng thái, và docs portal tự phục vụ. Chứng minh kiến trúc **mở** được API cho bên thứ ba (khác biệt so với shop thông thường).

Success = asserts **§5.13**: curl `X-API-Key` hợp lệ → products trả catalog; key sai/hết hạn → 401; `/open-api/v1/docs` mở được; đơn đổi trạng thái → webhook POST HMAC-signed nhận được (verify bằng secret).

## 2. Scope

**In:** `partner-api` service (:8091, `db_partner`) — partners/api_keys registry, X-API-Key auth + rate-limit (Bucket4j in-memory), `/open-api/v1/**` (catalog proxy read, POST /orders, GET /orders/{id}), webhook HMAC delivery (consume `order.*`, retry exponential → DLQ), springdoc docs portal, gateway route + compose + Makefile + `.env.example` + db_partner init. IT tests.

**Out (boundary):** OAuth2/OIDC partner portal (backlog client-credentials) · billing/usage metering · sửa `contracts/**` hay services khác · đụng file SF-12 (affiliate) · partner admin portal UI.

## 3. Architecture

Service fork từ conventions template (Spring Boot 3.3.5, Java 21, common-lib, Flyway, springdoc). Package `com.ecommerce.partner`:

```
partner-api/
├── config/        SecurityConfig (permitAll + filterchain riêng), RabbitMqConfig,
│                  PartnerProperties (timeouts/URLs/retry), OpenApiConfig (springdoc)
├── auth/          ApiKeyAuthFilter (OncePerRequestFilter) · ApiKeyPrincipal ·
│                  ApiKeyService (hash/lookup/scopes) · PartnerRateLimiter (Bucket4j)
├── web/           PartnerCatalogController · PartnerOrderController ·
│                  PartnerErrorHandler (problem+json)
├── proxy/         CatalogClient (RestClient) · OrderingClient · IdentityClient (service account)
├── webhook/       PartnerEventConsumer (queue partner.orders) · WebhookDeliveryService ·
│                  WebhookRetryScheduler · HmacSigner
├── domain/        Partner · ApiKey · PartnerOrderRef · WebhookDelivery (+ repo/)
└── seed/          PartnerSeedRunner (profile seed)
```

Controllers map **full path** `/open-api/v1/**` (gateway route KHÔNG StripPrefix — như catalog precedent).

### 3.1 Auth + rate-limit (một filter, không JWT)

`ApiKeyAuthFilter` (chạy trước mọi controller, exempt: `/open-api/v1/docs*`, `/open-api/v1/api-docs*`, `/swagger-ui/**`, `/v3/api-docs/**`, `/actuator/**`):

1. Đọc `X-API-Key` — thiếu → **401** problem+json.
2. `prefix = key[0..8]` → lookup candidates `WHERE prefix = ?` → so `sha256(raw)` bằng `MessageDigest.isEqual` (constant-time) — không khớp → **401**.
3. Check: partner `ACTIVE`, `revoked_at IS NULL`, (`expires_at` NULL hoặc > now) — vi phạm → **401**.
4. Scope theo path: `/products*`, `/categories*`, `/search*` → `catalog:read`; `POST /orders` → `orders:write`; `GET /orders/{id}` → `orders:read`. Thiếu scope → **403** problem+json.
5. Rate-limit: Bucket4j per `api_key.id` — capacity = `partners.rate_limit_per_min`, refill greedy 60s. Vượt → **429** + `Retry-After` (giây đến token kế).

Bucket cache in-memory `ConcurrentHashMap` (đổi `rate_limit_per_min` có hiệu lực sau restart — MVP; ADR: Redis-backed khi scale multi-instance).

### 3.2 Catalog proxy (public GET — không cần token)

| Partner endpoint | Catalog target (REST, base :8082) | Mapping |
|---|---|---|
| `GET /products?page&size&category` | `GET /api/catalog/products?page&size&category` | card → `PartnerProduct` (id, slug, name, price, updatedAt=thời điểm proxy¹) |
| `GET /products/{idOrSlug}` | slug → `GET /api/catalog/products/{slug}`; UUID-shaped → thêm `GET /api/catalog/admin/products/{id}` (chỉ khi `CATALOG_API_TOKEN` có — interim như ordering pricing) | detail → `PartnerProductDetail` (+description, variants: price = base + priceDelta) |
| `GET /categories` | `GET /api/catalog/categories` (tree) | **flatten** đệ quy → `PartnerCategory[]` (parentId) |
| `GET /search?q&page&size` | `GET /api/catalog/search?q&page&size` | card page → `PartnerProductPage` |

¹ **GAP-2** (flag FI-310): catalog public DTO không có `updatedAt` — trả thời điểm proxy + ghi chú docs; amendment thêm trường public thì swap.

`stock` không expose (schema optional; expose-stock flag chưa thuộc scope). Catalog chết/timeout → **502** problem+json.

### 3.3 Orders — gọi ordering saga qua **service-account** (GAP-1 interim)

Ordering `POST /orders` bắt buộc customer JWT (`sub`+`email`). Không sửa ordering (READ-ONLY) → partner-api giữ **service-account** ở identity:

- `IdentityClient`: register-once (email/pass từ `PARTNER_SERVICE_ACCOUNT_*`, 409-tolerant) + login (`POST {identity}/auth/login` — accessToken trong body) + cache token (expire − 60s) + re-login tự động khi 401.
- `POST /open-api/v1/orders`: kiểm `partner_order_refs` (idempotency layer 1 — trùng `partnerRef` → trả đơn cũ ngay, 201, không gọi ordering — contract: "trả đơn đã có"); chưa có → gọi `POST {ordering}/orders` với:
  - header `Idempotency-Key` = UUID deterministic `nameUUIDFromBytes(partnerId + ":" + partnerRef)` (layer 2 — saga replay an toàn nếu layer 1 race),
  - `Authorization: Bearer <service-account token>`,
  - body: `items[{productId, variantId, qty}]`, `shippingMethod: "standard"`, `paymentMethod: "stripe"`, `address{fullName=name, phone, line1=address, ward/district/city="—"}` (contract PartnerCustomer chỉ có 1 dòng địa chỉ),
  - 201 → insert ref + trả `{orderId, partnerRef, status}`; ordering 409 → 409 (hết hàng); 400 → 400; 5xx → 502.
  - Concurrent duplicate `partnerRef`: UNIQUE(partner_id, partner_ref) bắt → catch → re-fetch → trả đơn cũ.
- `GET /orders/{id}`: ref phải thuộc partner này (khác → **404**, không lộ sự tồn tại) → gọi ordering `GET /me/orders/{id}` (service-account là owner mọi đơn partner) → map `PartnerOrder{orderId, partnerRef, status, items[{productId, variantId, name, qty, unitPrice}], updatedAt}`.

Đơn partner là **đơn thật** (saga chuẩn: re-price → reserve → Stripe intent) → thấy trong admin. Trạng thái tiến khi platform thanh toán/fulfil; partner theo dõi qua webhook + GET.

### 3.4 Webhook HMAC delivery

Queue `partner.orders` (durable) bind `order.*` trên exchange `ecommerce.events` (created/paid/confirmed/cancelled/failed). Consumer (pattern `OrderConfirmedEligibilityConsumer`: parse envelope + `IdempotentConsumer` marker prefix `wh:`):

1. eventType ∈ 5 keys trên; status map deterministic (created→PENDING, paid→PAID, confirmed→CONFIRMED, cancelled→CANCELLED, failed→FAILED); occurredAt/eventId từ envelope.
2. Lookup `partner_order_refs` theo `orderId` — không có → bỏ qua (không phải đơn partner).
3. Partner có `webhook_url`? Không → bỏ qua. Có → insert `webhook_deliveries` (PENDING) + attempt POST ngay.

Delivery: POST JSON `{eventId, orderId, partnerRef, status, occurredAt}` (contract `PartnerOrderChangedEvent`) + header `X-Signature: hex(HMAC-SHA256(webhook_secret, rawBody))`. **2xx** → DELIVERED; lỗi → retry exponential (`base_ms * 2^attempt`, config, dev 5s): **3 attempts tổng** → `DEAD` (DLQ — bảng giữ nguyên payload + last_error để ops tra cứu; ADR: DLQ queue Rabbit khi cần replay tooling).

`WebhookRetryScheduler` (fixedDelay config, dev 5s) quét PENDING đến hạn → attempt → cùng logic. **Race note:** event đến trước khi ref commit → lookup miss → bỏ qua (window ≤ outbox poll 2s; chấp nhận MVP, ghi spec).

### 3.5 Docs portal

springdoc: `api-docs.path=/open-api/v1/api-docs`, `swagger-ui.path=/open-api/v1/docs` (cả hai dưới namespace — route gateway chỉ có `/open-api/**`). OpenAPI info mô tả: auth `X-API-Key` + scopes + 401/403/429 semantics, idempotency `partnerRef`, rate-limit, webhook contract + **code mẫu verify HMAC** (Java + Node + curl). Browser-verify bắt buộc (Rule 0).

## 4. Data model (Flyway `db_partner`)

`V1__init.sql` — copy `common-lib sql/outbox-schema.sql` (convention SF-1: giữ nền, processed_messages dùng bởi IdempotentConsumer).

`V10__partner_domain.sql`:

```sql
partners        (id UUID PK, name, status VARCHAR CHECK IN (ACTIVE, SUSPENDED),
                 webhook_url VARCHAR NULL, webhook_secret VARCHAR,
                 rate_limit_per_min INT NOT NULL DEFAULT 60, created_at TIMESTAMPTZ)
api_keys        (id UUID PK, partner_id UUID FK→partners, key_hash VARCHAR(64),
                 prefix VARCHAR(16), scopes VARCHAR[] NOT NULL,
                 expires_at TIMESTAMPTZ NULL, revoked_at TIMESTAMPTZ NULL,
                 created_at TIMESTAMPTZ, INDEX(prefix))
partner_order_refs (id UUID PK, partner_id UUID FK, partner_ref VARCHAR NOT NULL,
                 order_id UUID NOT NULL, created_at, UNIQUE(partner_id, partner_ref))
webhook_deliveries (id UUID PK, partner_id UUID FK, event_id UUID, order_id UUID,
                 status VARCHAR, payload TEXT, attempts INT DEFAULT 0,
                 delivery_status VARCHAR CHECK IN (PENDING, DELIVERED, DEAD),
                 next_retry_at TIMESTAMPTZ, last_error VARCHAR(512),
                 created_at, delivered_at NULL, INDEX(delivery_status, next_retry_at))
```

## 5. Infra wiring (append-only)

- **Gateway routes** (+block, không strip): `Path=/open-api/** → http://localhost:8091`.
- **Gateway auth**: public-paths +1 dòng `/open-api/**` (chủ đích: auth là API key ở service, gateway không ép JWT).
- **compose**: block `partner-api` profile `full` (mirror SF-9: build Dockerfile, db_partner, env JWKS/catalog/ordering/identity) — dev vẫn host JVM.
- **Makefile**: case `partner-api) MOD=services/partner-api` + usage line.
- **.env.example**: block `PARTNER_*` (IDENTITY_BASE_URL, ORDERING_BASE_URL, CATALOG_BASE_URL, CATALOG_API_TOKEN, SERVICE_ACCOUNT_EMAIL/PASSWORD, WEBHOOK_RETRY_BASE_MS, WEBHOOK_MAX_ATTEMPTS).
- **`infra/db/init/01-create-dbs.sh`**: thêm `db_partner` vào loop (edit 1 dòng + comment SF-11) **+** `CREATE DATABASE db_partner` thủ công trên volume đang chạy (script chỉ chạy khi volume rỗng — note trong file đã có sẵn).

## 6. Seed (profile seed)

`PartnerSeedRunner` idempotent: partner `DEMO-PARTNER` (webhook_url `http://localhost:9999/webhook-test`, rate_limit 60) + API key random (`pk_` + 32 hex; **raw in log INFO đúng 1 lần lúc seed**); scopes `{catalog:read, orders:read, orders:write}`. Đồng thời đảm bảo service-account tồn tại qua IdentityClient (lỗi identity → WARN, không fatal). Đã seed → skip (không in lại key).

## 7. Testing

- **Unit (`*Test` không infra):** HmacSigner vector chuẩn; ApiKeyService hash/constant-time; scope mapping; rate limiter 429 + Retry-After; flatten categories.
- **IT (`*Test` + Testcontainers, 1 PG + 1 Rabbit, WireMock doubles cho identity/ordering/catalog + receiver stub — harness kiểu AbstractSagaTest, Flyway thật):**
  - auth: thiếu key 401 · sai 401 · revoke 401 · expire 401 · hợp lệ 200.
  - scope: key chỉ `catalog:read` POST /orders → 403.
  - rate-limit: key limit 2 → request 3 → 429 + Retry-After.
  - catalog proxy: WireMock catalog → shape partner đúng + 502 khi catalog lỗi.
  - order create: 201 + ref row; **replay cùng partnerRef → ordering nhận đúng 1 call, cùng orderId**; ordering 409 → 409.
  - order get: đơn partner mình 200 · đơn partner khác 404.
  - webhook: publish envelope → receiver nhận POST, `X-Signature` khớp HMAC (test tự recompute); receiver 500 → retry đúng lịch → DEAD sau 3 attempts; event không phải đơn partner → không POST.
- **Browser (Rule 0):** docs portal swagger mở được + screenshot; flow thật: curl key demo → products → POST order → webhook receiver nhận HMAC đúng → admin transition → webhook tiếp.

## 8. Risks & mở (đã xử lý)

| Risk | Xử lý |
|---|---|
| GAP-1 ordering không có service-auth order path | Service-account interim (flag FI-310) — swap bằng config khi amendment |
| GAP-2 catalog DTO thiếu updatedAt | Thời điểm proxy + docs note (flag FI-310) |
| Payment degraded (không Stripe key) làm saga fail bước intent | Hành vi SF-5 có sẵn — verify cần key test; docs portal ghi rõ |
| springdoc UI path dưới /open-api/v1 | Browser-verify sớm ở Phase 4, chỉnh config nếu redirect sai |
| Race event trước ref commit | Chấp nhận (window 2s), ghi docs |
| Bucket cache stale sau đổi rate_limit | Restart mới nhận — ADR note |

## 9. ADR notes

- **ADR-11a:** Rate-limit in-memory (Bucket4j) đủ MVP single-instance; multi-instance → Redis-backed bucket (bucket4j-redis).
- **ADR-11b:** DLQ = bảng `webhook_deliveries` trạng thái DEAD (payload + lỗi giữ nguyên); replay tooling là backlog.
- **ADR-11c:** Partner orders thuộc service-account user hệ thống cho đến khi ordering có internal service-token order endpoint (REQUIREMENT-GAP FI-310 GAP-1).
