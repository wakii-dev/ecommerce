# common-lib

Nền dùng chung cho CÁC SERVICE CÓ DB (Postgres): outbox + idempotent consume +
error model + request-id correlation. Fork từ service template
(`backend/services/template-service`).

## Dependency surface (lưu ý khi consume)

common-lib kéo theo `starter-web` (servlet) + `starter-data-jpa` +
`starter-amqp` + `starter-validation`:

| Consumer | Có dùng được common-lib? |
|---|---|
| Service có DB PG (identity, catalog, ordering, payment, inventory) | ✓ target chính |
| notification (db nhẹ = `db_notification`) | ✓ — dùng PG bình thường |
| **gateway (WebFlux)** | ✗ KHÔNG — servlet web conflict; gateway tự viết filter riêng |
| cart-service (Redis-only) | ⚠ dùng được web/error model; `IdempotentConsumer` CẦN bảng `processed_messages` (PG) — nếu không muốn PG, cart tự dedupe bằng operation tự nhiên idempotent |

Đang bị ép dependency thừa? Chấp nhận cho tới khi có nhu cầu thật — tách module
(`common-core`/`common-outbox`) chỉ khi ≥2 service cần khác biệt (ADR lúc đó).

## Wire format event (một nguồn duy nhất)

- Body message RabbitMQ = JSON của `EventEnvelope`
  `{eventId, eventType, occurredAt, correlationId, payload}` — bọc tại
  `OutboxWriter` khi ghi outbox.
- Routing key = `eventType` (`<domain>.<event>`), exchange topic
  `ecommerce.events` (declare 1 lần tại `CommonLibAutoConfiguration`).
- AMQP headers (`eventType`, `correlationId`, `messageId`) chỉ là bản sao tiện
  middleware/debug — KHÔNG phải nguồn dữ liệu của consumer.
- Consumer idempotent: `IdempotentConsumer.tryConsume(envelope.eventId)`.

## Correlation chain

`gateway RequestIdFilter` (gen/propagate `X-Request-Id`) →
service `RequestIdMdcFilter` (MDC log `[req=…]`) →
`OutboxWriter(correlationId)` → envelope → consumer đọc lại. Mất 1 hop nào đó =
trace gãy — KHÔNG bỏ qua filter khi fork.
