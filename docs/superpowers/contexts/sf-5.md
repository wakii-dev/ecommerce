# SF-5 Context Pack — inventory + payment services

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).

## Spec slice (chỉ phần SF-5 chịu trách nhiệm)

1. **inventory-service** (port 8084, db_inventory): Flyway — `stocks` (variant_id unique, quantity int, threshold_low int), `reservations` (id uuid, order_id, status RESERVED|COMMITTED|RELEASED, expires_at, items jsonb `[{variant_id, qty}]`, created_at), `processed_messages`.
2. **`POST /api/inventory/reservations`** (theo inventory.yaml, gọi nội bộ từ ordering sau này — guard service-token hoặc public-within-gateway): body `{order_id, items[{variant_id, qty}]}` → **all-or-nothing**: kiểm đủ stock TẤT CẢ items (row-lock `SELECT ... FOR UPDATE`), trừ available, tạo reservation TTL 30' (`expires_at`) → 201 `{reservation_id, expires_at}`; thiếu bất kỳ → **409** `{insufficient[{variant_id, requested, available}]}`, KHÔNG trừ gì.
3. **`GET /api/inventory/availability?variant_ids=`** → [{variant_id, available}] (cho PDP hiển thị). **`GET /api/inventory/admin/low-stock`** (guard ADMIN, threshold từ env) → [{variant_id, product_id, quantity}].
4. **Consumers** (idempotent qua processed_messages): `order.paid` → COMMIT reservation (stock trừ vĩnh viễn, event `inventory.committed`); `order.cancelled` | `order.failed` → RELEASE (hoàn available, event `inventory.released` reason `order_{cancelled|failed}`).
5. **@Scheduled TTL sweep**: reservation RESERVED quá `expires_at` → RELEASE + event `inventory.released` reason `ttl_expired`.
6. **payment-service** (port 8086, db_payment): Flyway `payment_intents` (id, order_id, stripe_intent_id, amount_vnd bigint, currency 'vnd', status CREATED|REQUIRES_CONFIRMATION|SUCCEEDED|FAILED|VOIDED|REFUNDED, idempotency_key unique).
7. **`PaymentProviderAdapter`** interface (trong payment-service, package `spi/`): `createIntent(order)`, `void(intent)`, `refund(intent, amount)`, `verifyWebhook(payload, sigHeader)`. **StripeAdapter** impl dùng `stripe-java` + test keys từ env (VND zero-decimal).
8. **APIs theo payment.yaml**: `POST /api/payment/intents` (header Idempotency-Key, replay trả cùng kết quả) → `{intent_id, client_secret}`; `POST /api/payment/webhook` — verify signature → outbox `payment.succeeded`|`payment.failed`; `POST /api/payment/refunds`, `POST /api/payment/void` (cho ordering gọi ở SF-9 — làm sẵn endpoint + logic; gateway route append block payment).
9. **Degraded mode**: thiếu `STRIPE_SECRET_KEY` → service BOOT OK; `POST /intents` → 503 problem+json `{title: "payment_unconfigured"}`; không crash scheduler/webhook.
10. **IT (Testcontainers + WireMock/stripe test harness)**: reservation concurrent 2 thread tranh nhau last stock (đúng 1 thắng, all-or-nothing); TTL release (config TTL ngắn trong test); commit/release consumers idempotent (re-delivery không double-commit); webhook signature sai → 400, đúng → event outbox; idempotency replay intents.
11. Compose: append blocks `inventory-service`, `payment-service` (dev = chạy host, compose chỉ infra — nếu thêm service block cho profile full thì append-only); Makefile append targets; gateway routes append 2 blocks.

## Touch map (files SF-5 tạo/sở hữu)

```
backend/services/inventory-service/**
backend/services/payment-service/** (gồm package spi/ + StripeAdapter)
backend/gateway/src/main/resources/routes/inventory.yml · payment.yml (append)
docker-compose.yml (append, nếu cần) · Makefile (append targets)
```
READ-ONLY: `contracts/**`, `backend/shared/common-lib` (bug → flag), services khác.

## Dep states

- SF-1 + SF-2 merged (infra rabbitmq/pg, template, common-lib outbox/envelope, contracts: inventory.yaml + payment.yaml + event schemas).
- SF-3/4 CÙNG T2 SONG SONG — KHÔNG giả định merge; KHÔNG cần identity/catalog. Saga KHÔNG tồn tại (SF-9): events `order.*` chỉ có schema — IT publish synthetic qua RabbitMQ.
- Stripe test key: lấy từ user `.env` (giá trị do user đặt lúc chạy; KHÔNG commit key). Không key → degraded mode vẫn demo được boot + 503 rõ ràng.

## ACCEPTANCE (user-visible)

- Reserve 2 variant đủ stock → 201, available giảm đúng; reserve vượt → 409 all-or-nothing (0 trừ).
- TTL hết (test config ngắn) → reservation tự RELEASE + event `inventory.released`.
- Synthetic `order.paid` → COMMIT; `order.cancelled` → RELEASE; re-delivery event không double.
- Có `sk_test` từ .env → tạo Stripe intent thật (amount VND), trả `client_secret`; webhook stripe-cli → `payment.succeeded` outbox; signature sai → 400.
- Không key → boot OK, `POST /intents` → 503 với message rõ.
- PDP (SF-4, nếu đã merge) gọi availability → trả đúng (API level).

## Boundary (KHÔNG làm)

- KHÔNG saga orchestration / orders table (SF-9).
- KHÔNG checkout UI (SF-6). KHÔNG gọi catalog (chỉ expose APIs).
- KHÔNG sửa contracts (gap REST endpoint → flag coordinator). KHÔNG đụng common-lib (trừ bug → flag).
