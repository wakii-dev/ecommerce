# Plan: SF-11 partner Open API (FI-321)

Date: 2026-09-07 | Linear: FI-321 | Worktree: sf-11-partner-open-api (branch `wakii-dev/sf-11-partner-open-api`)
Spec: `docs/superpowers/specs/2026-09-07-sf-11-partner-open-api-design.md` (spec-critic: PROCEED sau 1 vòng fix P0)

## 0. Root cause analysis (WHY)

### Root cause
Platform đóng sau firewall nội bộ — mọi API yêu cầu JWT customer (gateway auth + resource server từng service). Không có cửa tích hợp nào cho hệ thống bên thứ ba (đối tác bán lại/distribution) vì thiếu: registry đối tác + key, auth không-JWT, rate-limit, và kênh thông báo ngược (webhook) có chữ ký.

### Current state (before feature)
Đối tác muốn đọc catalog hay tạo đơn phải dùng tài khoản customer đăng nhập như người thật — sai mô hình (không scale, không audit được per-partner, không giới hạn được quota), và không có cách nhận biết trạng thái đơn ngoài polling.

### Expected outcome
`/open-api/v1/**` hoạt động với X-API-Key (+scope+quota per key), đơn tạo qua saga chuẩn (thấy trong admin), partner nhận webhook HMAC khi đơn đổi trạng thái, docs portal Swagger tự phục vụ — chứng minh platform mở được API công khai an toàn.

### Constraints & hardships
Contracts frozen (partner-api.yaml SF-2) — KHÔNG sửa được; services khác READ-ONLY (ordering không có service-auth order path → GAP-1 interim service-account); payment degraded không có Stripe key → saga fail ở bước intent (môi trường, không phải code SF-11); chạy song song SF-12 — shared files append-only.

### High-level strategy
1 service mới (fork conventions từ ordering-service) + additive wiring infra. Contract-first: shape trả ra theo yaml freeze. Gap xử lý interim + flag FI-310 (GAP-1..5 đã đăng).

## 1. Problem (intent)

Đơn vị đối tác bên ngoài cần kết nối platform được một cách an toàn, có kiểm soát (key + quota + scope) và tự phục vụ (docs) — hiện không có đường nào hợp lệ.

## 2. Scope

- **In:** service `partner-api` :8091 (db_partner): partners/api_keys registry, X-API-Key auth + Bucket4j rate-limit, `/open-api/v1/**` (products/categories/search proxy, POST /orders, GET /orders/{id}), webhook HMAC delivery (consume `order.*`, retry exp 3 attempts → DEAD), springdoc docs portal `/open-api/v1/docs`, gateway route + compose block + Makefile target + `.env.example` + db_partner init, seed DEMO-PARTNER, IT tests.
- **Out:** OAuth/OIDC partner portal, billing/metering, sửa contracts/services khác, đụng file SF-12, partner admin UI.
- **Success criteria:** ACCEPTANCE context pack (§5.13 assert): curl key demo → products 200; key sai/revoke → 401; vượt limit → 429 + Retry-After; POST orders → đơn thật trong admin + replay partnerRef không double; webhook HMAC đúng secret (verify code mẫu trong docs); `/open-api/v1/docs` mở Swagger UI.

## 3. Touch map

- **Tạo mới:** `backend/services/partner-api/**` (pom, app, config/, auth/, web/, proxy/, webhook/, domain/, repo/, seed/, Dockerfile, `db/migration/V1__init.sql` + `V10__partner_domain.sql`, test: unit + IT harness + docker-java.properties).
- **Append (shared):** `backend/gateway/src/main/resources/gateway-routes.yml` (block partner-api, không strip) · `backend/gateway/src/main/resources/routes/gateway-auth.yml` (public-paths + `/open-api/**`) · `docker-compose.yml` (block profile full) · `Makefile` (case partner-api + usage line) · `.env.example` (block PARTNER_*) · `infra/db/init/01-create-dbs.sh` (thêm db_partner vào loop).
- **Consumers/regression:** gateway routes cũ (không đụng), RabbitMQ (queue mới `partner.orders`, không đụng queue cũ), catalog/ordering/identity (chỉ REST call).
- **Shared surfaces:** DB mới db_partner (CREATE DATABASE thủ công — volume đã có data); env mới PARTNER_*; không đổi contract/config cũ.

## 4. Design

