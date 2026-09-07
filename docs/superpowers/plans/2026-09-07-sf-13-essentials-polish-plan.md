# SF-13 Essentials & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Batch cuối D21 — lấp 8 lỗ hổng thực dụng: password reset, COD, upload MinIO, abandoned cart email, audit viewer, recently viewed + related, GA4, CSV export, newsletter + E2E regression.

**Architecture:** Additive per-service features trên conventions đã có (outbox/event envelope, PaymentProviderAdapter SPI, SearchEngine ES/PgFts, cart redis store, Mailpit mailers). Contracts FROZEN — 3 runtime-additive endpoints (related, newsletter, cod-capture) + 3 events mới ghi ADR, đã flag FI-310.

**Tech Stack:** Spring Boot 3 / Java 21, Testcontainers, MinIO 8.5 java-client, Elasticsearch MLT (raw RestClient DSL), Redis, RabbitMQ topic `ecommerce.events`, Next.js 14 + Vite MF + React, Playwright.

**Linear Issue:** FI-323 · Spec: `docs/superpowers/specs/2026-09-07-sf-13-essentials-polish-design.md` · Merge target: `story/fi310-ecommerce-platform`

**Baseline:** SagaTest.declinedPayment failure flaky exist — re-run serial: 26/26 XANH. Test ordering luôn serial.

**Plan-critic + spec-critic đã chốt (2026-09-07):** (1) CodPaymentAdapter KHÔNG đăng ký bean PaymentProviderAdapter (payment inject 1 adapter duy nhất — bean thứ 2 = NoUniqueBean); (2) deliver COD capture TRƯỚC transition (retry-able); (3) admin newsletter tách controller `/admin/newsletter`; (4) MinIO object key `<uuid>.<ext>` trong bucket `products`; (5) MLT min_term_freq=1 + fill same-category; (6) log-service cần thêm pom security+oauth2; (7) COD cancel skip refund; (8) pnpm filters: `storefront-web`, `@ecommerce/shell` (đúng tên package.json); (9) CSV IT assert BOM 3 byte. Chi tiết trong spec §1-2 (đã update).

---

### Task 1: compose-minio-catalog-upload-endpoint

**Files:**
- Modify: `docker-compose.yml` (append minio + minio-init blocks + volume `miniodata`)
- Modify: `backend/services/catalog-service/pom.xml` (add `io.minio:minio:8.5.17`)
- Create: `backend/services/catalog-service/src/main/java/com/ecommerce/catalog/storage/MinioConfig.java`, `storage/ProductStorage.java`
- Modify: `backend/services/catalog-service/src/main/java/com/ecommerce/catalog/web/AdminProductController.java` (thêm `POST /api/catalog/admin/uploads`)
- Modify: `backend/gateway/src/main/resources/gateway-routes.yml` (route `media`)
- Modify: `backend/gateway/src/main/resources/routes/gateway-auth.yml` (public-paths thêm `/media/**`)
- Modify: `frontend/apps/storefront-web/next.config.mjs` (rewrite `/media/:path*` → `${GATEWAY_URL}`)
- Modify: `frontend/apps/mfe-admin/vite.config.ts` (proxy `/media`)
- Create: `backend/services/catalog-service/src/test/java/com/ecommerce/catalog/admin/UploadIT.java` (Testcontainers MinIO)

Key decisions:
- `MinioConfig`: `MinioClient.Builder().endpoint(catalog.minio.endpoint default http://localhost:9000).credentials(minioadmin/minioadmin).build()`; `@PostConstruct` ensure bucket `products` + `setBucketPolicy` anonymous download (`s3:GetObject` allow `arn:aws:s3:::products/*`).
- `ProductStorage.upload(MultipartFile)`: validate `size ≤ 5_242_880`, ext+content-type ∈ {image/jpeg,image/png,image/webp} → key `products/<uuid>.<ext>` → `putObject` → trả `/media/products/<uuid>.<ext>`. Lỗi → problem+json 400.
- Compose (append-only, network `ecommerce-net`, volume `miniodata`):
  - `minio`: image `minio/minio:RELEASE.2024-09-13T20-26-02Z`, command `server /data --console-address ":9001"`, ports `9000:9000`/`9001:9001`, env `MINIO_ROOT_USER/PASSWORD: minioadmin`, healthcheck `curl -f http://localhost:9000/minio/health/live`.
  - `minio-init`: image `minio/mc:RELEASE.2024-08-26T15-33-06Z`, depends_on minio `service_healthy`, entrypoint sh: `mc alias set local http://minio:9000 minioadmin minioadmin && mc mb -p local/products && mc anonymous set download local/products`, `restart: "no"`.

