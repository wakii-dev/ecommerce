# SF-5: inventory + payment services — Design (FI-315)

- **Story**: FI-310 Ecommerce Platform · **SF**: 5 · **Linear**: FI-315
- **Epic spec**: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · **Pack**: `docs/superpowers/contexts/sf-5.md` · **Bracket**: `docs/superpowers/brackets/fi310-ecommerce-platform.md`
- **Status**: Approved (autonomous — epic-level questions đã đóng theo pack; 1 contract gap flagged REQUIREMENT-GAP lên FI-310)
- **Contracts (READ-ONLY, freeze SF-2)**: `contracts/openapi/inventory.yaml` · `contracts/openapi/payment.yaml` · `contracts/events/{envelope,inventory.reserved,inventory.committed,inventory.released,order.paid,order.cancelled,order.failed,payment.succeeded,payment.failed}.schema.json`

## 1. Root cause / mục tiêu

Saga checkout (SF-9) cần 2 service nền: reservation tồn kho all-or-nothing (sai stock logic = saga sa lầy) và Stripe thật qua adapter SPI (SF duy nhất chạm tiền thật). Cả hai xây trên nền SF-1 (template, outbox, gateway, compose stripe-cli) + SF-2 (contracts freeze, common-lib).

## 2. Scope

**In**: inventory-service (8084, db_inventory) — reserve/availability/low-stock + TTL sweep + commit/release consumers + outbox events; payment-service (8086, db_payment) — intents/webhook/refund/void + `PaymentProviderAdapter` SPI + StripeAdapter + idempotency + degraded mode; 2 module Maven + Dockerfile; gateway routes append; IT harness (Testcontainers + WireMock).

**Out** (pack Boundary): saga orchestration/orders (SF-9) · checkout UI (SF-6) · gọi catalog · sửa contracts/common-lib (gap → flag) · COD adapter (SF-13, chỉ giữ SPI mở) · compose service blocks profile `full` (SF-10) · seed migration (demo seed bằng psql, documented).

## 3. Kiến trúc

```
ordering (SF-9) ── REST POST /api/inventory/reservations ──▶ inventory-service :8084
                 ── REST POST /api/payment/intents ────────▶ payment-service  :8086
Stripe ── webhook (HMAC verify) ───────────────────────────▶ payment-service
RabbitMQ topic exchange `ecommerce.events` (common-lib outbox relay + consumers):
  inventory ▶ inventory.reserved | inventory.committed | inventory.released
  inventory ◀ order.paid (commit) · order.cancelled / order.failed (release)
  payment   ▶ payment.succeeded | payment.failed
```

Hai service fork từ `backend/services/template-service` (source of truth): `scanBasePackages = "com.ecommerce"`, `@EntityScan` liệt kê TAY package service + `com.ecommerce.common.outbox`, `@EnableScheduling`, V1 = base outbox + processed_messages (copy template), domain migration **từ V10** (V2–V9 reserved theo comment template).

## 4. Inventory-service — design

### 4.1 Schema (V10__inventory_domain.sql)

```sql
CREATE TABLE stocks (
    variant_id    VARCHAR(64) PRIMARY KEY,
    quantity      INT NOT NULL CHECK (quantity >= 0),        -- available duy nhất
    threshold_low INT NOT NULL DEFAULT 10,                    -- low-stock warning
    product_id    VARCHAR(64),                                -- denormalized, nullable (GAP — see §8)
    product_name  VARCHAR(255),                               -- denormalized, nullable (GAP — see §8)
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reservations (
    id          UUID PRIMARY KEY,
    order_id    VARCHAR(64) NOT NULL,
    status      VARCHAR(16) NOT NULL,                         -- RESERVED | COMMITTED | RELEASED
    expires_at  TIMESTAMPTZ NOT NULL,
    items       JSONB NOT NULL,                               -- [{variant_id, qty}]
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_order ON reservations (order_id, status);
CREATE INDEX idx_reservations_expiry ON reservations (status, expires_at);
-- 1 order chỉ được 1 reservation ACTIVE — DB-level chống double-reserve khi
-- saga retry double-fire 2 request cùng order_id race qua bước check:
CREATE UNIQUE INDEX uq_reservations_active_order
    ON reservations (order_id) WHERE status IN ('RESERVED', 'COMMITTED');
```

