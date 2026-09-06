# SF-5: inventory + payment services — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hai service nền cho checkout saga — inventory-service (reservation variant-level all-or-nothing + TTL + commit/release consumers) và payment-service (Stripe test thật qua adapter SPI + degraded mode).

**Architecture:** Fork template-service scaffold (SF-1 conventions): Boot 3.3.5 / Java 21, Flyway (V1 base outbox từ common-lib, domain từ V10), transactional outbox + IdempotentConsumer (common-lib), RabbitMQ topic exchange `ecommerce.events`. Stock model = 1 cột `quantity` (available). Payment tách SPI (`PaymentProviderAdapter`) — StripeAdapter duy nhất dùng env key, per-request `RequestOptions.setBaseUrl` cho WireMock IT.

**Tech Stack:** Spring Boot 3.3.5, Java 21, PostgreSQL 16 (db_inventory 8084 / db_payment 8086), Flyway, stripe-java 24.16.0, Testcontainers (PG + RabbitMQ), WireMock standalone 3.9.1, Awaitility.

**Linear Issue:** FI-315 · **Spec:** `docs/superpowers/specs/2026-09-06-sf-5-inventory-payment-design.md` (nguồn sự thật cho mọi quyết định — plan không lặp lại rationale)

**DAG:** T1→{T2→T4, T3} · T5→T6→T7 · T8←{T4,T7}. **Controller paths KHÔNG có prefix `/api`** — gateway route `Path=/api/<svc>/**` + `StripPrefix=1` (convention pinned trong gateway-routes.yml): service nhận `/inventory/reservations`, public path qua gateway = `/api/inventory/reservations` (contract paths là gateway-level). Chuỗi inventory/payment chỉ trùng 2 file shared (parent pom — append 2 module chung Task 1; gateway-routes.yml — 2 block rời nhau) → chạy inline tuần tự an toàn.

---

## 0. Root cause analysis

**Root cause:** Saga checkout (SF-9) đòi reservation tồn kho nguyên tử + Stripe thật; chưa có service nào sở hữu 2 mảng này. Sai stock logic = saga sa lầy; sai money logic = mất tiền thật.
**Current state:** SF-1 đã dựng template + outbox + gateway placeholders + compose stripe-cli; SF-2 đã freeze contracts (inventory.yaml, payment.yaml, 8 event schemas) + common-lib. Không có business service nào.
**Expected outcome:** Reserve đủ → 201 available giảm; vượt → 409 all-or-nothing; TTL tự release; order.paid/cancelled điều khiển commit/release qua events; Stripe intent thật trả client_secret; không key → 503 rõ ràng.
**Constraints & hardships:** Contracts READ-ONLY; common-lib READ-ONLY (2 gap đã flag FI-310); SF-3/4 song song chưa merge (không identity, không catalog); máy không có Stripe key (.env vắng) → IT dùng WireMock.
**High-level strategy:** Contract-first, copy template conventions, event-driven qua outbox, IT deterministic (Testcontainers + WireMock, không sleep — gọi thẳng sweep method).

## 1. Problem

Saga không có chỗ để reserve stock an toàn và thu tiền — cần 2 service nền đúng contract đã freeze, trước khi SF-6/9 xây UI/saga lên.

## 2. Scope

- **In:** inventory-service (8084, db_inventory): reservations all-or-nothing, availability, low-stock, TTL sweep, consumers order.paid/cancelled/failed, outbox inventory.* · payment-service (8086, db_payment): SPI + StripeAdapter, intents idempotent, webhook HMAC, refund/void, degraded 503 · 2 Maven modules + Dockerfile + gateway routes 2 block · IT harness 7 case.
- **Out:** saga (SF-9) · checkout UI (SF-6) · catalog calls · sửa contracts/common-lib · compose service blocks (SF-10) · COD adapter (SF-13) · seed migration (demo seed bằng psql).
- **Success criteria (observable):** 6 dòng ACCEPTANCE trong spec §10 — mapping cụ thể từng IT ở đó.

## 3. Touch map

