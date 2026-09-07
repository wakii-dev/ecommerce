# Plan: SF-10 convergence + ship (FI-320)
Date: 2026-09-07 | Linear: FI-320 | Worktree: sf-10-convergence-ship | Base: story/fi310-ecommerce-platform
Spec: docs/superpowers/contexts/sf-10.md (pack = spec slice, questions đã đóng) · Epic spec §5.1-5.14

## 0. Root cause analysis
- **Root cause:** 9 SF trước ship theo contract-first với mock/stub tại các seam cross-service (checkout→ordering, admin orders/reviews/coupons/stats, email). Đó là lựa chọn thiết kế chủ đích (SF-6 gate "live wiring tại SF-10") — không phải nợ kỹ thuật, mà là giai đoạn cuối của chiến lược contract-first.
- **Current state:** Stack có 13 mảnh rời: checkout xác nhận đơn bằng `confirmOrderMock` (PENDING→CONFIRMED client-side), admin orders/reviews/coupons/stats đọc `adminStub.ts`, KHÔNG có notification (không email), KHÔNG có log-service (không audit trail), gateway thiếu notification route + route split shell, `make full` là stub exit 1, KHÔNG có E2E, KHÔNG có seed deterministic (WELCOME10 seed V11 thiếu limit/expiry theo pack), `.env` không tồn tại trên máy (Stripe keys → REQUIREMENT-GAP FI-310, coordinator duyệt parameterized).
- **Expected outcome:** `make dev` 1 lệnh = full stack sống; mua hàng end-to-end THẬT (Stripe → CONFIRMED → email có PDF → cart tự clear → admin thấy đơn); Mongo event_log có doc cho mọi domain event; Playwright E2E xanh; `make full` 100% containerized; README/demo/ADR đủ để GA.
- **Constraints:** `contracts/**` READ-ONLY; service SF khác chỉ seam-fix nhỏ (bug lớn → flag); không thêm feature mới; Stripe keys chưa có (E2E parameterized, assert CONFIRMED/email/review đánh dấu [PENDING-STRIPE-KEYS]).
- **High-level strategy:** wire-thay-thế (không rewrite UI): thay nội bộ seam files giữ nguyên exported interface; 2 service mới fork đúng template/affiliate pattern (compose/Makefile/gateway/db init append-only); E2E là lớp verify đen mới (không đụng app code trừ seam-fix E2E phát hiện).

## 1. Problem
Hệ thống 13 service/app chạy rời rạc với mock tại các seam quan trọng nhất (thanh toán→xác nhận, email, admin vận hành) — chưa từng chạy như MỘT hệ thống sống; không có chứng cứ tự động (E2E) rằng golden path hoạt động.

## 2. Scope
- **In:** checkout live wiring + cart consumer · notification-service (8087, Mailpit, email cảm ơn + PDF attach) · log-service (8088, Mongo event_log fan-in `#`) · gateway full route table + D16 split + static FE (profile full) · `make dev` fullstack + `make full` · deterministic seed · Playwright E2E (golden-path/admin-crud/review-flow/saga-fail/rbac + platform asserts §5.8-5.11/5.13/5.14) · standalone script · admin MFE live wiring (orders/invoice/coupons/reviews/stats — "bỏ hẳn stub" theo ghi chú SF-7) · README + demo-script + 4 ADR · perf/security sanity.
- **Out:** feature mới; refactor ngoài seam; `contracts/**`; K8s/CI; SF-13/14/15 scope (COD, MinIO, reset password...); merge main (human gate của coordinator).
- **Success criteria:** ACCEPTANCE 1-7 pack sf-10 + §5.8/5.9/5.10/5.11/5.13/5.14 spec — binary, xem mục Verify checklist (cuối plan).

## 3. Touch map
- **Sửa:** `frontend/apps/mfe-checkout/src/lib/orderingStub.ts` (+ tests) · `ConfirmationPage.tsx` (polling) · `.env.example` · `backend/services/cart-service` (pom + consumer + config) · `backend/gateway/src/main/resources/gateway-routes.yml` (env-uri + notification + shell split) · `frontend/apps/mfe-admin/src/lib/api.ts` + 5 pages mock→live · `docker-compose.yml` (append 7 block full + storefront-web + frontend-web nginx) · `Makefile` (dev fullstack, full, seed, e2e) · `frontend/apps/*/package.json` (build = vite build cho 4 vite apps) · `infra/db/init/01-create-dbs.sh` (đã đủ db_notification) · seed SQL/API script.
- **Tạo:** `backend/services/notification-service/**` · `backend/services/log-service/**` · `frontend/e2e/**` (playwright.config + 6 spec + helpers) · `scripts/seed/**` · `frontend/apps/storefront-web/Dockerfile` + `output:standalone` · `infra/frontend-nginx/**` (hoặc Dockerfile nginx inline) · `docs/demo-script.md` · `docs/adr/0001-0004` · README cập nhật.
- **Consumers/regression:** mfe-checkout UI (giữ nguyên interface exports) · shell remotes (không đổi manifest — đã đủ 4) · cart FE (clear optimistic giữ) · ordering saga (không đụng) · catalog seed runner (không đụng — seed SF-10 đi qua API/SQL).
- **Shared surfaces:** events `order.confirmed` (consume-only) · RabbitMQ queues mới `cart.orders`/`notification.orders`/`notification.reviews`/`log.events` · gateway routes (append-only + env-uri) · compose (append-only) · Makefile (append-only) · `.env.example` (append).