**Stock model (1 cột `quantity` = available)**: reserve TRỪ `quantity` · release CỘNG lại · commit GIỮ NGUYÊN (đã trừ từ lúc reserve = "trừ vĩnh viễn"). `reserved` (cho availability) = SUM qty các reservation `status=RESERVED AND expires_at > now()` per variant — query jsonb, không lưu cột riêng → không drift.

### 4.2 POST /api/inventory/reservations (all-or-nothing)

1 tx duy nhất (`ReservationService.create`):
1. **Gom trùng trước**: aggregate qty theo `variantId` (request có thể gửi 2 dòng cùng variant — contract không cấm) → 1 dòng/variant. `ttlMinutes` < 1 hoặc > `inventory.reservation.max-ttl-minutes` (env, default 60) → **400** (không clamp âm thầm).
2. **Self-heal expired của ĐÚNG order này** (trước replay-check — đồng bộ định nghĩa active với unique index): guarded `UPDATE reservations SET status='RELEASED' WHERE order_id=? AND status='RESERVED' AND expires_at < now()` → rowcount=1 → hoàn stock từng item + outbox `inventory.released` (payload schema-exact — sweep logic nhỏ, log reason ttl_expired). Chỉ scope order này, không full-scan (global sweep là việc sweeper). Không có bước này: reservation hết hạn chưa quét chặn INSERT qua unique index + catch-path replay nhầm reservation đã chết.
3. Nếu `order_id` đã có reservation active (`status=RESERVED AND expires_at > now()`) → **201 replay** `{reservationId, expiresAt}` cũ — **bỏ qua items incoming**, warn-log nếu items khác (idempotency theo order — contract; ordering sở hữu saga state). COMMITTED cũng replay (đơn đã trả). RELEASED → cho tạo reservation MỚI (hủy xong đặt lại là hợp lệ — ordering quyết định).
4. Native `SELECT variant_id, quantity FROM stocks WHERE variant_id IN (...) ORDER BY variant_id FOR UPDATE` — **lock đủ TẤT CẢ items trước, thứ tự variant_id chống deadlock**. Variant thiếu row stocks = coi available 0.
5. Check TỪNG variant (sau khi gom) `qty_sum <= quantity` → **thu THẬP TẤT CẢ variants thiếu** (không fail-fast) → thiếu BẤT KỲ → ném `InsufficientStockException(insufficient[])` → **409** problem+json `{...ApiError, insufficient:[{variantId, requested, available}]}` — KHÔNG trừ gì (check trước trừ sau, exception rollback mọi thứ).
6. Đủ → `UPDATE stocks SET quantity = quantity - :qty` từng item + INSERT reservation (TTL từ request) + `OutboxWriter.write("inventory.reserved", {reservationId, orderId, items[]})` (MANDATORY tx — cùng commit). **Race cùng order_id** (2 request song song cùng lúc, chưa ai hết hạn): partial unique index `uq_reservations_active_order` từ chối INSERT thứ 2 → catch → re-lookup (sau bước 2, row tồn tại luôn nhất quán với "active") → replay 201 (không bao giờ 2 reservation active cho 1 order).

**Auth posture**: `x-internal-only` theo contract — public trong gateway tới khi SF-3 wire service-token/identity (pack cho phép 2 phương án; quyết định tại SF-3).
**TTL request**: `ttlMinutes` minimum 1 (contract); cap trên `inventory.reservation.max-ttl-minutes` (default 60 — chống lock vĩnh viễn do payload lố).

### 4.3 GET /api/inventory/availability

`?variantIds=a,b,c` (form explode=false) → chỉ trả variant CÓ row stocks (contract: "chi tra nhung variant ton tai"): `[{variantId, available, reserved}]`. `reserved` = jsonb SUM reservation active. VariantId rỗng/parse lỗi → 400 (GlobalExceptionHandler chuẩn).

### 4.4 GET /api/inventory/admin/low-stock

`?threshold=` override, default từ env `inventory.low-stock-threshold` (default 10) → `[{variantId, productId, productName, available, threshold}]` với `available <= threshold`, order by available asc. **RBAC: KHÔNG wire ở SF-5** — `gateway-auth-wiring-admin-guard` là task SF-3 (pack: "KHÔNG cần identity"); endpoint expose, guard đến từ gateway ở SF-3. product fields trả null khi chưa ai fill (§8 GAP).

