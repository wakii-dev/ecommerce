# SF-5 docker full regression isolated +400 (FI-402)

> Stack: compose project `fi397sf5` — base `docker-compose.yml` + `docker-compose.override-sf2.yml` (SF-2, +400 ports) + 2 QA override (`scripts/qa/docker-override-sf5-{keys,net}.yml` — findings #1/#3, compose repo KHÔNG đụng) · Chạy: 2026-09-09 · Evidence: `.run/sf5-docker-build{,2}.log`, `.run/sf5-rigb-health.txt`.

## Verdict tổng

**NGUYÊN TRẠNG FAIL → với 2 QA override + stagger boot = PASS (và 3 findings fix-task đã lên epic FI-397).** Regression phát hiện đúng những rot mà convergence gate tồn tại để bắt.

## 1. Build + boot

- Build lần 1 FAIL: download `net.bytebuddy` từ Maven Central đứt giữa chừng (network flake — `Premature end of Content-Length`); **không phải code**. Retry PASS toàn bộ images (10 JVM + 2 FE + infra).
- Boot nguyên trạng: **5/10 JVM crash-loop** — findings #1 (keys mount), #2 (PG 53300).
- Boot với override + stagger 2 đợt: **23/23 container Up** (snapshot `.run/sf5-rigb-health.txt` — 26' uptime, healthy các infra).

## 2. Findings (chi tiết + fix đã comment epic FI-397 — batch comment 09-09)

| # | Mức | Hiện tượng | Root cause | QA workaround | Fix thật (owner compose) |
|---|---|---|---|---|---|
| 1 | P1 | cart/catalog/inventory/log crash-loop JwtDecoder | `JWT_PUBLIC_KEY_PATH=../infra/keys/...` path dev-host; không volume mount (identity có mount nên sống) | `docker-override-sf5-keys.yml`: mount `/keys` + env đúng | mount `./infra/keys:/keys:ro` cho 4 service |
| 2 | P1 | 53300 too many clients, 5 JVM chết lúc cold boot | 10 JVM × Hikari (10 conn) + flyway > max_connections=100 | stagger boot 2 đợt | `-c max_connections=300` + depends_on hợp lý |
| 3 | **P0** | container DNS `postgres` round-robin giữa stack chính & isolated | base compose fix `name: ecommerce-net` dùng CHUNG mọi project; override-sf2 đổi port+container_name nhưng KHÔNG alias DNS | `docker-override-sf5-net.yml`: network riêng `fi397sf5-net` cho toàn services | bỏ `name:` cứng (compose tự prefix per-project) hoặc docs bắt buộc override network khi isolate |
| 11 | P1 | ordering re-price **502 "Catalog ... 401"** sau 15' uptime; CATALOG_API_TOKEN trống trong container | compose truyền `${CATALOG_API_TOKEN:-}` từ host .env (rỗng) — dev-stack mint+re-mint loop chỉ phủ HOST JVM, container mode KHÔNG có cơ chế mint | `docker-override-sf5-identity-ttl.yml` (TTL 3600) + `remint-catalog-token.sh` (mint admin JWT từ identity isolate → recreate ordering) | compose cần entrypoint/init container mint token, hoặc catalog chấp nhận service-auth nội bộ (m2m token) |
| 12 | P1 | identity **login 500** trong container mode | identity-service block KHÔNG set `RABBITMQ_HOST` → yml fallback `localhost` → trỏ chính container (dev-host mode không lộ vì localhost = host rabbit) | thêm `RABBITMQ_HOST=rabbitmq` vào override #4 | thêm `RABBITMQ_HOST: rabbitmq` vào identity-service environment trong compose |
| 13 | P2 | ES bị OOM-kill (exit 137) lặp lại khi 2 full stack chạy song song | Docker VM memory giới hạn + 2×(ES+10 JVM+infra) | restart ES trước e2e; stop mongo-express | không phải compose — note tài nguyên; single-stack chạy OK |

## 3. Prod-mode regression qua entry :8480

| Check | Kết quả |
|---|---|
| Gateway health | 200 UP |
| Route matrix (10 route — storefront/shell/admin/login/api/remotes/static) | 10/10 đúng bảng routes (chi tiết `gateway-regression.md` §2) |
| Đăng nhập thật (admin seeded) | accessToken trả về (RS256 JWKS isolated OK) |
| Coupons seed (WELCOME10/GIAM50K) | INSERT OK, active |
| Catalog data | boot-seed tự chạy (products có sẵn) |
| Golden-flow COD qua :8480 | → chạy cùng sync-matrix spec + e2e subset (mục 4) |
| Sync-matrix spec trên :8480 | → xem `sync-matrix.md` (cột prod) |

## 4. Golden-path spec subset trên :8480 (prod-mode same-origin proof)

Chạy cod golden-path subset với `E2E_STOREFRONT_URL=E2E_SHELL_URL=http://localhost:8480 MAILPIT_API=http://localhost:8425 GATEWAY_URL=http://localhost:8480` — kết quả ghi bổ sung sau vòng chạy (đồng bộ executor T1): __PENDING__

### 4b. Webhook Stripe path (điều kiện golden-path PAID trên rig isolate)

Compose full-profile KHÔNG bật stripe-cli (profile riêng) → webhook không có đường vào payment container. Setup runtime (ops, không đụng compose):

```
docker run -d --name fi397sf5-stripe-cli --network fi397sf5-net \
  -e STRIPE_API_KEY=$STRIPE_SECRET_KEY stripe/stripe-cli listen \
  --forward-to fi397sf2-payment-service:8086/payment/webhook
```

- whsec của cli isolate = **whsec_f26132e7… ≡ .env** (Stripe CLI tái dùng webhook endpoint theo API key) → payment container (env từ .env) verify signature OK, KHÔNG cần override env.
- **Smoke PASS**: `stripe trigger payment_intent.succeeded` → cli log `[200] POST …/payment/webhook` ×4 events; payment log ack no-op đúng (synthetic intent không có order local — "không 500, Stripe retry vô ích").

## 5. Teardown

`docker compose -p fi397sf5 down -v` — SAU KHI Task 6 hoàn tất (plan-critic P1#3: teardown ở cuối T6).