- [ ] UploadIT: png 1×1 → 201 + url match `/media/products/[0-9a-f-]{36}\.png` + GET thẳng MinIO trả 200 (policy anonymous); `.gif` → 400; >5MB → 400; customer → 403; anonymous → 401 — **KẾT QUẢ: 5/5 PASS (đã chạy)**
- [ ] FE: nút "Tải ảnh lên" trong `ProductFormPage.tsx` images tab → `uploadAdminImage` (contracts client) → set row.url + preview (plan-critic P0: FE half của upload phải có chủ)
- [ ] `mvn -pl services/catalog-service test` xanh (80/80 — IT mới + cũ không vỡ)
- [ ] `docker compose up -d minio minio-init` → health 200; upload thật qua gateway bằng admin login (không có mint script — login admin@demo.vn lấy token) → GET url 200
- [ ] Commit: `feat(catalog): minio image upload — compose + admin endpoint + gateway media + admin form button`

### Task 2: identity-password-reset-flow-email

**Files:**
- Create: `backend/services/identity-service/src/main/resources/db/migration/V11__password_reset_tokens.sql`
- Create: `domain/PasswordResetTokenEntity.java`, `repo/PasswordResetTokenRepository.java`, `auth/PasswordResetController.java`, `auth/dto/ForgotPasswordRequest.java`, `auth/dto/ResetPasswordRequest.java`, `auth/PasswordResetService.java`
- Modify: `token/RefreshTokenRepository.java` (thêm `@Modifying revokeAllForUser(UUID userId, Instant now)`)
- Modify: `config/SecurityConfig.java` (permit `/password/**`)
- Modify: `backend/services/notification-service/.../config/RabbitMqConfig.java` (queue `notification.password_reset` bind `user.password_reset_requested`), create `consumer/PasswordResetConsumer.java`, `mail/PasswordResetMailer.java`, props `notify.reset-password-url`
- Modify: `frontend/apps/mfe-account/vite.config.ts` (exposes), create `src/pages/ForgotPasswordPage.tsx`, `src/pages/ResetPasswordPage.tsx`
- Modify: `frontend/apps/shell/src/App.tsx` (dispatch `/forgot-password`, `/reset-password`)
- Modify: `backend/gateway/src/main/resources/routes/gateway-auth.yml` (public-paths `/api/identity/password/**`), `gateway-routes.yml` shell-web predicate thêm 2 path
- Tests: `identity/auth/PasswordResetIT.java`, `notification/PasswordResetConsumerTest.java`

Key shapes:
- DDL: `id uuid PK default gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash varchar(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL default now()`
- Service: forgot → luôn 202 `{status:"accepted"}`; tìm email (lowercase) → có: token raw = Base64URL(SecureRandom 32B), hash = SHA-256 hex, expires 30' → save + `outboxWriter.write("user.password_reset_requested", {email, token, expiresAt}, requestId)`. reset → hash lookup, check `expires_at > now && used_at IS NULL` → fail 401 problem+json `invalid_token`; else set BCrypt password + used_at=now + `revokeAllForUser` — MỘT tx.
- Mailer HTML: link `${notify.reset-password-url:http://localhost:5173/reset-password}?token=<raw>` + dòng "Nếu không phải bạn yêu cầu, bỏ qua email này". Consumer pattern y hệt NotificationOrderConsumer (IdempotentConsumer + SendLog).
- FE: ForgotPasswordPage (Input email + Button → api POST `/api/identity/password/forgot` fetch trực tiếp, 202 → banner xanh); ResetPasswordPage (`new URLSearchParams(window.location.search).get('token')`, password ≥8, 204 → banner + link `/login`). UI-kit, error pattern `err.name === 'ApiErrorClient'`.

- [ ] PasswordResetIT: forgot unknown email → 202 (body giống hệt known); forgot known → 1 row token_hash + outbox event; reset sai token → 401; reset OK → login MK mới 200 + MK cũ 401 + refresh cookie cũ → refresh 401 (revoked); reset 2 lần cùng token → lần 2 401
- [ ] PasswordResetConsumerTest (Mailpit container): envelope qua `sendRaw` → Mailpit có 1 mail to=đúng subject chứa `/reset-password?token=`; dup eventId → vẫn 1 mail
- [ ] `mvn -pl services/identity-service,services/notification-service test` xanh
- [ ] Commit: `feat(identity): password forgot/reset — email qua notification, revoke-all refresh`