### 4.5 TTL sweep (@Scheduled)

`InventorySweeper.releaseExpired()` public — `@Scheduled(fixedDelayString = "${inventory.reservation.sweep-interval-ms:30000}")`. Mỗi reservation `status=RESERVED AND expires_at < now()`: 1 tx — **guarded conditional update** `UPDATE reservations SET status='RELEASED' WHERE id=? AND status='RESERVED'` → chỉ khi **rowcount=1** mới hoàn stock + outbox `inventory.released` (chống race sweep-vs-consumer: order.paid commit trước → sweep thấy rowcount=0 → skip, không phantom-restock đơn đã trả). **Chú ý schema**: `inventory.released` payload CHỈ có `{reservationId, orderId, items[]}` — reason `ttl_expired` **KHÔNG có chỗ trong schema** → log reason ở service, payload đúng schema (additive-only contract, không tự thêm field). IT gọi thẳng method sau khi insert reservation hết hạn (deterministic, không sleep).

### 4.6 Consumers (queue `inventory.orders`)

Bean khai báo `Queue("inventory.orders", durable)` + 3 `Binding` → exchange `ecommerce.events`, routing keys `order.paid` / `order.cancelled` / `order.failed` (RabbitAdmin auto-declare).

`@RabbitListener` (**service tự khai bean `Jackson2JsonMessageConverter`** — đã verify `CommonLibAutoConfiguration` chỉ declare TopicExchange, không có converter; exchange `ecommerce.events` common-lib declare sẵn, service chỉ declare Queue + Bindings) — mỗi message: parse `EventEnvelope` → `@Transactional` (marker + business + outbox CÙNG tx — javadoc IdempotentConsumer: tách tx = ghost-marker bug) → `IdempotentConsumer.tryConsume(eventId)` → switch theo eventType:
- **order.paid** → **guarded update** `SET status='COMMITTED' WHERE id=? AND status='RESERVED'` → rowcount=1 mới outbox `inventory.committed` {reservationId, orderId, items}. Không tìm thấy / rowcount=0 (đã TTL release / re-delivery) → **warn + no-op** (không event, không double-trừ — late-payment là việc ordering refund/cancel).
- **order.cancelled | order.failed** → guarded `SET status='RELEASED' WHERE id=? AND status='RESERVED'` → rowcount=1 mới hoàn stock + outbox `inventory.released`. Không có → warn + no-op.

**correlationId propagation**: event outbox do consumer emit dùng lại `envelope.correlationId` incoming (không mất dây dọc saga); REST path dùng MDC `X-Request-Id`.
**Poison message**: envelope parse lỗi → catch + error-log + return (ack) — KHÔNG requeue vô hạn.
Re-delivery: eventId đã xử lý → `tryConsume` false → skip (không double-commit/release — ACCEPTANCE dòng 3).

## 5. Payment-service — design

### 5.1 Schema (V10__payment_domain.sql)

