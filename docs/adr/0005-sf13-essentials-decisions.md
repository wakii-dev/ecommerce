# ADR 0005 — SF-13 Essentials & Polish: quyết định thiết kế (D21)

Trạng thái: Accepted (SF-13 FI-323) · Ngày: 2026-09-07 · Context pack: `docs/superpowers/contexts/sf-13.md`

SF-13 là batch cuối chạm identity/ordering. ADR này ghi các quyết định đi ngoài
freeze hoặc cần đọc rõ ràng cho người sau. Contracts (`contracts/**`,
`packages/contracts/**`) KHÔNG bị sửa — mọi lệch đã flag FI-310 (3 comments).

## 1. Email flow = event-driven, KHÔNG REST nội bộ

Reset/welcome/abandoned email đi qua topic exchange `ecommerce.events` (outbox
identity, publish trực tiếp cart — mục 4). Lý do: notification sinh ra là
event-driven (queue + IdempotentConsumer + SendLog audit miễn phí); REST sync
tạo coupling + phải thêm endpoint off-freeze bên notification.

**3 event mới NGOÀI 13 events freeze** (envelope format + transport giữ nguyên
common-lib; log-service bind `#` tự audit):

| Event | Producer | Payload | Consumer |
|---|---|---|---|
| `user.password_reset_requested` | identity (outbox) | `{email, token, expiresAt}` | notification.password_reset |
| `user.newsletter_subscribed` | identity (outbox) | `{email, subscribedAt}` | notification.newsletter |
| `cart.abandoned` | cart (trực tiếp) | `{userId, email, itemCount, updatedAt}` | notification.carts |

**Raw reset token trên RabbitMQ payload**: chấp nhận cho demo — token single-use
30', Mailpit là dev sink; prod hardening (nếu có) sẽ gửi link trực tiếp hoặc
mã hóa payload. (Spec-critic + review G1 note.)

## 2. COD — đọc contract "COD→PAID lúc giao"