### Task 3: cod-payment-adapter-saga-skip

**Files:**
- Create: `backend/services/payment-service/src/main/java/com/ecommerce/payment/spi/CodPaymentAdapter.java`, `api/CodCaptureController.java`, `service/CodCaptureService.java`
- Modify: `payment/config/PaymentAdapterConfig.java` (bean `codAdapter` `@Conditional(CodEnabledCondition)` + condition `payment.cod.enabled != false`)
- Modify: `ordering/domain/OrderStatus.java` (PENDING→ thêm CONFIRMED)
- Modify: `ordering/saga/CheckoutSaga.java` (bỏ guard COD step 0; skip step 7 khi cod; step 8 cod → `lifecycle.confirmCodOrder` + saga DONE)
- Modify: `ordering/service/OrderLifecycleService.java` (thêm `confirmCodOrder(orderId, correlationId)` — tx: transitionTo(CONFIRMED) + coupon finalize + outbox `order.confirmed` `buildConfirmedPayload` — reuse; thêm `captureCodOnDelivery(order)` gọi payment + outbox `order.paid`)
- Modify: `ordering/api/AdminOrderController.java` (deliver: sau transition, nếu `paymentMethod=cod` → `lifecycle.captureCodOnDelivery` ngoài tx)
- Modify: `ordering/saga/PaymentClient.java` (thêm `captureCod(orderId, amountVnd, idempotencyKey)`)
- Tests: `payment/CodPaymentAdapterTest.java`, `ordering/SagaTest.java` thêm `codCheckout_confirmedWithoutStripe_fatPayloadValidates` + `codDeliver_capturesPayment_emitsOrderPaid`

Key shapes:
- `CodPaymentAdapter.createIntent` → `new AdapterIntent("cod:" + command.orderId(), null, "REQUIRES_CONFIRMATION")`; void/refund → record success no-op; verifyWebhook → `UnsupportedOperationException`. **KHÔNG @Component/@Bean** — payment inject MỘT adapter duy nhất (stripe/unconfigured); class thuần test instantiate trực tiếp.
- Capture endpoint `POST /payment/cod/captures` body `{orderId, amountVnd, idempotencyKey}` (new DTO) → `CodCaptureService` (tx): tìm intent `providerIntentId=cod:<orderId>` — chưa có → insert `PaymentIntent(orderId, amountVnd, "VND", idemKey, payloadHash)` + `markStatus(SUCCEEDED)` + stripe_status "succeeded"; có → idempotent replay 201. **KHÔNG** publish payment.succeeded.
- Saga cod: sau reserve OK (step 6) → `confirmCodOrder` trong tx riêng → response `(dto, null)`. `confirmCodOrder` guard `status==PENDING` else idempotent no-op return.
- deliver COD (spec-critic P1): **capture TRƯỚC transition** — `paymentClient.captureCod(...)` OK → tx transition SHIPPED→DELIVERED + outbox `order.paid` `{orderId, paymentIntentId:"cod:<id>", paidAt}`. Capture fail → 502 problem+json, order còn SHIPPED → deliver lại được (capture idempotent). Stripe path giữ nguyên transition-first.
- `cancelByAdmin`/`refundSafely`: skip refund khi paymentMethod=cod (chưa thu tiền; tránh refund(null) lỗi requeue) — spec-critic P1.
- Test COD happy: không stub Stripe intent; createOrder(cod) → poll status CONFIRMED, clientSecret null, outbox order.confirmed validate schema, coupon finalized. Deliver test (plan-critic P1 — ordering→payment là HTTP thật giữa 2 context thật, KHÔNG phải WireMock): assert payment DB đúng 1 intent `cod:<orderId>` SUCCEEDED (deliver 2 lần vẫn 1) + ordering outbox có order.paid row. Cancel test: cancel CONFIRMED COD → không refund call, status CANCELLED.

- [ ] `mvn -pl services/payment-service,services/ordering-service test` xanh (COD mới + stripe cũ không vỡ)
- [ ] Commit: `feat(ordering,payment): COD — adapter no-op, saga skip intent, PENDING→CONFIRMED, capture lúc giao`