- **Create:** `backend/services/inventory-service/**` · `backend/services/payment-service/**`
- **Modify (append):** `backend/pom.xml` (+2 module — gộp vào Task 1) · `backend/gateway/src/main/resources/gateway-routes.yml` (un-comment 2 block — Task 1 inventory block, Task 5 payment block)
- **Shared surfaces:** exchange `ecommerce.events` (queue `inventory.orders` ← order.paid|cancelled|failed); env `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (đã có .env.example); ports 8084/8086.
- **Regression candidates:** gateway smoke route (không đụng), template-service (không đụng).

## 4. Design

**Approach A (đã chọn — spec §4-6 đầy đủ):** single-quantity stock model, FOR UPDATE + check-all-trừ-all, partial unique index chống double-reserve, guarded conditional transitions (rowcount-gated events), self-heal expired tại reserve entry, Stripe-side idempotency key, 2 hệ status tách bạch (DB enum pack vs response mirror Stripe).
**Alternatives dismissed:** IT Stripe thật (không key, flaky — WireMock thay); reserved-count column riêng (drift — jsonb SUM); reserve REST cho commit/release (contract cấm — events only).
**Edge cases:** expired-but-unswept race (self-heal §4.2 bước 2) · duplicate variantId (gom trùng) · sweep-vs-consumer phantom restock (rowcount guard) · adapter fail giữa Stripe-accepted (rollback + Stripe idempotency) · replay cùng key khác payload (409 hash) · poison message (ack+log).
**Non-functional:** at-least-once consumers (idempotent bắt buộc); webhook verify TRƯỚC parse; key không commit; sweep interval config; lỗi adapter phân loại 409/502.

## 5. Implementation outline — Tasks

**File structure** (follow template `com.ecommerce.<svc>`: `api/` `domain/` `repo/` `service/` `consumer/` `config/`; payment thêm `spi/`):

| Task | Nội dung | Files chính |
|---|---|---|
| T1 | inventory scaffold + Flyway domain + gateway route + pom modules | `services/inventory-service/**`, `backend/pom.xml`, `gateway-routes.yml` |
| T2 | Reservation API all-or-nothing (TDD) | `api/ReservationController`, `service/ReservationService`, `repo/*`, IT race/replay/409 |
| T3 | Availability + low-stock | `api/InventoryQueryController`, native jsonb SUM query, IT |
| T4 | TTL sweeper + commit/release consumers | `service/InventorySweeper`, `consumer/InventoryOrderConsumer`, `config/RabbitMqConfig`, IT re-delivery |
| T5 | payment scaffold + SPI + StripeAdapter (WireMock unit) + gateway route | `services/payment-service/**`, `spi/*` |
| T6 | Intents API idempotent + degraded | `api/PaymentController`, `service/PaymentIntentService`, IT replay/degraded |
| T7 | Webhook + refund/void + error classification | webhook raw-body endpoint, `verifyWebhook`, IT sig/outbox |
| T8 | Full-suite green + Dockerfiles + demo seed + docs | 2 Dockerfile, README seed psql, `mvn verify` reactor |

**Testing strategy:** TDD mỗi task — IT kế thừa `AbstractIntegrationTest` pattern (PG Testcontainers, tag `integration`, `disabledWithoutDocker`); RabbitMQ IT thêm container `rabbitmq:3-management` + publish synthetic envelope qua `rabbitTemplate` (pattern từ template `OutboxIntegrationTest`); WireMock override per-request `RequestOptions.builder().setBaseUrl(wiremock.url())` (đã verify javap 24.16); signature test tự compute HMAC-SHA256. Build: `cd backend && mvn -pl services/<svc> -am verify` mỗi task; cuối: `mvn verify` full reactor.

## 6. Risks & unknowns

- **Must verify khi code:** Hibernate 6 `@JdbcTypeCode(SqlTypes.JSON)` với `List<record>` (fallback: String jsonb + ObjectMapper) · jsonb SUM native query · `InvalidRequestException.getCode()` mapping 409.
- **Unverified assumptions (đã giảm tối đa):** WireMock + stripe-java per-request baseUrl (VERIFIED javap) · envelope 5-field (VERIFIED đọc code) · db_inventory/db_payment tồn tại (VERIFIED psql) · ports rảnh (VERIFIED lsof).
- Docker IT: Docker 29 cần `api.version=1.44` (memory SF-1 — IT template đã chạy được, giữ config).

---

### Task 1: inventory-service scaffold + Flyway domain + wiring

**Files:**
- Modify: `backend/pom.xml` (append 2 `<module>` — CẢ inventory + payment một lượt, tránh conflict SF song song)
- Modify: `backend/gateway/src/main/resources/gateway-routes.yml` (un-comment block `inventory` — SF-5 sở hữu)
- Create: `backend/services/inventory-service/pom.xml`, `src/main/java/com/ecommerce/inventory/InventoryServiceApplication.java`, `src/main/resources/application.yml`, `src/main/resources/db/migration/V1__init.sql` (copy template), `V10__inventory_domain.sql`, `src/test/java/com/ecommerce/inventory/AbstractIntegrationTest.java`, `InventoryScaffoldIT.java` (Dockerfile → Task 8, một owner duy nhất)`

**Steps:**
- [ ] Append modules vào `backend/pom.xml` (sau `services/template-service`): `<module>services/inventory-service</module>` + `<module>services/payment-service</module>` (payment module T5 tạo sau — pom refer trước không sao vì -pl chọn lọc; NHƯNG `mvn verify` full reactor sẽ fail nếu module thiếu → T8 trước khi chạy full, đảm bảo T5 đã có. Ghi chú trong task.)
- [ ] `V10__inventory_domain.sql`:
```sql
CREATE TABLE stocks (
    variant_id    VARCHAR(64) PRIMARY KEY,
    quantity      INT NOT NULL CHECK (quantity >= 0),
    threshold_low INT NOT NULL DEFAULT 10,
    product_id    VARCHAR(64),
    product_name  VARCHAR(255),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reservations (
    id         UUID PRIMARY KEY,
    order_id   VARCHAR(64) NOT NULL,
    status     VARCHAR(16) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    items      JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_order ON reservations (order_id, status);
CREATE INDEX idx_reservations_expiry ON reservations (status, expires_at);
CREATE UNIQUE INDEX uq_reservations_active_order
    ON reservations (order_id) WHERE status IN ('RESERVED', 'COMMITTED');
```
- [ ] `pom.xml` fork template: bỏ springdoc? KHÔNG — giữ (swagger demo browser verify). Thêm `awaitility` test-scope (Boot BOM manage version).
- [ ] `application.yml` fork template: port `8084`, name `inventory-service`, datasource default `db_inventory`, thêm:
```yaml
inventory:
  reservation:
    sweep-interval-ms: ${INVENTORY_SWEEP_INTERVAL_MS:30000}
    max-ttl-minutes: ${INVENTORY_MAX_TTL_MINUTES:60}
  low-stock-threshold: ${INVENTORY_LOW_STOCK_THRESHOLD:10}
```
(merge các key `inventory.*` vào yml fork từ template — KHÔNG tạo root key `spring:`/`inventory:` trùng — YAML duplicate-key chết im.)
- [ ] Application class fork template (`@EntityScan({"com.ecommerce.inventory.domain", "com.ecommerce.common.outbox"})`).
- [ ] `AbstractIntegrationTest` fork template (db name `db_inventory`).
- [ ] `InventoryScaffoldIT`: context loads + Flyway migrate + JdbcTemplate assert 2 bảng + unique index tồn tại (`SELECT indexdef FROM pg_indexes WHERE indexname='uq_reservations_active_order'`).
- [ ] Un-comment gateway route block `inventory` (bỏ `# ` đầu 4 dòng, giữ comment `# SF-5 · port 8084`).
- [ ] Chạy: `cd backend && mvn -pl services/inventory-service -am verify` → PASS (kể cả IT nếu Docker chạy; không Docker thì IT skip — phải thấy "Tests run" unit ≥ 0 + BUILD SUCCESS).
- [ ] Commit: `feat(inventory): scaffold inventory-service với Flyway stocks/reservations + gateway route`

### Task 2: Reservation API all-or-nothing (TDD)

**Files:**
- Create: `domain/Stock.java`, `domain/Reservation.java`, `domain/ReservationStatus.java`, `domain/ReservationItem.java` (record), `repo/StockRepository.java`, `repo/ReservationRepository.java`, `service/ReservationService.java`, `api/ReservationController.java`, `api/dto/CreateReservationRequest.java`, `api/dto/ReservationItemDto.java`, `api/dto/ReservationCreatedResponse.java`, `api/dto/InsufficientStockDto.java`, `api/InsufficientStockException.java`, `api/InventoryExceptionHandler.java`
- Test: `ReservationApiIT.java`

**Key signatures:**
```java
// ReservationRepository
Optional<Reservation> findFirstByOrderIdAndStatusAndExpiresAtAfterOrderByCreatedAtDesc(String orderId, ReservationStatus status, Instant now);
Optional<Reservation> findFirstByOrderIdAndStatusOrderByCreatedAtDesc(String orderId, ReservationStatus status);
@Modifying @Query("UPDATE Reservation r SET r.status = :to WHERE r.id = :id AND r.status = :from")
int transition(UUID id, ReservationStatus from, ReservationStatus to);
// StockRepository — lock bằng NATIVE FOR UPDATE (JPQL không hỗ trợ FOR UPDATE + ORDER BY cùng IN):
@Query(value = "SELECT * FROM stocks WHERE variant_id IN (:ids) ORDER BY variant_id FOR UPDATE", nativeQuery = true)
List<Stock> lockAllNative(@Param("ids") Collection<String> ids);
@Modifying @Query("UPDATE Stock s SET s.quantity = s.quantity - :qty, s.updatedAt = CURRENT_TIMESTAMP WHERE s.variantId = :id")
int deduct(@Param("id") String id, @Param("qty") int qty);
@Modifying @Query("UPDATE Stock s SET s.quantity = s.quantity + :qty, s.updatedAt = CURRENT_TIMESTAMP WHERE s.variantId = :id")
int restock(@Param("id") String id, @Param("qty") int qty);
```
**ReservationService.create(orderId, items[{variantId, qty}], ttlMinutes, correlationId) — 6 bước spec §4.2:** (1) gom trùng Map<variantId,qty> + validate ttl (`ttlMinutes` vắng mặt → **default 30 — contract pin**; <1 hoặc > `inventory.reservation.max-ttl-minutes` → 400 qua `ResponseStatusException BAD_REQUEST`) → (2) self-heal: `reservationRepo` tìm RESERVED hết hạn của order này → `transition(id, RESERVED, RELEASED)==1` → restock từng item + `outboxWriter.write("inventory.released", payload{reservationId, orderId, items})` → (3) replay: `findFirst...StatusAndExpiresAtAfter(RESERVED)` → 201 DTO cũ; COMMITTED → replay; (4) `lockAllNative` → (5) check-all gom `insufficient[]` (variant không có row = available 0) → ném `InsufficientStockException` → (6) deduct-all + INSERT reservation (`@JdbcTypeCode(SqlTypes.JSON) List<ReservationItem>`, TTL `Instant.now().plus(ttl, MINUTES)`) + `outboxWriter.write("inventory.reserved", ...)`; catch `DataIntegrityViolationException` trên INSERT → re-lookup active → replay 201.
**jsonb casing (PIN một quyết định cho cả T2/T3/T4):** DB jsonb lưu **snake_case** `{"variant_id": "...", "qty": n}` — record `ReservationItem(String variantId, int qty)` với `@JsonProperty("variant_id")` (Jackson serialization của Hibernate tôn trọng annotation) — khớp spec §4.1 + T3 SQL `item->>'variant_id'`. Event payload thì **camelCase** `variantId` (schema freeze) → T4 build payload bằng remap snake→camel. IT T2 assert jsonb thật: `SELECT items->0->>'variant_id' FROM reservations` = snake.
**Controller (KHÔNG prefix `/api` — gateway StripPrefix=1):** `POST /inventory/reservations` `@Valid` body (orderId @NotBlank, items @NotEmpty @Valid, qty ≥ 1, ttlMinutes ≥ 1 optional) → 201 `{reservationId, expiresAt}`. **`InventoryExceptionHandler`** `@RestControllerAdvice`: `InsufficientStockException` → 409 `application/problem+json` body ApiError + extension `insufficient` (ObjectNode ghép, khớp `ReservationConflictError`).
**IT ReservationApiIT (RANDOM_PORT + TestRestTemplate qua cổng thật — HTTP path gồm Jackson + advice):**
- reserve 2 variant đủ stock (seed stocks qua JdbcTemplate) → 201, `quantity` giảm đúng (Jdbc assert), expiresAt ≈ now+30'
- vượt (1 trong 2 variant thiếu) → 409 + body có `insufficient[]` ĐỦ mọi variant thiếu + available KHÔNG đổi
- duplicate variantId 1 request (qty 5 + qty 6, stock 8) → 409 insufficient requested=11
- replay cùng order_id → 201 cùng reservationId, stock không trừ thêm
- 2 thread cùng order_id đồng thời → đúng 1 reservation active (partial index), 1 trong 2 nhận 201 replay; tổng trừ = qty của 1 request
- 2 thread khác order tranh last stock (tổng qty > stock) → đúng 1 × 201, 1 × 409, stock = 0
- re-reserve khi reservation cũ hết hạn (seed expires_at quá khứ chưa quét) → 201 reservation MỚI + event `inventory.released` trong outbox + stock = cũ - qty_mới
- [ ] Commit: `feat(inventory): reservation API all-or-nothing + replay + self-heal expired`

### Task 3: Availability + low-stock endpoints

**Files:**
- Create: `api/InventoryQueryController.java`, `repo/InventoryQueryRepository.java` (repository RIÊNG — không sửa StockRepository của T2, T3 độc lập với T2), `repo/VariantAvailabilityView.java`, `repo/LowStockView.java` (interface projections)
- Test: `InventoryQueryIT.java`

**Key:**
```java
// InventoryQueryRepository (extends Repository<Stock, String> — binding domain type cho native query)
public interface InventoryQueryRepository extends Repository<Stock, String> {
@Query(value = """
    SELECT s.variant_id AS variantId,
           s.quantity AS available,
           COALESCE(r.reserved, 0) AS reserved
    FROM stocks s
    LEFT JOIN (
        SELECT item->>'variant_id' AS vid, SUM((item->>'qty')::int) AS reserved
        FROM reservations, jsonb_array_elements(items) AS item
        WHERE status = 'RESERVED' AND expires_at > now()
        GROUP BY 1
    ) r ON r.vid = s.variant_id
    WHERE s.variant_id IN (:ids)
    """, nativeQuery = true)
List<VariantAvailabilityView> findAvailability(@Param("ids") Collection<String> ids);

@Query(value = """
    SELECT variant_id AS variantId, product_id AS productId, product_name AS productName,
           quantity AS available, threshold_low AS threshold
    FROM stocks WHERE quantity <= :threshold ORDER BY quantity ASC
    """, nativeQuery = true)
List<LowStockView> findLowStock(@Param("threshold") int threshold);
```
(alias `threshold` — khớp contract field `threshold`, KHÔNG `thresholdUsed`.)
Controller: `GET /inventory/availability?variantIds=a,b,c` (`@RequestParam List<String> variantIds` — Spring tách comma với form explode=false; rỗng → 400) → 200 list. `GET /inventory/admin/low-stock?threshold=` (default `@Value("${inventory.low-stock-threshold:10}")`) → 200 list đủ 5 trường contract (productId/productName null khi chưa fill). IT: availability đúng available+reserved (seed reservation active jsonb SNAKE_CASE keys), reservation hết hạn KHÔNG tính reserved; low-stock lọc đúng + threshold param override.
- [ ] Commit: `feat(inventory): availability + low-stock admin endpoints (jsonb reserved SUM)`

### Task 4: TTL sweeper + commit/release consumers

**Files:**
- Create: `service/InventorySweeper.java`, `consumer/InventoryOrderConsumer.java`, `config/RabbitMqConfig.java`
- Test: `InventoryEventsIT.java` (RabbitMQ Testcontainers)

**Key:**
```java
// RabbitMqConfig — common-lib chỉ declare exchange; service declare queue + bindings + converter + poison handler
@Bean Queue inventoryOrders() { return QueueBuilder.durable("inventory.orders").build(); }
@Bean Binding paidBinding()  { return BindingBuilder.bind(inventoryOrders()).to(exchange).with("order.paid"); }
@Bean Binding cancelBinding(){ ... "order.cancelled" ... }
@Bean Binding failedBinding(){ ... "order.failed" ... }
@Bean Jackson2JsonMessageConverter converter(ObjectMapper om) { return new Jackson2JsonMessageConverter(om); }
@Bean SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(ConnectionFactory cf, Jackson2JsonMessageConverter conv) {
    var f = new SimpleRabbitListenerContainerFactory();
    f.setConnectionFactory(cf); f.setMessageConverter(conv);
    f.setErrorHandler(new ConditionalRejectingErrorHandler()); // poison reject-no-requeue; transient → requeue
    return f;
}

// InventorySweeper
@Scheduled(fixedDelayString = "${inventory.reservation.sweep-interval-ms:30000}")
public void releaseExpired() { /* mỗi reservation RESERVED expires_at < now():
    transition(id, RESERVED, RELEASED)==1 → restock items + outbox inventory.released */ }

