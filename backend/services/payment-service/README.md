# payment-service (SF-5)

Stripe test-mode intents/webhook/refund/void qua `PaymentProviderAdapter` SPI. Port **8086** · DB `db_payment`.

## Chạy dev

```bash
make infra
make dev svc=payment
```

## Degraded mode (KHÔNG có key)

Thiếu `STRIPE_SECRET_KEY` → **boot OK**, health UP; `POST /payment/intents` → **503 problem+json `payment_unconfigured`**. Không crash scheduler/webhook/outbox.

## Có Stripe test key

Đặt trong `.env` (KHÔNG commit): `STRIPE_SECRET_KEY=sk_test_...` + `STRIPE_WEBHOOK_SECRET=whsec_...` rồi export trước `make dev svc=payment`.

```bash
# 1. Tạo intent (VND zero-decimal; Idempotency-Key = UUID 1 lần/intent)
curl -s -X POST localhost:8086/payment/intents -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 8f2f6fd2-...-demo' \
  -d '{"orderId":"order-demo-1","amount":250000,"currency":"VND"}'
# → 201 {paymentIntentId:"pi_...", clientSecret:"...", status:"REQUIRES_..."}
# Replay cùng key → CÙNG response; key khác payload → 409.

# 2. Webhook thật qua stripe-cli (compose block có sẵn từ SF-1):
docker compose --profile stripe up -d stripe-cli   # forward → :8086/api/payment/webhook
stripe trigger payment_intent.succeeded            # → outbox payment.succeeded
# Sig sai (curl thủ công không header / sai sig) → 400.

# 3. Refund (full khi bỏ amount) / Void (chưa capture):
curl -s -X POST localhost:8086/payment/refunds -H 'Content-Type: application/json' \
  -d '{"paymentIntentId":"pi_...","reason":"admin_cancel"}'
curl -s -X POST localhost:8086/payment/void -H 'Content-Type: application/json' \
  -d '{"paymentIntentId":"pi_..."}'
```

## SPI (D3)

`spi/PaymentProviderAdapter` — `createIntent/voidIntent/refund/verifyWebhook`. Stripe = adapter đầu tiên; VNPay/MoMo sau này = adapter mới. COD KHÔNG đi qua service này (D21 — saga bỏ bước intent).

## Events

Webhook verify sig OK → outbox `payment.succeeded|failed` (payload schema `contracts/events/`) → ordering (SF-9) consume. Refund/void KHÔNG publish event — ordering nhận sync response (SF-9 coordination note).