### Task 4: checkout-cod-option-ui

**Files:**
- Modify: `frontend/apps/mfe-checkout/src/pages/CheckoutPage.tsx` (radio payment method ở step 3)
- Modify: `frontend/apps/mfe-checkout/src/lib/orderingApi.ts` (`createOrder(..., paymentMethod: 'stripe'|'cod')` — bỏ hardcode)
- Modify: `frontend/apps/mfe-checkout/src/pages/ConfirmationPage.tsx` (GA purchase guard — để trỏ Task 9; chỉ thêm hook point `trackPurchase(order)` stub-free)

Chi tiết:
- State `paymentMethod` default `'stripe'`; UI radio 2 option: "Thẻ quốc tế (Stripe)" / "COD — Thanh toán khi nhận hàng" (`data-testid="payment-method-cod"`). COD selected → ẩn note "thanh toán qua Stripe" hiện note "Kiểm tra hàng và thanh toán tiền mặt khi nhận".
- `placeOrder()`: `createOrder({... paymentMethod})`. Response `clientSecret === null || paymentMethod==='cod'` → `finalize(created.order)` NGAY (skip `awaiting-card` phase + mount effect phải guard `paymentMethod!=='cod'`).
- Effect mount Stripe: `if (!created || created.clientSecret == null) return` (thay mount vô điều kiện).

- [ ] Build `pnpm --filter @ecommerce/mfe-checkout build` xanh
- [ ] Manual smoke (dev stack): COD → confirmation hiển thị CONFIRMED; Stripe path không key → panel "chưa mount" giữ nguyên behavior cũ
- [ ] Commit: `feat(checkout): COD payment option — skip Stripe khi clientSecret null`

### Task 5: abandoned-cart-scheduler-email

**Files:**
- Modify: `backend/services/cart-service/.../domain/CartModels.java` (CartDocument thêm `String email`)
- Modify: `cart/web/CartController.java` (mutation authenticated → set email từ JWT claim `email`)
- Create: `cart/abandoned/AbandonedCartSweeper.java`
- Modify: `cart/CartServiceApplication.java` (`@EnableScheduling`)
- Modify: `cart/config/RabbitMqConfig.java` (publish helper với headers eventType — mimic OutboxRelay)
- Modify: `notification/config/RabbitMqConfig.java` (queue `notification.carts` bind `cart.abandoned`) + `consumer/AbandonedCartConsumer.java` + `mail/AbandonedCartMailer.java`
- Test: `cart/abandoned/AbandonedCartSweeperTest.java` (redis + RabbitMQ container)

Key:
- Sweeper `@Scheduled(fixedDelayString "${cart.abandoned.sweep-interval-ms:60000}")`, gate `cart.abandoned.enabled:true`: `redis.scan("cart:user:*")` → load → `!items.isEmpty() && email != null && updatedAt.isBefore(now - idle)` (idle `${cart.abandoned.idle-minutes:120}`) → `Boolean hadKey = redis.opsForValue().setIfAbsent("cart:abandoned_notified:" + sub, "1", Duration.ofHours(24))` → true mới publish: envelope `EventEnvelope.of("cart-service","cart.abandoned","system:abandoned-cart", payload {userId, email, itemCount, updatedAt})`, `rabbitTemplate.send("ecommerce.events","cart.abandoned", msg)` headers `eventType`, contentType JSON, persistent (copy OutboxRelay.toAmqpMessage).
- Test set trực tiếp redis key `cart:user:u1` JSON `{items:[1 line], updatedAt: <2h01' trước>, email:"u@x.vn"}` → gọi `sweeper.sweep()` trực tiếp → Awaitility đếm message trên queue `notification.carts` (bind sẵn) = 1; sweep lần 2 → vẫn 1; update cart updatedAt mới → sweep → không tăng. Cart không email / items rỗng → không publish.

- [ ] `mvn -pl services/cart-service,services/notification-service test` xanh
- [ ] Commit: `feat(cart): abandoned cart email — sweeper 2h + redis flag 24h + notification mailer`

### Task 6: audit-log-viewer-admin-mongo