```sql
CREATE TABLE payment_intents (
    id               UUID PRIMARY KEY,
    order_id         VARCHAR(64) NOT NULL,
    stripe_intent_id VARCHAR(128) UNIQUE,          -- pi_... (null khi chưa tạo được)
    amount_vnd       BIGINT NOT NULL CHECK (amount_vnd > 0),
    currency         VARCHAR(8)  NOT NULL,          -- 'vnd'
    status           VARCHAR(32) NOT NULL,          -- CREATED|REQUIRES_CONFIRMATION|SUCCEEDED|FAILED|VOIDED|REFUNDED
    idempotency_key  VARCHAR(128) NOT NULL UNIQUE,
    payload_hash     VARCHAR(64) NOT NULL,          -- sha256(orderId|amount|currency) — replay detect
    client_secret    VARCHAR(255),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.2 SPI (`com.ecommerce.payment.spi`)

```java
public interface PaymentProviderAdapter {
    AdapterIntent createIntent(IntentCommand cmd);            // cmd: orderId, amountVnd, currency, idempotencyKey
    AdapterIntent voidIntent(String providerIntentId);
    AdapterRefund refund(String providerIntentId, Long amountVnd /* null = full */);
    StripeWebhookEvent verifyWebhook(String rawBody, String sigHeader); // throws WebhookVerificationException
}
```
Records thuần trong `spi/` (`IntentCommand`, `AdapterIntent{providerIntentId, clientSecret, status}`, `AdapterRefund`, `StripeWebhookEvent{eventId, type, intentId, amount, currency, failureMessage}`). **StripeAdapter** (`@ConditionalOnProperty stripe.secret-key`): stripe-java 24.16, `PaymentIntentCreateParams` amount VND nguyên (zero-decimal) + `AutomaticPaymentMethods(enabled)`; **Stripe-side idempotency**: gởi header Stripe `Idempotency-Key` = `cmd.idempotencyKey` (stripe-java hỗ trợ qua `RequestOptions`) — local rollback sau khi Stripe chấp nhận không mint orphan `pi_` thứ 2 khi retry; base URL per-request qua `RequestOptions.builder().setBaseUrl(...)` (đã verify javap 24.16 — IT WireMock không đụng global static). **Webhook secret**: property `stripe.webhook-secret` (env `STRIPE_WEBHOOK_SECRET` — đã có trong .env.example từ SF-1); thiếu secret (có key) → webhook verify không thể chạy → `/webhook` 503 `payment_unconfigured` (boot vẫn OK). Bean `paymentProviderConfigured` + `@ConditionalOnMissingBean` fallback `UnconfiguredAdapter` ném `PaymentUnconfiguredException` → handler 503 `payment_unconfigured` (boot OK, không crash).

### 5.3 POST /api/payment/intents

1. Idempotency key: header `Idempotency-Key` (pack) → fallback body `idempotencyKey` (contract); thiếu cả hai → 400.
2. Validate: amount > 0, currency ∈ {VND} (contract enum) → else 400.
3. Lookup `idempotency_key`: có + `payload_hash` khớp → **201 replay** `{paymentIntentId, clientSecret, status}` cũ (ACCEPTANCE idempotency). Có + hash khác → **409**. Không có → xuống 4.
4. Tx: INSERT intent `CREATED` + gọi `adapter.createIntent` → update `stripe_intent_id`/`client_secret`/`status` → **201** `{paymentIntentId: pi_..., clientSecret, status}`. **Adapter lỗi → để tx rollback (không giữ row)** — replay cùng key tạo lại từ đầu (Stripe-side idempotency key của adapter đảm bảo không sinh `pi_` thứ 2); replay step 3 không bao giờ thấy row thiếu `pi_` (vi phạm `required: [paymentIntentId]`).

**Hai hệ status, không lẫn**: DB `status` dùng enum của pack (`CREATED|REQUIRES_CONFIRMATION|SUCCEEDED|FAILED|VOIDED|REFUNDED` — lifecycle nội bộ: tạo xong có client_secret = REQUIRES_CONFIRMATION, webhook succeeded = SUCCEEDED, void = VOIDED, refund = REFUNDED). API **response** `status` = mirror Stripe trả về (enum contract `PaymentIntentStatus`: REQUIRES_PAYMENT_METHOD/REQUIRES_CONFIRMATION/.../CANCELED) — adapter trả gì echo nấy. Void: DB=VOIDED, response=CANCELED (contract `VoidResult.status` là PaymentIntentStatus).

### 5.4 POST /api/payment/webhook

1. Đọc **raw body** (String, không deserialize trước — chữ ký tính trên bytes) + header `Stripe-Signature`; `adapter.verifyWebhook` sai/thiếu → **400**.
2. **MỘT `@Transactional` cho cả handler** (marker `tryConsume("stripe:"+evt_id)` + update intent status + OutboxWriter CÙNG tx — tách tx = MANDATORY exception hoặc ghost-marker; javadoc IdempotentConsumer). Trùng event id → `tryConsume` false → 200 `{received: true}` no-op.
3. `payment_intent.succeeded` → intent theo stripe_intent_id → SUCCEEDED + outbox `payment.succeeded {orderId, paymentIntentId, amount, currency, failureReason: null}` · `payment_intent.payment_failed` → FAILED + outbox `payment.failed {..., failureReason}` · `charge.refunded` → status REFUNDED (silent) · khác → ack no-op. Không tìm thấy intent local → warn + 200 (Stripe retry không giúp gì — tránh 500 storm).
4. **correlationId cho event webhook-origin**: không có X-Request-Id inbound → dùng `evt.id` (dây dọc theo Stripe event; envelope schema đòi non-null). Currency lưu + emit **uppercase `VND`** thống nhất (DB comment 'vnd' chỉ là lowercase-literal cũ — normalize upper).

### 5.5 POST /api/payment/refunds · POST /api/payment/void

- Refund: `{paymentIntentId, amount?, reason}` → lookup local theo stripe_intent_id (404 nếu không có) → trạng thái phải SUCCEEDED (409 nếu chưa capture/đã FAILED) → `adapter.refund` → 201 `{refundId: re_..., status, amount}` (+ status REFUNDED khi full refund). Degraded → 503.
- Void: `{paymentIntentId}` → local status phải CREATED/REQUIRES_CONFIRMATION (409 nếu SUCCEEDED/FAILED/VOIDED — check local TRƯỚC khi gọi adapter) → `adapter.voidIntent` → status VOIDED → **200** `{status}`.
- **Phân loại lỗi adapter** (không map-all-502): `InvalidRequestException` từ Stripe (refund vượt amount, already refunded/canceled — đúng 2 case 409 contract khai) → **409** `payment_conflict`; StripeException khác (connect/auth/...) → 502 `payment_provider_error`.
- **Không publish event** từ refund/void (ordering nhận kết quả sync response — coordination note cho SF-9; description contract nhắc "publish payment.succeeded|failed" chỉ áp webhook path). Không có bảng refunds — cumulative-refund tracking delegate cho Stripe (adapter báo lỗi vượt amount qua 409 classification trên).

### 5.6 Degraded mode (ACCEPTANCE)

Không `STRIPE_SECRET_KEY` → **boot OK** (adapter bean off, scheduler/outbox relay vẫn chạy); `/intents` → **503** problem+json `title: "payment_unconfigured"`, detail chỉ rõ cần env gì; webhook/refunds/void → 503 cùng title. Không crash, health UP (không thêm Stripe health indicator).

## 6. Error model

Toàn bộ qua common-lib `GlobalExceptionHandler` (problem+json, đã scan `com.ecommerce`). Custom: `InsufficientStockException` → 409 + `insufficient[]` (controller advice local build body từ ApiError + extension — khớp `ReservationConflictError` allOf ApiError) · `PaymentUnconfiguredException` → 503 · `WebhookVerificationException` → 400 · `InvalidRequestException` (Stripe) → 409 `payment_conflict` · StripeException khác → 502 `payment_provider_error`. Không leak message nội bộ (500 generic).

## 7. Testing (IT harness — pack item 10 đủ 7 case)

Base copy `AbstractIntegrationTest` (Testcontainers PG) + RabbitMQ container dùng chung trong IT cần event. **WireMock** (`org.wiremock:wiremock-standalone`, test scope payment-service) làm Stripe API double: `RequestOptions`/static override base URL → stub `POST /v1/payment_intents`, `POST /v1/payment_intents/:id/confirm|cancel`, `POST /v1/refunds`; signature test = tự compute HMAC-SHA256 `t=<now>,v1=<hex>` trên `${t}.${payload}` với whsec test.

| # | IT | Assert |
|---|----|----|
| 1 | Reserve đủ + thiếu + **duplicate variantId trong 1 request** + concurrent 2-thread tranh last stock + **2 thread cùng order_id race** + **re-reserve khi reservation cũ hết hạn chưa quét** (self-heal path: stock hoàn + `inventory.released` + reserve mới 201) | 201 available giảm đúng · 409 `insufficient[]` đủ mọi variant thiếu, 0 trừ · gom trùng đúng · đúng 1 thread thắng all-or-nothing · partial unique index → đúng 1 reservation active · expired-re-reserve không replay reservation chết |
| 2 | Replay same order_id + TTL sweep | 201 cùng reservationId · hết hạn → RELEASED + stock hoàn + event `inventory.released` |
| 3 | Consumers idempotent (synthetic event qua RabbitMQ Testcontainers) | order.paid → COMMITTED + `inventory.committed`; cancelled → RELEASED + hoàn; re-delivery không double; **sweep-vs-consumer**: reservation hết hạn vừa bị sweep thì order.paid tới → rowcount=0 → no-op không phantom-restock |
| 4 | Webhook: sig sai 400 · sig đúng → outbox | 400 / outbox row `payment.succeeded`: **payload khớp `<event>.schema.json` payload-section + envelope đủ 5 field common-lib `{eventId, eventType, occurredAt, correlationId, payload}`** — KHÔNG assert strict envelope.schema.json 7-field (common-lib thiếu `producer`/`schemaVersion` — GAP #2 đã flag §8, forbidden sửa common-lib) |
| 5 | Idempotency replay intents | same key same payload → cùng response; khác payload → 409 |
| 6 | Refund/void qua WireMock | 201/200, status đổi, 404/409 edge (local precheck + InvalidRequest→409) |
| 7 | Degraded mode (context không key — Spring context riêng, PG container riêng) | boot OK, /intents 503 `payment_unconfigured` |

Unit tests cho service logic thuần (không container) nơi tách được; IT tag `integration`, `disabledWithoutDocker` (memory: Docker 29 cần `api.version=1.44` — đã cấu hình từ SF-1, kiểm tra lại khi chạy). WireMock override per-request `RequestOptions.builder().setBaseUrl()` (đã verify tồn tại trong 24.16 qua javap); signature test tự compute HMAC-SHA256 `t=<now>,v1=<hex>` trên `${t}.${payload}` với whsec test — cả `stripe.secret-key` lẫn `stripe.webhook-secret` inject qua test properties.

## 8. Gap đã flag (KHÔNG tự sửa contract/common-lib)

1. `LowStockItem` contract đòi `productId` + `productName` — pack pin `stocks` không có product info, boundary cấm gọi catalog. → **REQUIREMENT-GAP lên FI-310** (đã post). Implement: 2 cột denormalized nullable, response đủ 5 trường (null khi chưa fill). Đề xuất lâu dài: fill qua `product.changed` consumer (schema có sẵn) — cần coordinator chốt.
2. **Envelope common-lib thiếu `producer` + `schemaVersion`** so với `contracts/events/envelope.schema.json` (record 5-field vs contract 7-field required) — mọi event mọi service hiện không pass strict envelope validation. common-lib READ-ONLY (bug → flag) → **REQUIREMENT-GAP #2 lên FI-310**; SF-5 IT assert payload-section + 5-field thực tế, không assert strict 7-field. Fix thuộc common-lib (epic-level, ảnh hưởng mọi SF).

## 9. Files SF-5 tạo/sửa

```
backend/pom.xml                                        (append 2 <module>)
backend/services/inventory-service/**                  (mới — port 8084, db_inventory)
backend/services/payment-service/**                    (mới — port 8086, db_payment, spi/)
backend/gateway/src/main/resources/gateway-routes.yml  (un-comment 2 block inventory+payment)
```

**docker-compose.yml / Makefile: KHÔNG đổi** — pack item 11 đọc kỹ: "compose chỉ infra — nếu thêm service block cho profile `full` thì append-only"; profile `full` + containerize = việc SF-10; stripe-cli block đã trỏ sẵn `:8086/api/payment/webhook` từ SF-1; Makefile đã có dev targets `inventory`/`payment` từ SF-1 → không còn gì để append. (Pack touch-map `routes/inventory.yml` stale — file thật là `gateway-routes.yml` một-file.)

## 10. Acceptance → verify mapping (pack ACCEPTANCE)

| # | ACCEPTANCE | Verify |
|---|-----------|--------|
| 1 | Reserve 2 variant đủ → 201, available giảm; vượt → 409 all-or-nothing | IT#1 + browser Swagger flow |
| 2 | TTL hết → RELEASE + event | IT#2 |
| 3 | order.paid → COMMIT; cancelled → RELEASE; re-delivery không double | IT#3 |
| 4 | Có sk_test → intent thật + client_secret; webhook stripe-cli → outbox; sig sai → 400 | IT#4/#5 (WireMock) + smoke thật khi user cấp key |
| 5 | Không key → boot OK, /intents 503 rõ | IT#7 + boot thật |
| 6 | PDP gọi availability (SF-4 chưa merge → API level) | qua gateway :8080 route smoke |
