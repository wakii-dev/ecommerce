# SF-14 Commerce Extensions — Implementation Plan (FI-324)

Spec: `docs/superpowers/specs/2026-09-07-sf-14-commerce-extensions-design.md` (quyết định D1-D11)
Pack: `docs/superpowers/contexts/sf-14.md` · Nhánh: `wakii-dev/sf-14-commerce-extensions` → merge về `story/fi310-ecommerce-platform`

## 0. Root cause
Batch B1 (D22) — 3 năng lực RMA/GHN/loyalty chưa tồn tại; contracts đã freeze paths từ SF-2 (RMA + tracking + shipping + redeem đều có sẵn trong ordering.yaml/affiliate.yaml). Cắm code vào seams đã chuẩn bị (guard usePoints CheckoutSaga:112, tracking endpoint shape, PaymentClient.refund).

## 1. Problem → 2. Scope → 3. Touch map → 4. Design
Xem spec (tránh lặp — spec là phần design của plan).

## 5. Tasks (14 — DAG dưới)

### T1 rma-schema-flyway-ordering
`ordering-service`: `V12__rma.sql` (bảng `rma_requests`: id UUID PK, order_id, user_id, status CHECK 5 giá trị, reason, items jsonb, refund_amount nullable, created_at, updated_at + INDEX(order_id), INDEX(user_id), INDEX(status)) + cột `points_discount BIGINT NOT NULL DEFAULT 0` trên orders + entity `Rma`/`RmaStatus`/`RmaLine` (jsonb @JdbcTypeCode pattern Order.timeline) + `RmaRepository` (findByOrderId, existsByOrderIdAndStatus, page by user/status).
**Xong khi:** mvn -pl ordering test xanh (context boot + validate schema), commit.

### T2 rma-apis-customer-create-list
`RmaService` (create: đơn thuộc user, status DELIVERED, window `RMA_WINDOW_DAYS=7` từ timeline DELIVERED cuối → 409 quá hạn, lineId/qty hợp lệ order items, duplicate mở không chặn nhưng refund chặn ở T3) + `RmaController` POST/GET `/me/rma` (202 REQUESTED / page) + exception mapping (RmaWindowException→409, RmaStateException→409, validation→400) + outbox `rma.requested` payload FAT (email từ Order).
**Xong khi:** IT `RmaLifecycleTest` phần create/list + guards xanh.

### T3 rma-admin-approve-reject-refund (gộp rma-stripe-refund-integration)
`AdminRmaController` (`GET /admin/rma?status=`, 4 action POST) + `RmaAdminService` guards REQUESTED→APPROVED/REJECTED, APPROVED→RECEIVED, RECEIVED→REFUNDED (sai → 409) + refund: stripe đơn → `PaymentClient.refund(intent, "rma_refund", key "rma-refund:<rmaId>")` 409 = đã hoàn; COD/KHÔNG intent → offline REFUNDED; guard double-refund (D2) + events 4 bước (D6).
**Xong khi:** IT lifecycle trọn vẹn + refund assert trên Stripe WireMock (AbstractSagaTest STRIPE double) + 409 guards.

### T4 ghn-client-shipping-methods
`GhnClient` (RestClient, env GHN_API_URL/GHN_TOKEN/GHN_SHOP_ID, disabled khi token rỗng — pattern PaymentAdapterConfig) + `ShippingMethodsService` (GHN available-services + fee (weight=500g/item) → `ShippingMethod[id=ghn:<svcId>]`; fallback flat `ShippingMethods.ALL`) + `ShippingController` nhận optional `province`/`district`.
**Xong khi:** IT WireMock GHN trả methods/fee; không token → flat.

### T5 ghn-fee-calc-order-integration
CheckoutSaga: fee = `ShippingMethodsService.resolve(shippingMethod, address, totalQty)` thay `ShippingMethods.byId(...).fee()`; method `ghn:` validate qua service (fallback disabled → 400 InvalidShippingMethod); lưu shippingFee đơn.
**Xong khi:** IT tạo đơn với method ghn: → shipping_fee = fee WireMock; flat giữ nguyên.

### T6 ghn-tracking-order-integration
AdminOrderController.ship → nếu method `ghn:` + GHN enabled → `GhnClient.createOrder` (địa chỉ + weight + serviceId) → trackingCode = order_code (lỗi → fallback TRK- + warn); `GET /me/orders/{id}/tracking` (TrackingController hoặcOrderController): `ghn:` → GHN detail map status/events; else flat response từ order.status.
**Xong khi:** IT ship → tracking WireMock; tracking endpoint trả đúng TrackingResponse.

### T7 loyalty-schema-accounts-affiliate-svc
`affiliate-service` slice `loyalty/`: `V11__loyalty.sql` (`loyalty_accounts` user_id UUID UNIQUE, balance BIGINT ≥0 CHECK, total_earned; `loyalty_ledger` id, user_id, order_id VARCHAR(64) nullable, type EARN/REDEEM/ADJUST, points BIGINT, created_at + UNIQUE(order_id, type) partial WHERE order_id NOT NULL + INDEX(user_id)) + domain `LoyaltyAccount`/`LoyaltyLedgerEntry`/`LoyaltyLedgerType` + repos (atomic redeem/reverse queries).
**Xong khi:** context boot + flyway validate xanh.