**Files:**
- Modify: `backend/services/log-service/pom.xml` (**thêm `spring-boot-starter-security` + `spring-boot-starter-oauth2-resource-server`** — plan-critic P0: hiện KHÔNG có, config sẽ không compile; security-starter không config = lock mọi endpoint → config cùng commit)
- Create: `backend/services/log-service/.../config/SecurityConfig.java`, `config/JwtDecoderConfig.java` (copy catalog pattern, JWKS URI env `SECURITY_JWKS_URI` fallback PEM `JWT_PUBLIC_KEY_PATH` ancestor-walk), `web/AdminEventController.java`, `web/dto/EventLogPageDto.java`, `web/dto/EventLogItemDto.java`
- Modify: `backend/gateway/src/main/resources/gateway-routes.yml` (route `log` `/api/log/**` → `${LOG_URI:http://localhost:8088}` không StripPrefix), `routes/gateway-auth.yml` (admin-prefixes `/api/log/admin/**`)
- Modify: `frontend/apps/mfe-admin/src/lib/guard.ts` (AdminPageKey + resolveAdminRoute `/admin/audit` + ADMIN_NAV), `src/AdminApp.tsx` (render AuditPage)
- Create: `frontend/apps/mfe-admin/src/pages/AuditPage.tsx`
- Modify: `frontend/packages/i18n/src/catalogs/vi.ts` + `en.ts` (`admin.nav.audit`, `admin.audit.*`)
- Test: `log/AdminEventsIT.java` (MongoDBContainer + Rabbit container có sẵn pattern EventLogConsumerTest)

Key:
- Controller: `GET /api/log/admin/events?eventType=&from=&to=&page=1` — size cố định 50; `from/to` ISO-8601 Instant parse (bad → 400); MongoTemplate `Query(Criteria "eventType" is ... (nullable)).and("occurredAt").gte/lte (nullable))` `.with(Sort desc("occurredAt")).skip((page-1)*50L).limit(50)`; count riêng cùng filter → `{items, page, size:50, total}`. SecurityConfig: `/api/log/admin/**` hasRole ADMIN, actuator health permit, còn lại authenticated.
- AuditPage: filter row (Input eventType placeholder "vd order.confirmed", 2 Input datetime-local → ISO convert), Table cột [Thời gian, eventType, correlationId, payload (JSON.stringify slice 120 chars)], Button `< Trước / Sau >` pagination (data-testid `audit-next`), fetch authed: `authStore.fetch('/api/log/admin/events?...')` qua gateway same-origin, loading + empty state.

- [ ] AdminEventsIT: 3 docs (2A 1B occurredAt tăng dần) → filter eventType=A → total 2 sort desc; from/to chính xác biên; page=2 → rỗng; anonymous 401; customer token 403; admin 200
- [ ] `mvn -pl services/log-service test` xanh; `pnpm --filter @ecommerce/mfe-admin build` xanh
- [ ] Commit: `feat(log,admin): audit log viewer — admin endpoint + gateway route + mfe-admin page`

### Task 7: recently-viewed-localstorage

**Files:**
- Create: `frontend/apps/storefront-web/components/RecentlyViewed.tsx` (`'use client'` — home section)
- Create: `frontend/apps/storefront-web/components/pdp/RecentlyViewedTracker.tsx` (`'use client'` — PDP ghi)
- Create: `frontend/apps/storefront-web/lib/recently-viewed.ts` (read/write/clear helpers)
- Modify: `frontend/apps/storefront-web/app/[locale]/page.tsx` (render `<RecentlyViewed locale/>` sau featured)
- Modify: `frontend/apps/storefront-web/app/[locale]/p/[slug]/page.tsx` (render `<RecentlyViewedTracker product={...}/>`)
- Modify: `frontend/apps/mfe-checkout/src/pages/ConfirmationPage.tsx` — task 4 đã chạm; KHÔNG đụng lại ở đây.

Key:
- `recently_viewed` localStorage JSON array `{slug, name, price, comparePrice, discountPercent, image, at}` max 12, unshift + dedupe theo slug, `try/catch` parse. Tracker: `useEffect` 1 lần khi mount với product snapshot (image = product.image?.url ?? ""). Home: đọc client-side, grid card mini (ảnh/gradient, name 2 dòng, giá + gạch), link `/{locale}/p/{slug}`; rỗng → render null. COPY vi/en inline: "Đã xem gần đây" / "Recently viewed". data-testid `recently-viewed`.

- [ ] `pnpm --filter storefront-web build` xanh
- [ ] Commit: `feat(storefront): recently viewed — PDP tracker + home section (localStorage max 12)`

### Task 8: related-products-es-morelikethis