## 4. Design
- **Approach:** (A) wire-thay-thế nội bộ seam files + fork template cho 2 service mới — đã chọn (pack chỉ định); (B) giữ stub + feature-flag — loại (SF-10 định nghĩa là bỏ stub; `orderingStub.ts` header tự ghi "SF-10 wire live → thay FILE NÀY").
- **Key decisions:**
  - D1 checkout: `orderingStub.ts` → live impl cùng signature (`createOrder` → POST /orders + `Idempotency-Key` uuid, 201 `{order, clientSecret}`; `validateCoupon` → POST /orders/validate-coupon; bỏ `confirmOrderMock`). Sau `confirmPayment` OK → ConfirmationPage poll `GET /me/orders/{id}` 2s tới terminal state (CONFIRMED hiển thị; FAILED hiện reason; timeout 90s hiện trạng thái hiện tại + link my-orders). VITE_ORDERING_STUB flag xoá khỏi `.env.example` (mặc định live).
  - D2 cart consumer: Redis `DEL cart:user:{userId}` — tự idempotent, KHÔNG IdempotentConsumer (cart không DB — ghi chú trong code theo Javadoc sẵn của CartServiceApplication).
  - D3 notification: fork template nguyên bản (PG outbox giữ — V1) + V10 send_log + starter-mail (Mailpit). Invoice PDF: service-account (env `NOTIFY_SERVICE_ACCOUNT_*`) đăng nhập identity public API mỗi lần gửi (JWT mới) — account được seed script promote ADMIN (SQL user_roles nếu identity không có admin API; pattern CATALOG_API_TOKEN là interim đã có tiền lệ). Fetch fail → WARN + gửi email KHÔNG attach (không chặn email xác nhận). `order.cancelled`/`review.moderated` payload không có email → consume + send_log `SKIPPED_NO_EMAIL` (quy tắc fat-payload; pack cho phép "thiếu → skip log").
  - D4 log-service: KHÔNG PG (exclude jpa + datasource), Mongo `db_log.event_log`, unique index `eventId`, index `{eventType, occurredAt}`; queue `log.events` bind `#`; poison → WARN + ack (log không được phép chết vì 1 event hỏng).
  - D5 gateway: mọi route uri → `${<SVC>_URI:http://localhost:<port>}` (dev giữ nguyên; profile full compose set service-name); un-comment notification (controllers map full path, không StripPrefix — precedent catalog); route split D16: `/cart,/checkout,/account,/admin,/admin/**,/order/confirmation,/login,/register` → `${SHELL_WEB_ORIGIN:http://localhost:5173}` (dev) / nginx (full). Static FE (profile full) = nginx container `frontend-web` (shell dist + 4 remotes dist tại `/remotes/<name>/`), storefront-web Next standalone container riêng — gateway giữ lean, khớp comment CorsConfig ("prod gateway serves static same-origin" qua nginx same-origin đằng sau gateway).
  - D6 FE build: 4 vite apps `build` = `tsc --noEmit && vite build` (dist thật cho profile full; turbo `^build` giữ); storefront-web `output:'standalone'`.
  - D7 seed: `scripts/seed/seed.sh` idempotent qua API thật (register/login admin+user, upsert coupon admin API, tạo 1-2 đơn CONFIRMED + 1 review APPROVED). Đơn CONFIRMED khi không có Stripe keys: seed DB trực tiếp (INSERT order/items/saga CONFIRMED + invoice_seq) — pack cho phép "seed DB, ghi rõ cách"; khi CÓ keys → API path tự dùng được. `make seed` + compose profile `seed` (one-shot).
  - D8 E2E: parameterized `hasStripe = !!process.env.STRIPE_SECRET_KEY && !placeholder`; webServer = none (test Assumes `make dev` đang chạy — preflight script kiểm tra, báo rõ); Mailpit API :8025 helper; Mongo assert qua `mongosh`/mongo driver; ES assert :9200; partner :8080/open-api; affiliate qua storefront ?ref + dashboard. rbac = curl-based spec. standalone = `scripts/standalone-check.sh` (boot từng service đơn lẻ với compose infra).
