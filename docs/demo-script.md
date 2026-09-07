# Demo script 5 phút — Ecommerce Platform v1 (FI-310 · P5)

> Quickstart đầy đủ ở README.md. Trước demo: `make dev` + `make seed`, chờ
> "✓ dev stack sống". Kiểm `docker compose ps` all healthy.

## 0. Quickstart (trước buổi demo)

```bash
cp .env.example .env        # điền Stripe test keys nếu có (sk_test_… / pk_test_… / whsec_…)
make dev                    # 1 lệnh: infra + 10 JVM + invoice + 5 FE app
make seed                   # admin@demo.vn / user@demo.vn / WELCOME10 / 2 đơn CONFIRMED / 1 review
# (tuỳ chọn, nếu có Stripe keys) docker compose --profile stripe up -d stripe-cli
```

URLs: storefront **http://localhost:3000** · shell (cart/checkout/account/admin)
**http://localhost:5173** · gateway :8080 · Mailpit UI :8025 · RabbitMQ UI :15672 ·
mongo-express (event_log) :8089.

Accounts: admin `admin@demo.vn` / `admin123` (ADMIN_EMAIL/PASSWORD) · user
`user@demo.vn` / `Demo#2026` · thẻ test: `4242 4242 4242 4242` (thành công),
`4000 0000 0000 0002` (declined) — cần Stripe keys + stripe-cli.

## 1. Duyệt catalog (30s)
Mở :3000 → home (hero + flash deal countdown + featured) → search "Tai nghe"
→ PLP filter/sort → PDP: view-source (⌘U) thấy **tên + giá + JSON-LD Product**
(SSR thật) → đổi ngôn ngữ EN (header) → nội dung tiếng Anh + hreflang.

## 2. Mua hàng end-to-end (90s)
PDP "Tai nghe" → **THÊM VÀO GIỎ** (toast + cart badge) → **MUA NGAY** →
shell /cart → đăng nhập `user@demo.vn` (giỏ merge-on-login nếu guest) →
/checkout → địa chỉ → vận chuyển → mã **WELCOME10** (−10%, còn limit) →
**Kiểm tra & tạo đơn** → Stripe 4242 → confirmation **poll → CONFIRMED**.
Trong lúc đó chỉ ra (nếu clone màn hình): Mailpit :8025 có **email cảm ơn
kèm PDF hóa đơn** (đơn CONFIRMED → notification-service → ordering admin
invoice endpoint). Mở **mongo-express :8089 → db_log → event_log**: mỗi action
(client tạo đơn, product.changed, order.*) = 1 document.

## 3. Admin vận hành (60s)
:5173/admin đăng nhập `admin@demo.vn` → **Dashboard** (KPI + revenue chart +
top products + low-stock) → **Orders** (đơn vừa mua CONFIRMED) → mở đơn →
**tải hóa đơn PDF** (byte[] thật, số HĐ tăng dần) → ship đơn → **Reviews**
duyệt review → **Products** tạo product PUBLISHED → mở :3000 tìm tên mới →
thấy ngay (cache invalidate + ES reindex).

## 4. Saga compensation (45s)
Lặp bước 2 nhưng thẻ **4000 0000 0000 0002** → confirm fail → đơn **FAILED**
(my-orders thấy) → availability API hồi phục + coupon dùng lại được
(`GET /api/inventory/availability` + validate-coupon) — thất bại payment
KHÔNG mất hàng, KHÔNG cháy coupon.

## 5. Hệ sinh thái mở (45s)
- **Partner API**: `curl -H "X-API-Key: pk_0123456789abcdef0123456789abcdef" localhost:8080/open-api/v1/products`
  → 200; key sai → 401; docs portal :8080/open-api/v1/docs.
- **Affiliate**: user@demo.vn → /account/affiliate đăng ký (hoặc đã approve
  sau seed) → share link `?ref=CODE` → khách click (cookie aff_ref 30 ngày)
  → mua qua link → dashboard affiliate hiện conversion + hoa hồng.
- **RBAC**: `curl localhost:8080/api/ordering/admin/orders` → 401; token
  customer → 403 (server-side).

## Khắc phục nhanh
- `make dev` báo port bận → `make dev-stop` rồi chạy lại (kill theo PID).
- Email không đến → check notification `:8087/actuator/health`, Mailpit :8025,
  service-account đã ADMIN chưa (`make seed` gán).
- Stripe skip (không keys) → E2E tự chạy mode `unconfigured`; các assert
  CONFIRMED/email đánh dấu `[PENDING-STRIPE-KEYS]`.