**Files:**
- Modify: `backend/services/catalog-service/.../search/SearchEngine.java` (default method? KHÔNG — thêm `related(String slug, String locale, int size)` vào interface + cả 2 impl)
- Modify: `search/EsEngine.java` (MLT query), `search/PgFtsEngine.java` (fallback: cùng category mới nhất published, exclude self)
- Modify: `web/SearchController.java` (hoặc `web/ProductController` — đặt cạnh public products endpoint; endpoint `GET /api/catalog/products/{slug}/related`)
- Modify: `frontend/apps/storefront-web/lib/catalog-api.ts` (thêm `related(slug, locale)` — fetch trực tiếp `${GATEWAY_URL}/api/catalog/products/${slug}/related`)
- Modify: `app/[locale]/p/[slug]/page.tsx` (SSR fetch → section "Sản phẩm tương tự" dùng ProductCardView; rỗng → null)
- Test: `catalog/search/RelatedTest.java` (ES container)

Key:
- EsEngine.related: 1 request: GET doc theo slug trước (`products/_doc/<id>` qua slug query hoặc slug từ PG trước — PG lookup slug → id + name/category), rồi `_search` body: `more_like_this {fields:["name.vi","name.en","description.vi","description.en"], like:[{doc trả về}], min_term_freq:1, min_doc_freq:1, max_query_terms:12}`, `filter: [{term:{status:"PUBLISHED"}}], must_not:[{term:{_id: selfId}}]`, size clamp 1..8. ES fail → `degrade` sang PgFtsEngine.related (pattern degrade sẵn). min_doc_freq=1 vì seed chỉ 24 products.
- Endpoint trả `ProductCardPageDto` (items, page=1, size, total) — hydrate qua PG pattern sẵn. Slug không tồn tại/unpublished → page rỗng 200 (PDP ẩn).

- [ ] RelatedTest: 2 products cùng category mô tả tương đồng → related(1) chứa 2, không chứa self; slug lạ → 200 rỗng; ES container down chưa test (degrade path unit-level PgFts)
- [ ] `mvn -pl services/catalog-service test` xanh; `pnpm --filter storefront-web build` xanh
- [ ] Commit: `feat(catalog,storefront): related products — ES more_like_this + PDP section (runtime endpoint, ADR)`

### Task 9: ga4-gtm-env-integration

**Files:**
- Modify: `frontend/apps/storefront-web/app/layout.tsx` (Script gtag khi `process.env.NEXT_PUBLIC_GA_ID`)
- Create: `frontend/apps/storefront-web/components/GaPageview.tsx` (`'use client'` usePathname → `gtag('event','page_view')`)
- Modify: `frontend/apps/shell/src/main.tsx` (inject gtag.js + config khi `import.meta.env.VITE_GA_ID`; pageview qua `usePath` — hoặc inline listener trong App)
- Modify: `frontend/apps/mfe-checkout/src/pages/ConfirmationPage.tsx` (TERMINAL_OK lần đầu → `window.gtag?.('event','purchase',{transaction_id, value, currency:'VND'})` — guard typeof)
- Modify: `.env.example` (append SF-13 block: NEXT_PUBLIC_GA_ID=, VITE_GA_ID=, MINIO_ROOT_USER/PASSWORD, CATALOG_MINIO_ENDPOINT, NOTIFY_RESET_PASSWORD_URL, CART_ABANDONED_IDLE_MINUTES)

Key: không ID → KHÔNG load script gì (both apps); `window.dataLayer`/`window.gtag` guard mọi chỗ; purchase chỉ fire 1 lần (useRef/flag trên orderId).

- [ ] `pnpm --filter storefront-web --filter @ecommerce/shell --filter @ecommerce/mfe-checkout build` xanh
- [ ] Smoke: đặt NEXT_PUBLIC_GA_ID=G-TEST123 dev → view-source có `gtag.js?id=G-TEST123`; không đặt → không có script; confirmation CONFIRMED → console `dataLayer` push event purchase
- [ ] Commit: `feat(analytics): GA4 env-gated — pageview storefront+shell, purchase trên confirmation`

### Task 10: admin-export-csv