Tổng hợp 3 nguồn frozen: `order.paid.schema.json` ("COD không phát event này"
— lúc CHECKOUT), `ordering.yaml` Order.paymentMethod ("CONFIRMED sau reserve,
PAID khi giao"), transition table ("SHIPPED→DELIVERED ... COD→PAID").

- Checkout COD: bỏ bước Stripe intent; sau reserve → **CONFIRMED luôn** (path
  mới DUY NHẤT `PENDING→CONFIRMED` trong state machine — pack chỉ định).
  KHÔNG phát `order.paid` lúc checkout (schema cấm).
- Lúc admin DELIVERED: capture tiền mặt qua payment `POST /payment/cod/captures`
  (idempotent, intent id quy ước `cod:<orderId>`) → outbox `order.paid` →
  inventory commit lúc giao. Trạng thái đơn kết thúc vẫn DELIVERED — "PAID" là
  nghĩa vụ thanh toán, KHÔNG phải transition (BẬT: RMA SF-14 khoá theo DELIVERED).
- **CodPaymentAdapter KHÔNG đăng ký bean** `PaymentProviderAdapter` (review G1
  P0: payment inject 1 adapter duy nhất) — class thuần, COD không đi qua
  createIntent.
- Capture TRƯỚC transition deliver → fail được retry (review spec-critic P1).
- `cancelByAdmin` COD: không refund (chưa thu tiền; guard `stripeIntentId == null`
  có sẵn trong lifecycle đã xử lý — test chứng minh).

**Hạn chế đã biết (chấp nhận demo-scale):** reservation TTL 30' vẫn chạy trong
window CONFIRMED→DELIVERED → COD hoàn tất giao sau 30' sẽ thấy stock đã
release (inventory consumer no-op với đơn CONFIRMED). Sửa đúng = inventory
cần trigger mới — inventory ngoài scope SF-13 (shared-file ownership).

## 3. Runtime endpoints NGOÀI freeze (precedent audit-log exception ADR 0004)

| Endpoint | Lý do |
|---|---|
| `GET /api/catalog/products/{slug}/related` | MLT cần riêng; search endpoint yêu cầu `q` |
| `POST /api/identity/newsletter` + `GET /api/identity/admin/newsletter` | không có trong identity.yaml |
| `POST /api/payment/cod/captures` | payment.yaml không có capture (COD nội bộ — gateway admin-prefix chặn outside) |
| `GET /api/ordering/admin/orders/export.csv`, `GET /api/catalog/admin/products/export.csv` | CSV stream |

Đều additive, không đụng file freeze. Freeze lại ở D22 nếu cần TS client.

## 4. Cart publish trực tiếp RabbitTemplate (không outbox)

Cart KHÔNG có DB (D8) → không outbox. `AbandonedCartSweeper` publish raw
Message (mimic `OutboxRelay.toAmqpMessage`: JSON envelope + headers
eventType/correlationId). Flag Redis `cart:abandoned_notified:<sub>` SET NX EX
24h **trước** publish = at-most-once (mất 1 mail khi crash — email không
critical). Topic exchange nhận publish không cần consumer sống (silent drop
khi notification down — chấp nhận, at-most-once).

Email giỏ user lấy từ JWT claim lúc mutation (kể cả `/cart/merge`); giỏ cũ
thiếu email → bỏ qua đến lần ghi sau (CartDocument additive JSON).

## 5. Audit log viewer — log-service thêm web layer

`GET /api/log/admin/events` (page/50, filter eventType/from/to ISO) đọc Mongo
`event_log` (compound index `idx_type_occurred` SF-10 có sẵn). 2 lớp RBAC:
gateway admin-prefix `/api/log/admin/**` + SecurityConfig service (copy catalog
pattern). Route `/api/log/**` KHÔNG StripPrefix (controller giữ full path).

## 6. Khác

- **Password reset**: forgot LUÔN 202 (anti-enumeration, body giống hệt);
  token SHA-256 hex single-use 30'; reset OK → revoke MỌI refresh token.
  Single-use check là read-filter (không conditional UPDATE) — race 2 reset
  đồng thời cùng token: cả 2 thắng (low impact — cả hai biết token; prod nên
  conditional UPDATE).
- **Upload**: validate ext + content-type (không magic-byte sniff — admin-only,
  residual được chấp nhận); 5MB business limit / 6MB servlet limit (vượt 6MB →
  ProblemDetail 400 qua advice); object key `<uuid>.<ext>` trong bucket
  `products` (URL `/media/products/<uuid.ext>` — prefix do bucket cung cấp).
- **Newsletter dup**: 200 `{status:"already"}` — FE hiện thông báo riêng;
  race đồng thời → 409 (unique email), FE map về thông báo already.

## 7. Flyway numbering va chạm liên SF + ignore-missing

Volume PG CHUNG giữa các worktree T6: SF-15 đã apply `V11__oauth_twofa` vào
db_identity trước SF-13. SF-13 renumber migration mình → **V13
(password_reset_tokens) / V14 (newsletter_subscriptions)** (V12 chừa cho SF-15
tiếp). Jar sau rename phải `mvn clean package` (target/classes giữ file cũ →
checksum mismatch giả). Kèm `spring.flyway.ignore-migration-patterns: "*:missing"`
trong identity application.yml — bỏ qua applied migration không có trên
classpath mình. **Đánh đổi (review final F2)**: config global+vĩnh viễn làm
mất khả năng phát hiện schema-drift do xoá migration — giới hạn lại theo
profile hoặc bỏ sau khi SF-15 merge vào story branch.

## 8. Scope freeze

Batch A (D21) đóng. SF-13 KHÔNG nhận scope mới; batch B (RMA/GHN/loyalty/
social/2FA/stock-alert/PWA/dark/chat) thuộc SF-14/15. Sau SF-13, identity/
ordering chỉ còn bugfix.
