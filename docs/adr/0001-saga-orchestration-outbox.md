# ADR 0001 — Saga orchestration trong ordering-service + transactional outbox

Date: 2026-09-07 · Status: Accepted (SF-10 finalize) · Deciders: epic FI-310

## Context
Checkout chạm 4 service (catalog re-price, inventory reserve, payment intent,
order state) — cần atomicity về mặt nghiệp vụ qua HTTP + message, không có
XA/2PC. Latency người dùng phải thấp (đặt hàng sync trả clientSecret).

## Decision
1. **Orchestration tập trung trong ordering-service** (`CheckoutSaga`): 
   `POST /orders` chạy sync: re-price (catalog) → reserve coupon (nguyên tử
   `UPDATE ... WHERE used_count < usage_limit`) → reserve inventory
   (all-or-nothing, TTL 30') → Stripe PaymentIntent → trả
   `CreateOrderResponse{order, clientSecret}`. Sau khi trả, trạng thái tiếp
   theo (PAID/CONFIRMED/FAILED) đi qua events.
2. **Transactional outbox** (common-lib): mọi event domain được ghi cùng
   transaction với bảng business (`outbox`), `OutboxRelay` poll 2s publish lên
   topic exchange `ecommerce.events` (routing key = eventType), at-least-once,
   `processed_messages` + `IdempotentConsumer` cho consumer idempotent.
3. **Compensation edges** (§3.3): payment fail → release inventory + coupon →
   order FAILED; TTL 30' không trả → cancel + release; cancel muộn sau PAID →
   refund qua Stripe adapter.

## Consequences
- Không cần distributed transaction; mỗi service giữ invariant riêng.
- At-least-once → mọi consumer PHẢI idempotent (eventId dedupe).
- Relay delay ≤ ~2s chấp nhận được cho demo/trạng thái đơn.
- Contracts freeze: `order.confirmed` là fat payload — consumer không call-back.

## Alternatives rejected
- **Choreography thuần** — khó trace + harder compensation cho 1 flow quan
  trọng nhất; orchestration đểSaga log tập trung tại saga_state.
- **Sync-only (không events)** — notification/affiliate/log sẽ phải call-back
  HTTP, coupling chặt, mất audit trail.
- **Seata/2PC** — overkill, lock dài, không phù hợp Stripe ngoài hệ thống.