**Files:**
- Modify: `backend/services/ordering-service/.../api/AdminOrderController.java` (`GET /admin/orders/export.csv` — StreamingResponseBody, text/csv, Content-Disposition)
- Modify: `backend/services/catalog-service/.../web/AdminProductController.java` (`GET /api/catalog/admin/products/export.csv`)
- Create: `ordering/service/OrdersCsvExporter.java`, `catalog/admin/ProductsCsvExporter.java`
- Modify: `frontend/apps/mfe-admin/src/pages/OrdersPage.tsx` + `ProductsListPage.tsx` (Button "Xuất CSV" trong head actions → authed fetch blob download)
- Create: `frontend/apps/mfe-admin/src/lib/download.ts` (helper blob download giữ filename Content-Disposition)
- Tests: `ordering/OrdersCsvExportIT.java`, `catalog/admin/ProductsCsvExportIT.java`

Key:
- Cột orders: `order_id,created_at,status,payment_method,subtotal,discount,shipping_fee,total,currency,coupon_code,items_count` (email userId? email nằm trong Order? OrderDto không có email — dùng userId; đủ demo). Cột products: `id,slug,name_vi,brand,price,compare_price,discount_percent,status,rating_avg,created_at`. UTF-8 **BOM** `﻿` đầu stream (Excel VN). Batch 500 dòng/loop tránh load all vào memory. Filename `orders-<yyyyMMdd>.csv` / `products-<yyyyMMdd>.csv`.
- FE: `downloadCsv(path)` → `authStore.fetch(path)` → blob → `URL.createObjectURL` → a.click() → revoke.

- [ ] IT: seed ≥2 orders → ADMIN GET export → 200 text/csv, header đúng 11 cột, ≥2 dòng, BOM đầu; customer 403; anonymous 401. Catalog tương tự
- [ ] `mvn -pl services/ordering-service,services/catalog-service test` xanh; `pnpm --filter @ecommerce/mfe-admin build` xanh
- [ ] Commit: `feat(ordering,catalog,admin): CSV export — stream endpoints + export buttons`

### Task 11: newsletter-subscribe-welcome

**Files:**
- Create: `backend/services/identity-service/src/main/resources/db/migration/V12__newsletter_subscriptions.sql`
- Create: `identity/newsletter/NewsletterController.java`, `newsletter/NewsletterSubscriptionEntity.java`, `newsletter/NewsletterRepository.java`, `newsletter/dto/NewsletterSubscribeRequest.java`, `newsletter/dto/NewsletterPageDto.java`
- Modify: `identity/config/SecurityConfig.java` (permit POST `/newsletter`)
- Modify: `notification/config/RabbitMqConfig.java` (queue `notification.newsletter` bind `user.newsletter_subscribed`) + `consumer/NewsletterConsumer.java` + `mail/WelcomeNewsletterMailer.java`
- Modify: `frontend/apps/storefront-web/components/Footer.tsx` (client island SubscribeForm)
- Create: `frontend/apps/storefront-web/components/NewsletterForm.tsx` (`'use client'`)
- Create: `frontend/apps/mfe-admin/src/pages/NewsletterPage.tsx` + register route/nav/i18n (`admin.nav.newsletter`)
- Modify: `backend/gateway/src/main/resources/routes/gateway-auth.yml` (public `/api/identity/newsletter`)
- Test: `identity/newsletter/NewsletterIT.java`, `notification/NewsletterConsumerTest.java`

Key:
- DDL: `id uuid PK default gen_random_uuid(), email varchar(255) NOT NULL UNIQUE, created_at timestamptz NOT NULL default now()`. POST `/newsletter` `{email}` → 204 luôn; insert mới → outbox `user.newsletter_subscribed {email, subscribedAt}`; dup (DataIntegrityViolation / exists check) → KHÔNG event, KHÔNG row mới. Admin list `GET /admin/newsletter?page=1&size=50` ROLE_ADMIN → `{items:[{email, createdAt}], page, size, total}`.
- Footer island: email input + nút "Đăng ký nhận tin" → POST → success msg "Đã đăng ký! Kiểm tra email chào mừng." / dup → "Email này đã được đăng ký từ trước." (204 cả 2 → FE phân biệt bằng gọi trước POST nào cũng 204 → hiện msg generic thành công + check dup bằng cách... ĐƠN GIẢN: backend trả 200 new / 204 dup? Giữ contract-free đơn giản: trả `{status:"subscribed"|"already"}` 200 — FE hiện đúng 2 msg. ADR ghi shape.) data-testid `newsletter-email`/`newsletter-submit`.
- NewsletterPage admin: table email + created_at + pagination — pattern AuditPage (task 6).

