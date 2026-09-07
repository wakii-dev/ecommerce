# SF-14 Commerce Extensions — Design Spec (FI-324)

> Story: FI-310 · Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` (§5.16, D22)
> Spec slice: `docs/superpowers/contexts/sf-14.md` (pack = nguồn sự thật scope)
> Status: Approved (story-workflow — pack freeze tại SF-2; brainstorm epic-level đã chốt D22, câu hỏi mở per-SF tự trả ở §Decisions dưới, có verify code)

## 1. Problem

Đơn hàng hiện chỉ có vòng đời cơ bản (§3.6) + flat-fee shipping. Cần 3 năng lực thương mại chuẩn: khách trả/đổi hàng được (RMA), phí ship theo địa chỉ thật (GHN), và chương trình điểm (loyalty) để tăng quay lại mua. Batch B1 (D22) — scope ĐÓNG, chỉ làm đúng pack.

## 2. Scope

### In
1. **RMA** trong ordering-service: Flyway `rma_requests`; customer APIs `POST/GET /api/ordering/me/rma`; admin `GET /api/ordering/admin/rma?status=` + `POST /{id}/approve|reject|mark-received|refund` (paths FROZEN ordering.yaml); refund gọi payment-service `POST /api/payment/refunds` (có sẵn); outbox events `rma.requested/approved/rejected/received/refunded`; email 4 templates (approved/received/refunded/rejected) qua notification file-slice.
2. **GHN shipping** trong ordering-service: `GhnClient` (env `GHN_API_URL`, `GHN_TOKEN`, `GHN_SHOP_ID`); `GET /api/ordering/shipping/methods?province=&district=` (params optional — additive, shape frozen) trả methods GHN (services + fee theo weight/address) hoặc flat-fee fallback khi không token; POST /orders tính fee theo method chọn; admin ship → tạo vận đơn GHN (`tracking_code`); `GET /api/ordering/me/orders/{id}/tracking` (frozen) — GHN detail hoặc fallback.
3. **Loyalty** trong affiliate-service (file-slice `loyalty/`): Flyway `loyalty_accounts` (user_id UNIQUE, balance, total_earned) + `loyalty_ledger` (type EARN/REDEEM/ADJUST); EARN consume `order.confirmed` idempotent; REDEEM qua `POST /api/affiliate/internal/loyalty/redeem` (FROZEN) — ordering gọi khi `usePoints > 0`; reversal khi `order.cancelled/failed` (consumer); additive endpoints: `GET /api/affiliate/me/loyalty`, `GET /api/affiliate/admin/loyalty?userId=`, `POST /api/affiliate/admin/loyalty/adjust` (precedent additive SF-12).
4. **MFE**: mfe-admin `pages/rma` (queue + actions) + `pages/loyalty` (tra cứu + adjust) + nav additive; mfe-account OrderDetail (tracking block + tạo/list RMA) + section điểm trong affiliate slice; mfe-checkout (chọn shipping method + dùng điểm).
5. **IT**: RMA guards (409 sai trạng thái, window 7 ngày), refund Stripe (WireMock double), GHN WireMock fee/methods, loyalty earn idempotent + redeem concurrent + hoàn điểm cancel, email triggers.

### Out (boundary pack)
Carrier khác GHN · payout loyalty thật · partial-refund theo items RMA · sửa contracts/** hay packages/contracts.

## 3. Decisions (brainstorm self-answers — đã verify code)

| # | Câu hỏi | Quyết định | Lý do / verify |
|---|---------|-----------|----------------|
| D1 | Refund RMA cho đơn COD (không có Stripe intent)? | Mark REFUNDED offline (không gọi payment), log rõ | Flow admin không kẹt ở bước refund; Stripe chỉ với đơn stripe. Ghi log + response như thường |
| D2 | 2 RMA cùng 1 đơn → double refund? | Chặn: refund chỉ khi KHÔNG có RMA REFUNDED khác cùng orderId → 409 | `payment.refund` full total; deterministic key `rma-refund:<rmaId>` không cứu case 2 RMA khác id |
| D3 | Điểm quy đổi thế nào? | `points = floor(total × rate% / 100 / 100)` (1 điểm = 100đ; rate=1 → total/10000 đúng pack); REDEEM discount = points × 100đ; constant `POINT_VND = 100` cả 2 service (documented) | Pack: "points = total/10000 (1%)" ↔ "1% tiền lại" chỉ khớp khi 1 điểm = 100đ |
| D4 | usePoints vượt số tiền được giảm? | `effectivePoints = min(usePoints, floor(remaining/100))` với remaining = subtotal − couponDiscount; gửi effectivePoints đi redeem (không đốt điểm thừa) | tránh total âm + mất điểm vô nghĩa |
| D5 | Redeem fail giữa saga? | REST redeem SAU Tx A (cần orderId cho dedupe), trước inventory; fail → `failOrder` → `order.failed` → loyalty consumer hoàn điểm | pattern coupon reserve; consumer reversal có sẵn đường event |
| D6 | Event RMA tới notification thế nào? | Outbox `rma.*` payload FAT (rmaId, orderId, userId, email từ Order, status, lines, reason, refundAmount) → queue `notification.rma`; KHÔNG email cho `requested` (khách tự tạo) | pack: "rma listener" + fat-payload rule; 4 templates đúng pack |
| D7 | Loyalty consumer queue? | Queue MỚI `affiliate.loyalty` ← order.confirmed/cancelled/failed; marker prefix `loyalty:<eventId>`; config class MỚI trong slice `loyalty/` (không sửa RabbitMqConfig SF-12) | memory IdempotentConsumer per-group; file-slice |
| D8 | Internal redeem lộ công khai? | Gateway block route `/api/affiliate/internal/**` (append-only) + header `X-Internal-Token` khớp `AFFILIATE_INTERNAL_TOKEN` | contract "không route qua gateway"; userId client-supplied = rút điểm người khác nếu lộ |
| D9 | GHN method id? | `ghn:<serviceId>`; flat giữ `standard`/`express`. Ship: id có prefix `ghn:` → tạo vận đơn GHN (fail → fallback TRK- + warn, không chết flow); tracking: prefix `ghn:` → GHN detail, else flat | mở rộng không vỡ hợp đồng cũ |
| D10 | Window RMA tính từ đâu? | Entry DELIVERED cuối trong timeline + `RMA_WINDOW_DAYS=7`; sai/đơn chưa DELIVERED/không chủ đơn → 400/409/404 đúng contract | ordering.yaml mô tả 409 quá hạn/wrong owner |
| D11 | points_discount trên orders? | Cột mới `points_discount BIGINT NOT NULL DEFAULT 0` (V12); `order.confirmed.discount = coupon + points` (schema ghi rõ "coupon + điểm") | contract Order.pointsDiscount có sẵn; event schema không có field riêng |

## 4. Non-functional
- Degraded mode nhất quán: GHN không token/lỗi → flat-fee + TRK-; Stripe không key → refund lỗi 502 rõ (đã có pattern UnconfiguredAdapter).
- Idempotency: earn/redeem/reversal UNIQUE(order_id,type) + marker eventId; refund key deterministic.
- Concurrent: redeem atomic UPDATE guard; ledger insert UNIQUE chống double.
- Security: admin 2 lớp giữ nguyên; internal token; không thêm public path mới.

## 5. Test strategy
- ordering: `RmaLifecycleTest` + `GhnShippingTest` + `LoyaltyCheckoutTest` (kế thừa AbstractSagaTest — stack thật + WireMock Stripe/GHN/catalog).
- affiliate: `LoyaltyTest` (earn idempotent, redeem concurrent, reversal cancel) trên AbstractIntegrationTest + Rabbit container.
- notification: `RmaEmailTest` (events → send_log + Mailpit-less SMTP assert qua GreenMail? — theo harness notification hiện có).
- FE: vitest theo pattern sẵn có (orderingApi.test.ts mở rộng shipping/points) + browser walkthrough Rule 0.
