# contracts/events/ — Event Schemas (JSON Schema draft 2020-12)

Source of truth cho payload event trên broker (RabbitMQ topic exchange `ecommerce.events`).
Services publish/consume THEO schemas này; KHÔNG sửa schema để "khớp code đang có".

## Danh sách (13 events + envelope)

| Event | Producer | Ghi chú |
|---|---|---|
| `user.created` | identity-service | |
| `product.changed` | catalog-service | ES indexer per-locale + cache invalidate |
| `inventory.reserved` | inventory-service | variant-level, all-or-nothing |
| `inventory.released` | inventory-service | qua `order.cancelled`/`order.failed` |
| `inventory.committed` | inventory-service | qua `order.paid` |
| `payment.succeeded` | payment-service | |
| `payment.failed` | payment-service | ordering → `order.failed` stage PAYMENT |
| `order.created` | ordering-service | |
| `order.paid` | ordering-service | COD KHÔNG phát (PAID lúc giao) |
| `order.confirmed` | ordering-service | **FAT payload** — đủ cho mọi consumer |
| `order.cancelled` | ordering-service | TTL 30' → cancelledBy SYSTEM |
| `order.failed` | ordering-service | stage RESERVE\|PAYMENT\|OTHER |
| `review.moderated` | catalog-service | cập nhật rating_avg denormalized |

`envelope.schema.json` — envelope chung; mỗi event schema **tự chứa** (định nghĩa lại đủ
các field envelope + payload riêng) vì `json-schema-to-typescript` không resolve `$ref`
liên file — chấp nhận lặp có chủ ý. Đổi envelope → đổi đồng bộ cả 13 file.

## Quy tắc (freeze sau SF-2)

1. **Additive-only**: chỉ THÊM field optional vào payload. Đổi type / xóa field / thêm
   field required = BREAKING — cấm, phải qua coordinator amendment.
2. **Naming**: routing key `<domain>.<event>` — domain trùng tên service sở hữu event
   (vd `order.confirmed` do ordering-service phát). Pattern envelope: `^[a-z]+\.[a-z-]+$`.
3. **Exchange**: topic `ecommerce.events` — consumer bind theo routing key
   (vd `order.*`, `inventory.reserved`).
4. **Fat payload** (§6.1): event phải đủ dữ liệu cho mọi consumer hiện hữu — CẤM consumer
   call-back HTTP để lấy field thiếu. `order.confirmed` là ví dụ chuẩn.
5. **Correlation**: `correlationId` truyền từ header `X-Request-Id` của gateway — nối
   chuỗi event cùng 1 request để trace.
6. **Tolerant reader**: consumer KHÔNG reject event vì có field lạ (field mới của producer
   version sau); chỉ đọc field mình cần. `eventId` dùng dedupe (idempotent receive).
7. Field tiền = số nguyên VND (zero-decimal); thời gian = ISO 8601 UTC.

## Validate

```bash
# Parse-all (không cần thêm dependency) — chạy tay/CI khi wire (chưa có CI events hiện tại):
for f in contracts/events/*.schema.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('OK $f')"
done

# Validate ngữ nghĩa từng event với payload mẫu (tùy chọn):
# pnpm dlx ajv-cli@5 compile -s 2020 contracts/events/<event>.schema.json
```