- [ ] NewsletterIT: subscribe mới → 200 {status:"subscribed"} + row + outbox event; dup → 200 {status:"already"} + KHÔNG row thứ 2 + KHÔNG event thêm; email invalid → 400; admin list 200 ADMIN / 403 customer; anonymous POST OK (public)
- [ ] NewsletterConsumerTest: envelope → Mailpit welcome mail; idempotent dup
- [ ] `mvn -pl services/identity-service,services/notification-service test` xanh; storefront + mfe-admin build xanh
- [ ] Commit: `feat(identity,storefront,admin): newsletter — subscribe API, welcome email, footer form, admin list`

### Task 12: e2e-regression-essentials

**Files:**
- Create: `frontend/e2e/tests/password-reset.spec.ts`, `cod-checkout.spec.ts`, `upload-image.spec.ts`, `related-products.spec.ts`
- Modify: `frontend/e2e/helpers/api.ts` (nếu cần helper mailpit lấy link reset), `frontend/e2e/tests/fixtures/` (png nhỏ cho upload)

Key (helpers/env có sẵn: STOREFRONT/SHELL/GATEWAY/MAILPIT_API, registerNewUser, uiLogin, pgExec):
- password-reset: register user → POST forgot qua GATEWAY → Mailpit API tìm mail → regex `/reset-password\?token=([a-zA-Z0-9_-]+)/` → mở `${SHELL}/reset-password?token=` → nhập MK mới → login MK mới OK; forgot email lạ → cùng thông báo.
- cod-checkout: new user → add to cart từ PDP → checkout → chọn COD (data-testid) → đặt hàng → confirmation `[data-testid="order-status"]` = CONFIRMED.
- upload-image: admin login → /admin/products/new (hoặc product có sẵn) → images tab → upload fixture.png (setInputFiles) → row url `/media/products/` xuất hiện → lưu → mở PDP → img[src*="/media/products/"] visible.
- related-products: mở PDP seed → section `related` có ≥1 `.product-card` (selector theo ProductCardView class thật); về home → `[data-testid="recently-viewed"]` chứa sản phẩm vừa xem.
- Chạy: `cp -n .env.example .env` (nếu thiếu) → `make dev` (đợi healthy) → `make seed` → `make e2e` — toàn bộ suite (golden-path + admin-crud + review + saga-fail + rbac + platform-asserts + 4 mới) phải xanh.

- [ ] 4 spec mới pass; suite cũ regression pass (golden-path đặc biệt)
- [ ] Commit: `test(e2e): SF-13 essentials specs — reset password, COD, upload, related`

### Task 13: docs-adr-scope-freeze

**Files:**
- Create: `docs/adr/0005-sf13-essentials-decisions.md` — 5 decisions: (1) reset/newsletter/abandoned email = event-driven (không REST nội bộ), 3 event mới ngoài freeze 13 — schema ghi đây, log `#` tự audit; (2) COD: order.paid lúc DELIVERED (đọc "COD→PAID lúc giao"), PENDING→CONFIRMED path mới duy nhất, stock window CONFIRMED→DELIVERED > TTL30' chấp nhận (demo); (3) related/newsletter/cod-capture endpoints runtime-additive ngoài freeze (precedent audit-log admin endpoint); (4) cart publish direct RabbitTemplate — cart không outbox (D8), flag at-most-once; (5) raw reset token trong event — Mailpit dev sink, token single-use 30'.
- Modify: `README.md` mục demo (nếu có bảng feature — thêm SF-13 dòng; kiểm tra trước, chỉ append)

- [ ] Commit: `docs(adr): SF-13 decisions — event choice, COD reading, runtime-additive endpoints, scope freeze`

---

## Dependency / thứ tự

1 → (2,3) → 4 → (5,6,7,8,9,10,11 tuần tự — nhóm review G1:1-3, G2:4-6, G3:7-9, G4:10-11) → 12 (cần stack sống + mọi feature) → 13.

## Verify cuối (Phase 5 checklist)

- [ ] 9 dòng ACCEPTANCE pack verify từng dòng (IT + E2E + browser Rule 0)
- [ ] `~/.claude/bin/story-verify sf-13-essentials-polish` sạch (ORCA_BIN=/usr/local/bin/orca)
- [ ] Merge → `story/fi310-ecommerce-platform` + audit comment merge-hash
- [ ] FI-323 → Done