### T8 loyalty-earn-consumer-orderconfirmed (+ additive endpoints)
`LoyaltyService` (earn: points = floor(total × rate/100/100) idempotent UNIQUE; reversal theo order: +REDEEM hoàn, −EARN thu hồi — cả hai chỉ khi chưa reverse) + `LoyaltyOrderConsumer` (queue `affiliate.loyalty` ← order.confirmed/cancelled/failed; marker `loyalty:<eventId>`; config class MỚI `LoyaltyRabbitConfig` trong slice) + endpoints additive: `GET /api/affiliate/me/loyalty`, `GET /api/affiliate/admin/loyalty?userId=`, `POST /api/affiliate/admin/loyalty/adjust` (points ± reason; kết quả ≥0 else 400); env `LOYALTY_EARN_RATE`.
**Xong khi:** IT earn idempotent (redelivery không double), concurrent redeem không âm, cancel → hoàn điểm.

### T9 loyalty-burn-checkout-discount (+ internal token + gateway block)
`InternalLoyaltyController` POST `/api/affiliate/internal/loyalty/redeem` (frozen contract; X-Internal-Token check `AFFILIATE_INTERNAL_TOKEN`; atomic UPDATE balance) + affiliate SecurityConfig permitAll `/api/affiliate/internal/**` + ordering `LoyaltyClient` (base-url env AFFILIATE_BASE_URL :8092, timeout, token header) + saga: usePoints → effectivePoints (D4) → redeem sau Tx A (D5) → `pointsDiscount` lên order + DTO/mapper + `order.confirmed.discount += pointsDiscount` + 422 `PointsInvalidException` (409 từ affiliate → "Điểm không đủ") + gateway-routes.yml append block `/api/affiliate/internal/**` + .env.example append.
**Xong khi:** IT checkout dùng điểm → total giảm đúng, ledger REDEEM; hủy đơn → hoàn điểm; 409 điểm không đủ → 422.

### T10 admin-rma-loyalty-pages
mfe-admin: `pages/RmaPage.tsx` (filter status + bảng + actions theo trạng thái, testid cho walkthrough) + `pages/LoyaltyPage.tsx` (tra cứu userId → account+ledger, form adjust) + `guard.ts` append nav/routes (comment SF-14 append) + `AdminApp.tsx` renderPage + i18n vi/en keys additive.
**Xong khi:** pnpm build + vitest (guard) xanh; page render (browser verify bước sau).

### T11 mfe-account-slices
OrderDetailPage: tracking block (SHIPPED/DELIVERED + trackingCode → GET tracking, carrier/status/events) + section RMA (đơn DELIVERED: nút tạo yêu cầu → modal chọn items/qty + reason → POST /me/rma; list RMA của đơn + status) + `ordersApi` mở rộng; Account/affiliate slice: section điểm (GET /me/loyalty → balance + totalEarned) — file-slice `pages/affiliate/*` append (pack).
**Xong khi:** build + browser verify (bước sau).

### T12 mfe-checkout-slices
Step 2: fetch `/shipping/methods?province&district` (từ address) → radio methods + fee động; Step 3: input dùng điểm (balance từ /api/affiliate/me/loyalty qua RouteDef cục bộ — contracts READ-ONLY) + summary `pointsDiscount`; `orderingApi.createOrder` thêm `usePoints` + shippingMethod chọn; confirmation không đổi.
**Xong khi:** build + vitest mở rộng (orderingApi.test) xanh.

### T13 rma-refund-emails-notification
notification-service slice: `RabbitMqConfig` append queue `notification.rma` + 4 bindings (rma.approved/rejected/received/refunded) + `RmaMailer` (4 template HTML pattern ThankYouMailer) + `RmaNotificationConsumer` (marker + send_log, payload FAT có email).
**Xong khi:** IT publish rma.* → send_log SENT + template đúng (harness notification).

### T14 commerce-ext-it-tests (consolidated)
Chạy full `mvn -pl <4 services> test` + `pnpm -r test` + kiểm §5.16 asserts + e2e smoke thủ công qua browser (Rule 0) — tổng hợp verdict `/tmp/story/sf-14-verify.md`.
**Xong khi:** mọi suite xanh + verdict file có bằng chứng từng dòng ACCEPTANCE.

## 6. Risks
- CheckoutSaga hunk usePoints kề hunk COD (SF-13 chạy song song) → conflict khi merge 2 nhánh: coordinator lo; giữ hunk tối tiểu.
- Gateway-routes.yml ngoài touch map chính thức — append-only block, ghi rõ merge comment.
- GHN thật không test offline — WireMock shape v2; degraded path là đường demo chính.
- WireMock/testcontainers IT cần Docker (đã có ở máy; IT disabledWithoutDocker).

## DAG (orca orchestration)
T1→T2→T3; T4→T5; T4→T6; T7→T8→T9; T2,T3→T10; T2,T6,T8→T11; T4,T8,T9→T12; T2,T3→T13; tất cả→T14.
Chạy tuần tự inline (1 executor — file-set giao thoa ordering-service giữa T2/T3/T5/T6/T9) — DAG ghi làm external memory + tiến độ, không chạy song song worker để tránh commit-race (memory: shared-worktree parallel executors).
