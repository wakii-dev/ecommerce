# SF-9 Context Pack — ordering saga + coupons

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).
> Đây là SF có artifact phức tạp nhất (R1): checkout saga orchestration. 1/3 tasks dành cho compensation + fail-injection.

## Spec slice (chỉ phần SF-9 chịu trách nhiệm)

1. **ordering-service** (port 8085, db_ordering): Flyway — `orders` (id uuid, user_id, status enum §3.6, subtotal, discount, total, shipping_fee, address jsonb, coupon_code nullable, stripe_intent_id, created_at, updated_at), `order_items` (order_id, product_id, variant_id, name snapshot, price, qty), `coupons` (code unique, type percent|fixed, value, starts_at, ends_at, usage_limit, used_count, active), `coupon_reservations` (order_id, coupon_code, status RESERVED|FINALIZED|RELEASED), `saga_state` (order_id, step, correlation_id, updated_at), `outbox`, `processed_messages`.
2. **`POST /api/ordering/orders`** (header `Idempotency-Key` + JWT) — saga steps:
   a. Re-price server-side: gọi catalog REST cho từng item (authority giá §6.1) → subtotal.
   b. Validate + **reserve coupon usage nguyên tử** (UPDATE ... WHERE used_count < usage_limit + insert reservation; concurrent-safe — 2 order cùng lúc không vượt limit).
   c. `POST /api/inventory/reservations` (all-or-nothing, TTL 30') — fail → release coupon → 409 trả `insufficient`.
   d. `POST /api/payment/intents` (Idempotency-Key) — fail → release coupon + gọi release reservation → 502.
   e. Tạo `ORDER_PENDING` + saga_state → trả `{order, clientSecret}`. Replay cùng Idempotency-Key → cùng order (không double-charge).
3. **Consumers** (idempotent): `payment.succeeded` → PAID → outbox `order.paid`; `inventory.committed` → **CONFIRMED** → outbox `order.confirmed` **FAT payload** (§6.1: order_id, user_id, email, items[{product_id, variant_id, qty, price}], subtotal, discount, total, coupon_code); `payment.failed` → release reservation (publish `order.failed`) + release coupon → **FAILED**; **late payment**: `payment.succeeded` đến khi order terminal (CANCELLED/FAILED) → gọi `POST /api/payment/refunds` + log + email event không đổi status; TTL: inventory `inventory.released` reason `ttl_expired` khi order PENDING → **CANCELLED** + release coupon. @Scheduled quét order PENDING quá 35' (safety net sau TTL inventory).
4. **Compensation edges §3.3 (đủ 4, mỗi edge 1 IT fail-injection)**: reserve fail; payment declined; TTL hết; admin cancel sau PAID (→ `POST /api/payment/refunds` → CANCELLED).
5. **State machine guards §3.6**: transitions hợp lệ mới cho qua, else 409; admin endpoints: `GET /api/ordering/admin/orders` (filter status/date/paginate), `GET /{id}` (detail + items), `POST /{id}/ship|deliver|cancel` (role ADMIN); **admin stats**: `GET /admin/stats/revenue-by-day?days=30`, `GET /admin/stats/orders-summary`, `GET /admin/stats/top-products?days=30` (SQL aggregate).
6. **My orders**: `GET /api/ordering/me/orders` (paginate, sort mới nhất), `GET /{id}` (chủ đơn only), `POST /{id}/cancel` (PENDING → CANCELLED + release reservation qua event + release coupon).
7. **Hóa đơn PDF (D18 — Python microservice)**:
   - **`services/invoice-service/`** (🐍 **Python 3.12 + FastAPI + ReportLab**, port 8090, **stateless renderer — KHÔNG giữ business data**): `POST /api/invoice/generate` (theo `contracts/openapi/invoice.yaml` — internal-only, KHÔNG route qua gateway) nhận full payload (pydantic model: seller, buyer, items[], totals, vat_breakdown, số HĐ/mẫu/Ký hiệu/ngày) → trả PDF bytes (layout hóa đơn VN + dòng "Bản demo — không phải hóa đơn chữ ký số"). Scaffold: pyproject + uvicorn + **pytest** + Dockerfile `python:3.12-slim`. Makefile target `dev svc=invoice-service` = uvicorn; `.env.example` append: `INVOICE_SERVICE_URL=http://localhost:8090`, `INVOICE_SELLER_*`, `INVOICE_MAU_SO`, `INVOICE_KY_HIEU`, `INVOICE_VAT_RATE=10`.
   - **Java side (ordering-service)**: `InvoiceProvider` SPI (`generate(order) → bytes`) — default **`HttpInvoiceProvider`**: gán **số HĐ tuần tự** theo (mẫu, ký hiệu, năm) — bảng `invoice_sequences` (business truth thuộc Java), build payload (buyer từ address jsonb, items snapshot từ order_items, **VAT breakdown** `total × rate/(100+rate)`), gọi invoice-service, cache kết quả theo order (cùng đơn → cùng số HĐ). Service down → **503 rõ ràng** (degraded như Stripe, KHÔNG crash).
   - **Endpoints**: `GET /api/ordering/me/orders/{id}/invoice` (chủ đơn, `application/pdf`), `GET /api/ordering/admin/orders/{id}/invoice` (ADMIN).
8. **my-orders UI** (mfe-account, file-slice CHỈ `pages/orders/*`): list (status badge màu theo trạng thái, ngày, total VND), detail (items, địa chỉ, timeline trạng thái, nút Hủy khi PENDING với confirm dialog, **nút "Tải hóa đơn PDF" khi CONFIRMED+**), empty state. Shell manifest append `/account/orders`.
8. **my-orders UI** (mfe-account, file-slice CHỈ `pages/orders/*`): list (status badge màu theo trạng thái, ngày, total VND), detail (items, địa chỉ, timeline trạng thái, nút Hủy khi PENDING với confirm dialog, **nút "Tải hóa đơn PDF" khi CONFIRMED+**), empty state. Shell manifest append `/account/orders`.
9. **IT (Testcontainers; saga IT chạy với inventory + payment services THẬT trong compose test, catalog mock WireMock)**: happy path PENDING→PAID→CONFIRMED + `order.confirmed` validate đúng JSON Schema §6.1; declined (card 4000...0002 → webhook failed) → FAILED + reservation RELEASED + coupon released; TTL → CANCELLED + released; late webhook → refund called; concurrent coupon limit (2 thread, limit 1 → đúng 1 thắng); idempotency replay; **invoice: 2 đơn liên tiếp → số HĐ tăng dần, cùng đơn tải 2 lần → cùng số HĐ, PDF có đủ trường + VAT breakdown**.
10. Compose append block + Makefile target `ordering-service`; gateway append route block.

## Touch map (files SF-9 tạo/sở hữu)

```
services/invoice-service/** (🐍 Python — FastAPI + ReportLab + pytest + Dockerfile)
backend/services/ordering-service/** (gồm InvoiceProvider SPI + HttpInvoiceProvider + invoice_sequences)
frontend/apps/mfe-account/pages/orders/** (+ manifest entry /account/orders)
docker-compose.yml (append) · Makefile (append) · backend/gateway/routes/ordering.yml (append — KHÔNG route invoice-service)
```
READ-ONLY: `contracts/**`, payment/inventory/catalog services (gọi REST — KHÔNG sửa code), mfe-checkout (wiring là SF-10), `pages/*` khác của mfe-account.

## Dep states

- SF-5 merged: payment REST (`/intents`, `/refunds`, `/void`, webhook) + inventory (`/reservations` all-or-nothing) LIVE — saga IT chạy thật với 2 service này.
- SF-3 merged (JWT user identity), SF-4 merged (re-price catalog REST; WireMock cho IT).
- SF-6 (checkout UI) CÙNG T3 — KHÔNG phụ thuộc (wiring SF-10). Notification KHÔNG có (SF-10) — events chỉ publish, không ai consume là bình thường.

## ACCEPTANCE (user-visible / API level)

- `POST /orders` happy → PENDING; simulate webhook succeeded → PAID → CONFIRMED; `order.confirmed` payload validate đúng schema fat.
- Card declined → order FAILED VÀ reservation được RELEASE (kiểm availability API hồi phục) VÀ coupon used_count không tăng vĩnh viễn.
- TTL hết (IT config ngắn) → CANCELLED + released.
- Late `payment.succeeded` sau terminal → refund được gọi (kiểm payment API/log).
- Coupon limit 1, 2 concurrent orders → đúng 1 giữ coupon.
- `GET /me/orders` + detail + cancel hoạt động; UI my-orders hiển thị đơn thật; đơn CONFIRMED có nút **Tải hóa đơn PDF** → mở được file PDF đúng đơn.
- **D18**: invoice-service standalone chạy được (`pytest` xanh; `curl POST /generate` → PDF); số HĐ tuần tự tăng dần giữa các đơn; tải lại cùng đơn → cùng số HĐ; VAT breakdown đúng công thức; admin tải được hóa đơn qua endpoint admin; **dừng invoice-service → endpoint trả 503 rõ ràng, không crash ordering**.
- Admin stats endpoints trả aggregate đúng với dữ liệu test.

## Boundary (KHÔNG làm)

- KHÔNG wire mfe-checkout (SF-10). KHÔNG notification-service (SF-10). KHÔNG E2E browser (SF-10).
- KHÔNG sửa payment/inventory/catalog code — gọi REST; phát hiện gap (vd refund endpoint thiếu shape) → flag coordinator theo protocol, KHÔNG tự sửa contracts.
- KHÔNG đụng `pages/*` khác của mfe-account.