- **Approach A (chọn):** service-account identity interim → ordering saga chuẩn cho đơn partner. Chi tiết đủ trong spec §3 (auth filter, rate-limit Bucket4j, proxy mapping, webhook pipeline, GAP-1..5).
- **Alternatives đã từ chối:** block chờ amendment (B), clone mini-saga ghi db_partner (C — đơn không thấy admin).
- **Edge cases:** replay partnerRef (201 trả đơn cũ, kể cả payload khác), concurrent dup (UNIQUE + re-fetch), ordering 409-overload (re-check ref trước), 422→409, TTL 30' → CANCELLED webhook, race event trước ref commit (skip + window 2s), SUSPENDED skip delivery, UUID-token 502/404 ma trận.
- **Non-functional:** constant-time hash compare; key chỉ lưu hash; HMAC hex lowercase; 401/403/429 problem+json; rate-limit in-memory (ADR-11a), DLQ bảng (ADR-11b).

## 5. Implementation outline

**Tasks (7, tuần tự — inline execute, 1 commit/task):**

| # | Task | Files chính | Xong khi |
|---|------|-------------|----------|
| 1 | Scaffold + Flyway + IT harness | pom (bucket4j), Application, application.yml, V1+V10, 4 entity + repo, Dockerfile, AbstractPartnerApiTest (PG+Rabbit Testcontainers), docker-java.properties | `mvn -pl services/partner-api test` xanh (context boot + flyway migrate trong IT) |
| 2 | API-key auth + rate-limit + seed | auth/ApiKeyAuthFilter, ApiKeyService, PartnerRateLimiter, config/SecurityConfig, seed/PartnerSeedRunner (partner + API key — **service-account ensure thuộc T4**, nơi IdentityClient tồn tại) | IT: 401 matrix (thiếu/sai/revoke/expire), 403 scope, 429+Retry-After |
| 3 | Catalog proxy | web/PartnerCatalogController, proxy/CatalogClient, mapper flatten | IT: list/detail(slug+UUID ma trận token)/categories flatten/search; 502 catalog chết |
| 4 | Orders + service-account | web/PartnerOrderController, proxy/OrderingClient, **proxy/IdentityClient + ensure service-account (gọi lúc boot/seed)**, partner_order_refs flow | IT: 201+replay 1-call; 409 recheck; 422→409; 400 pass-through; **5xx→502; identity 401 → re-login 1 lần**; GET chặn partner khác |
| 5 | Webhook HMAC delivery | webhook/PartnerEventConsumer, WebhookDeliveryService, WebhookRetryScheduler, HmacSigner, RabbitMqConfig | IT: HMAC verify; retry→DEAD 3 attempts; SUSPENDED/non-partner skip; **order.* lạ → WARN+skip không crash không marker** (dep thực chỉ cần T1 — edge T2 vô hại khi inline) |
| 6 | Docs portal | config/OpenApiConfig + springdoc yml | IT: /open-api/v1/docs 2xx + api-docs JSON có 6 paths + mô tả auth/webhook; **browser-check Swagger UI render thật tại :8091/open-api/v1/docs** |
| 7 | Infra wiring + full build | gateway-routes.yml, gateway-auth.yml, docker-compose.yml, Makefile, .env.example, 01-create-dbs.sh | `mvn -q package` toàn repo + compose config hợp lệ + **db_partner TỒN TẠI trên volume dev (CREATE DATABASE thực thi + psql check)** |

- **File structure:** package `com.ecommerce.partner` — tách lớp như spec §3 (config/auth/web/proxy/webhook/domain/repo/seed); migrations theo convention V1 nền + V10 domain.
- **Testing strategy:** unit (`*Test` thường: HmacSigner vector, scope map, flatten) + IT (1 class `PartnerApiIntegrationTest` kế thừa harness — PG+Rabbit thật, WireMock identity/ordering/catalog + receiver stub; naming `*Test` theoSurefire); IT matrix map từng dòng ACCEPTANCE.

## 6. Risks & unknowns

- **Đã verify (đọc code):** saga replay idempotency-key trả đơn cũ; identity register/login public + accessToken body; path conventions gateway (no-strip như catalog); OrderDto/OrderLineDto đủ trường map PartnerOrder; springdoc 2.6.0 quản bởi parent.
- **Chưa verify (chạm khi làm):** hành vi springdoc UI redirect khi đổi path (browser-check ở Task 6, chỉnh config nếu cần); port 8091 bị duplicate identity từ sf-6 chiếm (kill lúc boot nếu còn); CATALOG_API_TOKEN để rỗng trong dev mặc định (UUID detail → 502 documented).
- **Giả định:** Stripe test key không có sẵn → live demo POST /orders sẽ 502 ở bước payment (đơn FAILED vẫn thấy admin + webhook bắn created/failed); IT không phụ thuộc key (WireMock). Báo user ở verify.
