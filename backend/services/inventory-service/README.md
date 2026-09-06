# inventory-service (SF-5)

Stock + reservation VARIANT-level với TTL all-or-nothing. Port **8084** · DB `db_inventory`.

## Chạy dev

```bash
make infra            # PG 5433 / rabbitmq 5672 (giả định đã chạy)
make dev svc=inventory
```

## Seed demo (KHÔNG migration seed — chỉ db dev)

```bash
docker compose exec -T postgres psql -U postgres -d db_inventory -c \
 "INSERT INTO stocks (variant_id, quantity, threshold_low, product_id, product_name) VALUES
  ('var-ao-thun-den-m', 50, 10, 'prod-1', 'Áo thun đen M'),
  ('var-ao-thun-den-l', 3,  10, 'prod-1', 'Áo thun đen L')
  ON CONFLICT DO NOTHING"
```

## Walkthrough (qua gateway :8080)

```bash
# 1. Reserve đủ → 201 {reservationId, expiresAt}, stock 50→45
curl -s -X POST localhost:8080/api/inventory/reservations -H 'Content-Type: application/json' \
  -d '{"orderId":"order-demo-1","items":[{"variantId":"var-ao-thun-den-m","qty":5}]}'

# 2. Reserve vượt → 409 problem+json insufficient[] — KHÔNG trừ gì
curl -s -X POST localhost:8080/api/inventory/reservations -H 'Content-Type: application/json' \
  -d '{"orderId":"order-demo-2","items":[{"variantId":"var-ao-thun-den-l","qty":10}]}'

# 3. Availability (PDP gọi) → [{variantId, available:45, reserved:5}]
curl -s "localhost:8080/api/inventory/availability?variantIds=var-ao-thun-den-m,var-ao-thun-den-l"

# 4. Replay cùng orderId → 201 cùng reservationId (idempotency theo order)
curl -s -X POST localhost:8080/api/inventory/reservations -H 'Content-Type: application/json' \
  -d '{"orderId":"order-demo-1","items":[{"variantId":"var-ao-thun-den-m","qty":5}]}'
```

## Events (RabbitMQ `ecommerce.events`)

- Consume `order.paid|cancelled|failed` (queue `inventory.orders`) → COMMIT/RELEASE reservation — idempotent qua `processed_messages`.
- Publish `inventory.reserved` (reserve OK), `inventory.committed`, `inventory.released` — transactional outbox, payload schema-exact (`contracts/events/`).
- TTL sweep: reservation RESERVED quá `expires_at` → RELEASE + event (`inventory.reservation.sweep-interval-ms`, default 30s).

## Auth posture

`POST /reservations` là `x-internal-only` (ordering gọi) — hiện public trong gateway; RBAC/service-token wire ở **SF-3** (gateway-auth-wiring-admin-guard). `/admin/low-stock` chờ cùng cơ chế.

## Gap đã flag (FI-310 REQUIREMENT-GAP)

`LowStockItem` contract đòi `productId`/`productName` nhưng inventory không có nguồn product — 2 cột denormalized nullable (writer-supply sau, ví dụ qua `product.changed`). Hiện trả null.