// InventoryOrderConsumer
@RabbitListener(queues = "inventory.orders")
@Transactional
public void on(EventEnvelope envelope) {
    if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) return;
    switch (envelope.eventType()) {
        case "order.paid" -> commit(...);      // transition RESERVED→COMMITTED rowcount==1 → outbox inventory.committed; else warn no-op
        case "order.cancelled", "order.failed" -> release(...); // RESERVED→RELEASED rowcount==1 → restock + outbox inventory.released; else warn
        default -> log.warn("unknown eventType {}", envelope.eventType());
    }
}
```
Payload commit/release: `{reservationId, orderId, items[]}` — **items remap SNAKE (jsonb) → CAMEL (event schema)**: đọc `reservation.getItems()` (đã deserialize thành record `ReservationItem(variantId, qty)` camel-tên-field, có `@JsonProperty("variant_id")` cho jsonb round-trip) → build payload node với key `variantId` — schema-exact, KHÔNG thêm reason (log thôi). correlationId = `envelope.correlationId()` incoming. **Poison message (PIN — plan-critic cycle 2):** `ConditionalRejectingErrorHandler` trên listener container factory trong `RabbitMqConfig` (`SimpleRabbitListenerContainerFactory.setErrorHandler(new ConditionalRejectingErrorHandler())`) — conversion fail (poison) → reject KHÔNG requeue; lỗi TRANSIENT (DB blip...) → vẫn requeue (giữ at-least-once). KHÔNG dùng `default-requeue-rejected: false` (biến mọi lỗi thành at-most-once — mất event commit stock).
**IT InventoryEventsIT:** publish synthetic envelope (ObjectMapper serialize EventEnvelope) qua `rabbitTemplate.convertAndSend("ecommerce.events", "order.paid", envelopeJson)` — seed reservation RESERVED → await 5s (Awaitility) → status COMMITTED + outbox row `inventory.committed` + **assert payload keys camelCase** (`payload.items[0].variantId` tồn tại, `variant_id` KHÔNG); re-publish CÙNG eventId → không đổi gì (vẫn 1 outbox row); order.cancelled → RELEASED + stock hoàn; sweep: seed reservation hết hạn → gọi `sweeper.releaseExpired()` trực tiếp → RELEASED + outbox `inventory.released` + stock hoàn; sweep-vs-consumer: reservation hết hạn bị sweep TRƯỚC rồi order.paid tới → consumer warn no-op, stock không đổi, không event mới; **poison**: publish garbage JSON vào queue → không requeue (queue depth 0 sau 2s), business state untouched.
- [ ] Commit: `feat(inventory): TTL sweeper + idempotent commit/release consumers`

### Task 5: payment-service scaffold + SPI + StripeAdapter

**Files:**
- Modify: `gateway-routes.yml` (un-comment block `payment`)
- Create: `backend/services/payment-service/pom.xml` (fork template + `com.stripe:stripe-java` + test `org.wiremock:wiremock-standalone:3.9.1`), `PaymentServiceApplication.java`, `application.yml` (port 8086, db_payment, thêm block stripe), `V1__init.sql` (copy template), `V10__payment_domain.sql` (spec §5.1 + cột `stripe_status VARCHAR(32)` mirror response + index `idx_payment_order` trên order_id), `spi/PaymentProviderAdapter.java`, `spi/IntentCommand.java`, `spi/AdapterIntent.java`, `spi/AdapterRefund.java`, `spi/ProviderWebhookEvent.java`, `spi/WebhookVerificationException.java`, `spi/PaymentUnconfiguredException.java`, `spi/StripeAdapter.java`, `spi/UnconfiguredAdapter.java`, `config/PaymentAdapterConfig.java` (Dockerfile → Task 8)
- Test: `AbstractPaymentIntegrationTest.java` (fork, db_payment), `StripeAdapterTest.java` (WireMock, KHÔNG cần Spring context — new StripeAdapter trực tiếp), `PaymentScaffoldIT.java` (mirror T1: context loads + Flyway 2 bảng — bắt lỗi V10/yml ngay ở T5 không chờ T6)

**Key:**
```java
// application.yml
stripe:
  secret-key: ${STRIPE_SECRET_KEY:}
  webhook-secret: ${STRIPE_WEBHOOK_SECRET:}
  base-url: ${STRIPE_BASE_URL:https://api.stripe.com}   # IT override → WireMock

// PaymentAdapterConfig — @ConditionalOnProperty KHÔNG đủ (empty string vẫn match) → custom Condition:
static class StripeSecretKeyPresentCondition implements Condition {
    public boolean matches(ConditionContext ctx, AnnotatedTypeMetadata md) {
        String key = ctx.getEnvironment().getProperty("stripe.secret-key", "");
        return key != null && !key.isBlank();
    }
}
@Bean @Conditional(StripeSecretKeyPresentCondition.class)
StripeAdapter stripeAdapter(@Value("${stripe.secret-key}") String key, @Value("${stripe.base-url}") String baseUrl) { ... }
@Bean @ConditionalOnMissingBean(PaymentProviderAdapter.class)
PaymentProviderAdapter unconfiguredAdapter() { return new UnconfiguredAdapter(); }

// StripeAdapter (chỉ methods chính)
public AdapterIntent createIntent(IntentCommand cmd) {
    var params = PaymentIntentCreateParams.builder()
        .setAmount(cmd.amountVnd()).setCurrency(cmd.currency().toLowerCase(Locale.ROOT))
        .setAutomaticPaymentMethods(PaymentIntentCreateParams.AutomaticPaymentMethods.builder().setEnabled(true).build())
        .putMetadata("order_id", cmd.orderId()).build();
    var opts = RequestOptions.builder().setApiKey(secretKey).setBaseUrl(baseUrl)
        .setIdempotencyKey(cmd.idempotencyKey()).build();   // setIdempotencyKey — VERIFIED javap 24.16
    PaymentIntent pi = PaymentIntent.create(params, opts);
    return new AdapterIntent(pi.getId(), pi.getClientSecret(), pi.getStatus());
}
public ProviderWebhookEvent verifyWebhook(String rawBody, String sigHeader) {
    if (webhookSecret == null || webhookSecret.isBlank()) throw new PaymentUnconfiguredException();
    Event event = Webhook.constructEvent(rawBody, sigHeader, webhookSecret); // throws SignatureVerificationException → wrap WebhookVerificationException
    // parse data.object → PaymentIntent/Refund tùy type; trả ProviderWebhookEvent(eventId, type, intentId, amount, currency, failureMessage)
}
```
(Stripe-side idempotency đã verify: `RequestOptions.RequestOptionsBuilder.setIdempotencyKey(String)` tồn tại trong 24.16 (javap) — plan-B bỏ.)
`UnconfiguredAdapter`: mọi method ném `PaymentUnconfiguredException`. VND zero-decimal: amount truyền nguyên; currency lowcase 'vnd' cho Stripe, uppercase cho DB/event.
**StripeAdapterTest (WireMock, deterministic — không Docker):** stub `POST /v1/payment_intents` trả JSON pi + client_secret + status `requires_confirmation` → assert AdapterIntent; stub `POST /v1/payment_intents/pi_x/cancel` → void; stub `POST /v1/refunds` → re_; verify request header `Idempotency-Key` = cmd key + amount = số VND nguyên (WireMock verify). Signature: compute helper `sign(whsec, payload, epochNow)` (HMAC-SHA256 hex, header `t=<ts>,v1=<hex>`) → `verifyWebhook` OK; sai header → `WebhookVerificationException`.
- [ ] Commit: `feat(payment): scaffold payment-service + PaymentProviderAdapter SPI + StripeAdapter`

### Task 6: Intents API idempotent + degraded mode

**Files:**
- Create: `domain/PaymentIntent.java`, `domain/PaymentIntentStatus.java`, `repo/PaymentIntentRepository.java`, `service/PaymentIntentService.java`, `api/PaymentController.java`, `api/dto/CreateIntentRequest.java`, `api/dto/PaymentIntentCreatedResponse.java`, `api/PaymentExceptionHandlers.java`
- Test: `PaymentIntentsIT.java` (WireMock + PG), `PaymentDegradedIT.java` (context không key — `@SpringBootTest(properties = {"stripe.secret-key=", "spring.datasource.url=..."})` + PG container riêng)

**Key:** service.createIntent(request, headerKey): key = header không rỗng ? header : request.idempotencyKey() (cả hai rỗng → 400 `ResponseStatusException`); validate amount > 0 (400), currency == "VND" (400). payloadHash = SHA-256 hex của `orderId|amount|currency` (HexFormat). Lookup `findByIdempotencyKey`: có + hash khớp → 201 response cũ (dựng từ cột `stripe_status` mirror đã lưu lúc tạo — replay không gọi adapter); có + hash khác → 409. Không có → gọi adapter (rollback nếu ném — spec §5.3 bước 4) → INSERT (đủ stripe_intent_id/client_secret/stripe_status) → 201. **Lưu ý T5: cột `stripe_status VARCHAR(32)` viết SẴN trong V10__payment_domain.sql** (không migration sau).
**V10 bổ sung cột:** `stripe_status VARCHAR(32)` (mirror response) — V10 chưa commit nên viết thẳng vào file.
Controller (KHÔNG prefix `/api` — gateway StripPrefix=1): `POST /payment/intents` header `Idempotency-Key` optional → 201/400/409/502/503. **DTO `CreateIntentRequest.idempotencyKey` KHÔNG đặt `@NotBlank`** (contract required ở schema nhưng header là kênh chính — request chỉ có header phải qua `@Valid`). `PaymentExceptionHandlers`: `PaymentUnconfiguredException` → 503 problem+json title `payment_unconfigured` + detail chỉ env; `StripeException` InvalidRequest → 409 `payment_conflict` (T7 chung), Stripe khác → 502 `payment_provider_error`.
**IT PaymentIntentsIT:** WireMock stub create → 201 {paymentIntentId=pi_..., clientSecret=secret_..., status=requires_confirmation}; replay same key same payload → CÙNG response (WireMock được gọi ĐÚNG 1 lần — verify count); same key khác amount → 409; amount 0/âm → 400; currency USD → 400; thiếu key header + body → 400; WireMock trả 500 → 502 + DB KHÔNG có row (rollback — assert count=0); retry sau lỗi với cùng key → thành công (rollback semantics đúng).
**IT PaymentDegradedIT:** boot không key → `/payment/intents` 503 title `payment_unconfigured` **+ `/payment/refunds` + `/payment/void` + `/payment/webhook` đều 503 cùng title**; health UP; outbox relay vẫn poll (log/bean tồn tại). **Case key-có-secret-thiếu**: `@SpringBootTest` riêng với secret-key set + webhook-secret blank → webhook 503 (không crash boot).
- [ ] Commit: `feat(payment): idempotent intents API + degraded mode 503`

### Task 7: Webhook + refund/void + error classification

**Files:**
- Modify: `api/PaymentController.java` (+3 endpoint), `service/PaymentIntentService.java` (+3 method)
- Test: `PaymentWebhookIT.java`

**Key:** webhook endpoint: `@PostMapping(value="/payment/webhook")` `@RequestBody String rawBody` + `@RequestHeader("Stripe-Signature")` → `adapter.verifyWebhook` (sai → `WebhookVerificationException` → 400) → `@Transactional` handler: `tryConsume("stripe:" + evt.eventId())` false → 200 `{received:true}`; switch type: `payment_intent.succeeded` → tìm theo stripeIntentId → local status SUCCEEDED + stripe_status SUCCEEDED + outbox `payment.succeeded {orderId, paymentIntentId, amount, currency:"VND", failureReason:null}`; `payment_intent.payment_failed` → FAILED + outbox `payment.failed {.., failureReason}`; `charge.refunded` → local REFUNDED (silent); khác → no-op. Không thấy intent → warn + 200. correlationId outbox = evt.eventId().
Refund: local precheck (404 nếu không có stripeIntentId; 409 nếu status != SUCCEEDED) → adapter.refund → 201 `{refundId, status mirror, amount}` + local REFUNDED nếu full (amount == null hoặc == amount_vnd). Void: precheck (409 trừ khi CREATED/REQUIRES_CONFIRMATION) → adapter.voidIntent → local VOIDED + 200 `{status: mirror CANCELED}`.
**IT PaymentWebhookIT:** sig sai → 400 (WireMock không bị gọi); sig đúng succeeded → 200 + outbox row `payment.succeeded`: parse envelope — assert payload-section khớp schema fields + envelope đủ 5 field (eventId UUID, eventType, occurredAt, correlationId, payload) — **KHÔNG assert producer/schemaVersion (GAP #2)**; re-post CÙNG event → 200, outbox vẫn 1 row; `payment_intent.payment_failed` → outbox failed + failureReason; **webhook intent không tồn tại local → 200 + warn, không outbox row**; refund full → 201 + status REFUNDED; refund vượt amount (WireMock trả invalid_request_error) → 409; void sau SUCCEEDED → 409; void sau CREATED → 200 VOIDED; refund unknown pi → 404.
- [ ] Commit: `feat(payment): webhook signature verify + outbox events + refund/void`

### Task 8: Full-suite + Dockerfiles + demo seed + docs

**Files:**
- Create: `backend/services/inventory-service/Dockerfile`, `backend/services/payment-service/Dockerfile` (fork template — đổi COPY paths + EXPOSE 8084/8086)
- Create: `backend/services/inventory-service/README.md` (demo seed psql + curl walkthrough), `backend/services/payment-service/README.md` (degraded vs key mode + stripe-cli listen)
- Verify: full reactor

**Steps:**
- [ ] Seed demo script trong README (KHÔNG migration seed):
```bash
docker compose exec -T postgres psql -U postgres -d db_inventory -c \
 "INSERT INTO stocks (variant_id, quantity, threshold_low, product_id, product_name) VALUES ('var-ao-thun-den-m', 50, 10, 'prod-1', N'Áo thun đen M'), ('var-ao-thun-den-l', 3, 10, 'prod-1', N'Áo thun đen L') ON CONFLICT DO NOTHING"
```
- [ ] `cd backend && mvn verify` (full reactor — T5 module đã tồn tại) → BUILD SUCCESS, list số test mỗi module.
- [ ] IT coverage checklist §7 spec: 7 case đủ? thiếu case nào → bổ sung TRƯỚC khi commit.
- [ ] Commit: `feat(services): Dockerfiles + demo seed docs + full suite green`

---

## Verification (Phase 5 — mapping ACCEPTANCE spec §10)

| # | ACCEPTANCE | Cách verify |
|---|-----------|-------------|
| 1 | Reserve đủ → 201 available giảm; vượt → 409 0 trừ | IT T2 + browser Swagger flow qua gateway :8080 |
| 2 | TTL hết → RELEASE + event | IT T4 (gọi sweeper trực tiếp) |
| 3 | order.paid → COMMIT; cancelled → RELEASE; re-delivery không double | IT T4 synthetic events |
| 4 | Có sk_test → intent + client_secret; webhook → outbox; sig sai → 400 | IT T6/T7 WireMock; smoke thật khi user cấp key (optional) |
| 5 | Không key → boot OK, 503 rõ | IT T6 degraded + boot thật `make dev svc=payment` |
| 6 | PDP availability (API level) | curl qua gateway :8080 route |

Browser verify (Rule 0 — backend SF, surface = Swagger UI): `orca tab create` http://localhost:8084/swagger-ui.html + :8086 → visual check + try-it-out flow reserve → 409 → degraded 503, screenshot mỗi bước.