- **Edge cases:** guest cart token vs user cart sau merge (consumer xoá user key — guest key TTL tự hết); re-delivery order.confirmed (DEL idempotent); coupon reserved nhưng payment fail → released (ordering đã làm — assert); ES chưa reindex kịp sau admin create (E2E expect với retry — product.changed async); Mailpit restart giữ mail (volume có sẵn).
- **Non-functional:** perf sanity = cache hit log + không N+1 PLP (check list query); security sanity = grep secrets, validation spot check; a11y/i18n = đã có từ SF trước (không đụng).

## 5. Implementation outline
Tasks (serial, 1 atomic commit mỗi task — shared worktree):
1. **T1 checkout-live-wiring** — orderingStub live + polling confirmation + cart consumer + tests xanh.
2. **T2 notification-service** — fork + consumers + mail + send_log + IT.
3. **T3 log-service** — fork (Mongo) + fan-in consumer + IT.
4. **T4 gateway-full-routetable** — env-uri + notification route + D16 shell split + gateway test updates.
5. **T5 make-dev-fullstack + compose profile full** — Makefile dev/full/stop + compose blocks (5 svc còn thiếu + gateway + storefront-web + frontend-web nginx) + FE build scripts + nginx conf.
6. **T6 deterministic-seed** — scripts/seed + Makefile seed + profile seed + coupon upsert pack-correct + orders CONFIRMED + review APPROVED + promote notification svc account.
7. **T7 admin-live-wiring** — mfe-admin orders/detail/invoice/coupons/reviews/stats mock→live + tests.
8. **T8 e2e-harness** — playwright.config + helpers (auth/mailpit/api) + golden-path + rbac specs.
9. **T9 e2e-suite-2** — admin-crud + review-flow + saga-fail + platform-asserts (§5.8-5.11/5.13/5.14) + standalone script.
10. **T10 docs-adr-readme** — README + demo-script + 4 ADR + perf/security sanity (chạy + ghi kết quả).
11. **T11 live-verify + browser Rule 0** — boot full stack, browser golden path, Mailpit, admin thấy đơn (đây là bước 2/2b checklist, KHÔNG phải code — vẫn commit fix nếu phát hiện seam bug).
12. **T12 independent review + merge + gate** — code-reviewer APPROVED → merge story branch → audit comment → story-verify → FI-320 Done.

File structure: service mới theo đúng layout affiliate (`backend/services/<svc>/src/main/java/com/ecommerce/<svc>/{consumer,config,web,domain}`); e2e tại `frontend/e2e/` (playwright là dep của root frontend workspace); seed tại `scripts/seed/`.

Testing strategy: unit/IT mỗi service mới (Testcontainers — Rabbit+PG / Rabbit+Mongo); cart consumer IT; mfe-checkout vitest update; mfe-admin vitest cho live api; E2E = suite trên stack dev. `mvn -q test` toàn repo + `pnpm -r test` phải xanh trước merge.

## 6. Risks & unknowns (verify lúc làm)
- CheckoutSaga trả gì cho POST /orders khi payment 503 (response code/body) — đọc OrderController/Saga.
- CommonLibAutoConfiguration có force JPA bean ở log-service (không PG) không — nếu có: `spring.autoconfigure.exclude`.
- Identity có admin endpoint gán role không — nếu không: seed SQL user_roles (db_identity).
- Mongo driver qua common-lib? (log-service thêm spring-boot-starter-data-mongodb trực tiếp).
- Playwright browser download trên máy (npx playwright install chromium) — network.
- Vite federation build ở production mode (remoteEntry tên file) — verify bằng `vite build` + preview trước khi nginx.
- Next standalone build output layout — Dockerfile theo docs Next 14.

## Verify checklist (Phase 5 — từng dòng ACCEPTANCE)
1. `make dev` fullstack sống; `make full` containerized chạy được (ACCEPTANCE 1).
2. golden path E2E + browser Rule 0 (mua hàng nhìn bằng mắt, Mailpit có email, admin thấy đơn) — có keys thì full; không keys: tạo đơn + FAILED-path + [PENDING-STRIPE-KEYS] (2).
3. admin tạo product → storefront thấy (E2E admin-crud) (3).
4. standalone script mỗi service OK (4).
5. rbac: no-token 401 / customer 403 (5).
6. review flow E2E + badge verified (6) [PENDING-STRIPE-KEYS cho verified-badge nếu đơn seed DB].
7. saga-fail: FAILED + reservation released + coupon reusable (7).
8. Mongo event_log có docs mọi domain event demo (§5.8) · ES count > 0 + search qua ES (§5.9) · SEO view-source + sitemap/robots + JSON-LD (§5.10) · i18n /en/p + hreflang + search ?locale=en (§5.11) · partner X-API-Key 200/401 + docs portal (§5.13) · affiliate ?ref → dashboard hoa hồng (§5.14) · email Mailpit đơn CONFIRMED + attach PDF · header shell auth/cart-badge + header Next search/locale · dashboard có data seed.
