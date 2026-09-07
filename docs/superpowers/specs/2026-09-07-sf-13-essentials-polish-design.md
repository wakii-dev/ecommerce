# SF-13 Essentials & Polish — Design Notes (spec slice resolution)

> Nguồn: context pack `docs/superpowers/contexts/sf-13.md` (D21) + epic spec §3.3/§3.6/§15 + codebase verified 2026-09-07.
> Contracts READ-ONLY. STORY SCOPE ĐÓNG — batch cuối (D21), không nhận scope mới.
> Gaps đã flag lên FI-310: related-products endpoint, newsletter endpoint, 3 events mới (requirement-gap + supplement, runtime additive + ADR).

Status: Approved (autonomous — self-review per pack + frozen contracts; epic questions đã trả lời trước đó, không hỏi lại)

## 1. Contract drift resolutions (context pack ↔ frozen yaml — contract WINS)

| Item | Pack nói | Frozen contract nói | Resolution |
|---|---|---|---|
| Password forgot | "luôn trả 200" | `identity.yaml`: **202** luôn ("LUON tra 202 bat ke email co ton tai"), reset **204**, token sai **401**, TTL 30' single-use | Theo contract: 202/204/401. TS client `forgotPassword`/`resetPassword` đã generate sẵn |
| COD order.paid | "sau reserve → CONFIRMED luôn" | `order.paid.schema.json`: "COD không phát event này (CONFIRMED sau reserve, PAID lúc giao)"; `ordering.yaml` OrderStatus: "COD (D21) — CONFIRMED sau reserve, PAID khi giao"; transition row "SHIPPED→DELIVERED ... COD→PAID" | COD KHÔNG phát order.paid lúc checkout. "PAID lúc giao" = lúc admin DELIVERED: capture payment + emit `order.paid` (payload `paymentIntentId` = cod intent id) → inventory commit lúc giao. State machine THÊM ĐÚNG 1 path: PENDING→CONFIRMED (như pack) |
| Uploads | "POST /api/catalog/admin/uploads ... trả URL /media/products/<uuid>" | `catalog.yaml` ĐÃ freeze `POST /api/catalog/admin/uploads` → `UploadResponse{url}`; TS client `uploadAdminImage` + multipart Blob sẵn | Không gap. Backend implement theo frozen shape |
| payment_method | "checkout thêm chọn phương thức" | `ordering.yaml` CreateOrderRequest.paymentMethod enum [stripe, cod] default stripe; clientSecret nullable "NULL khi COD"; flyway V10 đã có cột | Không gap, không migration |
| Related products | "thêm vào catalog.yaml? KHÔNG" | Không có endpoint | **GAP — đã flag FI-310**: runtime endpoint `GET /api/catalog/products/{slug}/related`, ADR exception (precedent audit-log), storefront gọi thẳng SSR không cần TS client |
| Newsletter | "POST /api/identity/newsletter" | Không có trong identity.yaml | **GAP — đã flag FI-310**: runtime endpoint + ADR. Dup email → 204 no-op KHÔNG double email |

## 2. Service design

### 2.1 identity-service (A1 reset + A8 newsletter)
- `V11__password_reset_tokens.sql`: `id uuid PK, user_id uuid FK→users ON DELETE CASCADE, token_hash varchar(64) UNIQUE, expires_at timestamptz, used_at timestamptz NULL, created_at`. Token: SecureRandom 32B → base64url (email), SHA-256 hex (DB) — cùng convention refresh_tokens.
- `V12__newsletter_subscriptions.sql`: `id uuid PK, email varchar(255) UNIQUE NOT NULL, created_at timestamptz`.
- `PasswordResetController @RequestMapping("/password")`: `POST /forgot` (public, `@Valid {email}`) → tạo token nếu email tồn tại + outbox `user.password_reset_requested` `{email, token, expiresAt}` → **luôn 202** `{status:"accepted"}`; `POST /reset` (public) → validate hash+expiry+unused → set BCrypt password, mark used, **revoke MỌI refresh token** (`RefreshTokenRepository.revokeAllForUser` — query mới `UPDATE ... SET revoked_at WHERE user_id AND revoked_at IS NULL`) → 204; token sai/hết/đã dùng → 401 problem+json.
- `NewsletterController @RequestMapping("/newsletter")`: `POST ""` → insert ignore dup → 204; chỉ subscribe MỚI mới outbox `user.newsletter_subscribed` `{email, subscribedAt}`. `GET /admin/newsletter` (ROLE_ADMIN, path nằm dưới `/admin/**` guard sẵn) → page `{items:[{email, createdAt}], page, size, total}`.
- SecurityConfig: permit `/password/**`, `/newsletter` (POST). Gateway `public-paths` thêm `/api/identity/password/**`, `/api/identity/newsletter`.
- Chọn **event** (không REST nội bộ) cho email reset/welcome: notification sinh ra là event-driven (queue + IdempotentConsumer + SendLog audit miễn phí); sync REST tạo coupling identity→notification + phải thêm endpoint off-freeze bên notification. ADR ghi: 3 event mới nằm ngoài 13 events freeze — schema ghi trong ADR, envelope + transport giữ nguyên common-lib; log-service bind `#` tự audit.
- Raw token trong event payload: chấp nhận được cho demo (Mailpit sink; token single-use 30'). Notification build link `${notify.reset-password-url:?token=}` (config mới, default `http://localhost:5173/reset-password`).

### 2.2 payment-service + ordering-service (A2 COD)
- `spi/CodPaymentAdapter implements PaymentProviderAdapter`: `createIntent` → no-op trả `AdapterIntent("cod:<orderId>", null, "REQUIRES_CONFIRMATION")` (clientSecret null — contract "NULL khi COD"); `voidIntent/refund` → no-op success record (không có tiền nào đã thu); `verifyWebhook` → throw UnsupportedOperation (COD không webhook). Đăng ký: `@Bean @Conditional(CodEnabledCondition)` `payment.cod.enabled=true` (default TRUE dev) — KHÔNG đụng Stripe condition; `PaymentIntentService.createIntent` route theo `request.providerHeader`? KHÔNG — ordering chỉ gọi payment lúc checkout với Stripe. COD **không gọi payment lúc checkout** (saga bỏ bước); capture gọi thẳng endpoint capture.
- Capture (additive runtime, ADR): `POST /payment/cod/captures` `{orderId, amountVnd, idempotencyKey}` → insert/update PaymentIntent (`providerIntentId=cod:<orderId>`, status SUCCEEDED, stripe_status "succeeded") idempotent theo Idempotency-Key → KHÔNG emit payment.succeeded (tránhlate-refund path) → trả 201.
- ordering `CheckoutSaga.createOrder`: bỏ guard throw COD; step 7 (payment intent) skip khi `cod`; thay step 8: gọi `lifecycle.confirmCodOrder(orderId, correlationId)` — 1 tx: `transitionTo(CONFIRMED)` + `couponService.finalizeForOrder` + outbox `order.confirmed` (fat payload, schema-exact) + saga DONE → response `CreateOrderResponse(order, null)`.
- `OrderStatus.ALLOWED`: PENDING → {PAID, **CONFIRMED**, CANCELLED, FAILED} (path mới duy nhất). `onInventoryCommitted` giữ guard PAID (COD confirm trước khi inventory.committed về — event đến lúc DELIVERED, guard no-op an toàn).
- `AdminOrderController.deliver` (đã có): khi `paymentMethod=cod` → gọi payment capture REST (sau transition, ngoài tx, idempotency key `cod-capture:<orderId>`) + emit outbox `order.paid` `{orderId, paymentIntentId, paidAt}` (delay nhỏ sau capture OK) → inventory commit lúc giao. Deliver 2 lần/claim 409 nhờ guard SHIPPED; capture idempotent.
- inventory KHÔNG đụng (không phải file SF-13): bind `order.paid` sẵn. TTL window CONFIRMED→DELIVERED > 30' sẽ release reservation (hole nhỏ — ADR ghi, chấp nhận demo-scale).
- TTL sweeper: COD order CONFIRMED ngay → không bao giờ dính PENDING stale ✓.

### 2.3 catalog-service (A3 upload + A6b related + A7b CSV)
- Upload: dep `io.minio:minio:8.5.x`. `MinioConfig`: client endpoint `${catalog.minio.endpoint:http://localhost:9000}`, creds `${MINIO_ROOT_USER:-minioadmin}/...`, bucket `products` (tự tạo nếu thiếu, public-read anonymous download). `AdminUploadController` (pattern AdminProductController): `POST /api/catalog/admin/uploads` (ADMIN) — multipart `file`, validate ≤5MB + content-type/extension ∈ {jpg,jpeg,png,webp} → object `products/<uuid>.<ext>` → trả `{url:"/media/products/<uuid>.<ext>"}`. FE gắn url vào product images (child rows `product_images` — sẵn).
- Related (runtime endpoint, ADR): `GET /api/catalog/products/{slug}/related?size=8` — public. `EsEngine.related(slug, size)`: fetch doc theo slug trước (lấy name.vi/en + categorySlugs + tags) → `more_like_this` trên `name.vi, name.en, description.vi, description.en` (min_term_freq 2, min_doc_freq 2, max_query_terms 12) + filter `status:PUBLISHED` + `must_not _id self` + boost same category (filter term categorySlugs bất kỳ) → hydrate `ProductCardDto` qua PG (pattern `hydrateCards` sẵn). Fallback PgFtsEngine/ES-down: cùng category mới nhất (không crash). Không phải Published/không có → 404? Trả page rỗng (200) — PDP ẩn section khi empty.
- CSV export: `GET /api/catalog/admin/products/export.csv` (ADMIN, `text/csv`, `Content-Disposition attachment`) — stream `StreamingResponseBody`, batch query 500 dòng, cột: id,slug,name_vi,brand,price,compare_price,discount_percent,status,rating_avg,created_at. UTF-8 BOM (Excel tiếng Việt).

### 2.4 cart-service (A4 abandoned)
- `CartDocument` thêm `String email` (nullable, additive — cart cũ không có → null, bỏ qua sweep đến lần mutation sau có email). `CartController`: mọi mutation authenticated set `email` từ JWT claim.
- `AbandonedCartSweeper @Scheduled(fixedDelayString "${cart.abandoned.sweep-interval-ms:60000}")` + `@EnableScheduling` trên Application: SCAN `cart:user:*` → items ≥1 + `updatedAt` trước `now - cart.abandoned.idle-minutes:120` + có email + flag `cart:abandoned_notified:<userSub>` vắng (SET NX EX 24h) → publish RabbitTemplate direct: `EventEnvelope.of("cart-service","cart.abandoned",corr,payload)` + headers eventType (mimic OutboxRelay.toAmqpMessage) → exchange `ecommerce.events`, key `cart.abandoned`, payload `{userId, email, itemCount, updatedAt}` (fat — email phải nằm trong payload, precedent SKIPPED_NO_EMAIL). Flag set TRƯỚC publish (at-most-once, chấp nhận mất 1 mail khi crash — email không critical). Gating `cart.abandoned.enabled:true`. ADR ghi deviation "cart không outbox" (D8 — không DB).
- notification: queue `notification.carts` bind `cart.abandoned` → `AbandonedCartMailer` (pattern ThankYouMailer, link `${notify.cart-url:http://localhost:5173/cart}`) + SendLog + IdempotentConsumer.

### 2.5 log-service (A5 audit viewer)
- Thêm `SecurityConfig` + `JwtDecoderConfig` (copy catalog pattern — JWKS URI env / PEM fallback), `requestMatchers("/api/log/admin/**").hasRole("ADMIN")`, còn lại authenticated? Log-service không có endpoint public nào → permit actuator health + deny其余 (anyRequest().authenticated() đủ).
- `AdminEventController`: `GET /api/log/admin/events?eventType&from&to&page=1` (size cố định 50) — MongoTemplate: Criteria `eventType` eq + `occurredAt` gte/lte (Instant parse ISO), sort `occurredAt DESC`, skip/limit, count riêng → `{items:[{id,eventId,eventType,occurredAt,correlationId,payload}], page, size, total}`. Compound index `idx_type_occurred` đã có từ SF-10 ✓.
- Gateway: route `/api/log/**` → `${LOG_URI:http://localhost:8088}` (không StripPrefix — controller giữ full path, precedent catalog); `admin-prefixes` thêm `/api/log/admin/**`.

### 2.6 notification-service (A1/A4/A8 templates)
- 3 mailer mới cùng pattern `ThankYouMailer` (inline HTML text block, sender `notify.mail.from`): `PasswordResetMailer` (link reset, cảnh báo "không yêu cầu → bỏ qua"), `AbandonedCartMailer` (tên + số sản phẩm + link /cart), `WelcomeNewsletterMailer` (chào + coupon center link).
- `RabbitMqConfig`: thêm queues `notification.password_reset`, `notification.carts`, `notification.newsletter` + bindings `user.password_reset_requested`, `cart.abandoned`, `user.newsletter_subscribed`. 3 consumer (IdempotentConsumer + SendLog, skip-no-email guard).

## 3. Frontend wiring (additive đúng slice)

- **mfe-account**: `ForgotPasswordPage.tsx` (email → 202 → banner "kiểm tra email"), `ResetPasswordPage.tsx` (`?token=` từ `window.location.search`, password mới → 204 → link /login). UI-kit Input/Button/Card, error pattern ApiErrorClient, hardcoded vi (pattern hiện có). `vite.config.ts` exposes thêm 2 page; shell `App.tsx` lazy import + dispatch `/forgot-password`, `/reset-password`; gateway shell-web predicate thêm 2 path.
- **mfe-checkout**: step 3 thêm radio "Thẻ quốc tế (Stripe)" / "COD — Thanh toán khi nhận hàng" (default stripe, persistence useState); `orderingApi.createOrder` nhận `paymentMethod` (bỏ hardcode 'stripe'); COD → sau 201 với `clientSecret === null` → `finalize(order)` ngay (skip mount Stripe + payUnavailable logic giữ nguyên cho stripe path). data-testid cho e2e: `payment-method-cod`, `place-order-btn`.
- **mfe-admin**: (1) `AuditPage.tsx` mới — filter eventType (input), from/to (datetime-local), table time/type/correlation/payload preview (JSON string slice), pagination prev/next; route `audit` + ADMIN_NAV + i18n `admin.nav.audit` (vi+en); fetch authed qua `authStore.fetch` (không có contracts client cho log). (2) ProductFormPage images tab: nút "Tải ảnh lên" → `uploadAdminImage` (contracts client có sẵn) → set row.url. (3) Orders/Products list: nút "Xuất CSV" (head actions) → authed fetch blob download. (4) `NewsletterPage.tsx` đơn giản — table email/ngày. (5) vite proxy thêm `/media` → gateway (preview ảnh).
- **storefront-web**: (1) `RecentlyViewed` client island ở home (sau featured): đọc localStorage `recently_viewed` (PDP ghi: `{slug, name, price, comparePrice, discountPercent, image, at}`, max 12, dedupe theo slug, newest-first), render card mini + gradient fallback, ẩn khi trống. (2) PDP: SSR fetch `related` (thêm method `catalogApi`) → section "Sản phẩm tương tự" dùng `ProductCardView` (docstring đã reserve), ẩn khi rỗng; client island `RecentlyViewedTracker` ghi localStorage lúc mount. (3) Footer: newsletter client island (email input + nút → POST `/api/identity/newsletter` qua Next rewrite → success/error message; dup email → thông báo "đã đăng ký" — vẫn 204). (4) GA4: `app/layout.tsx` — `NEXT_PUBLIC_GA_ID` có → next/script gtag.js + init; `GaPageview` client component (usePathname → gtag page_view mỗi navigation). next.config.mjs rewrite `/media/:path*` → gateway (ảnh PDP). COPY pattern vi/en inline.
- **shell**: `main.tsx` — `import.meta.env.VITE_GA_ID` có → inject gtag.js + config; pageview hook theo router (`usePath`). Purchase event: `mfe-checkout/ConfirmationPage` — khi `TERMINAL_OK` lần đầu → `window.gtag?.('event','purchase',{transaction_id: orderId, value: total, currency:'VND'})` (guard typeof, shell đã load script).
- **i18n**: keys mới `admin.nav.audit`, `admin.audit.*`, `admin.orders.exportCsv`, `admin.products.exportCsv`, `admin.newsletter.*` cả vi+en catalogs. Storefront + mfe-account giữ COPY-hardcode pattern hiện có.

## 4. Infra (append-only)

- `docker-compose.yml`: append block `minio` (`minio/minio:RELEASE.2024-09-13T20-26-02Z`, command `server /data --console-address ":9001"`, ports 9000/9001, env MINIO_ROOT_USER/PASSWORD=minioadmin, volume `miniodata`, healthcheck curl `/minio/health/live`, network ecommerce-net) + one-shot `minio-init` (`minio/mc`: alias → `mb -p local/products` → `anonymous set download local/products`, depends_on minio healthy, restart "no"). Volume `miniodata` khai báo cuối file.
- `gateway-routes.yml`: append `media` route (`/media/**` → `${MINIO_URI:http://localhost:9000}` + `RewritePath=/media/(?<seg>.*), /$\{seg}`) + `log` route (`/api/log/**` → 8088).
- `gateway-auth.yml`: public-paths + admin-prefixes như trên.
- `.env.example`: append SF-13 block (NEXT_PUBLIC_GA_ID/VITE_GA_ID rỗng, MINIO_ROOT_USER/PASSWORD, catalog.minio.endpoint, notify.reset-password-url, cart.abandoned keys) — append-only.
- Không cần Makefile change (make infra compose up -d tự chứa minio; `make dev` boot svc theo list — minio là infra container).

## 5. Tests (IT cho từng dòng ACCEPTANCE + E2E regression)

- **identity**: `PasswordResetIT` — forgot unknown email → 202 giống hệt (anti-enum); forgot known → token hash trong DB + event trong outbox; reset sai token → 401; reset OK → login mật khẩu mới 200, mật khẩu cũ 401, refresh token cũ đã revoke (refresh → 401). `NewsletterIT` — subscribe mới → 204 + row + outbox event; dup → 204 KHÔNG row thứ 2 KHÔNG event; admin list cần ADMIN token (401/403 anonymous/customer).
- **ordering**: `SagaTest` thêm `codCheckout_confirmedWithoutStripe` — createOrder(cod) không WireMock stripe → status CONFIRMED, clientSecret null, order.confirmed payload validate schema, coupon finalized; `codDeliver_capturesPayment_emitsOrderPaid` — ship → deliver → payment capture gọi (WireMock EXTERNAL đếm) + order.paid outbox row. `csvExportIT` — ADMIN stream CSV parse header + ≥1 dòng, customer → 403.
- **payment**: `CodPaymentAdapterTest` — createIntent no-op shapes; capture idempotent 2 lần → 1 row SUCCEEDED.
- **catalog**: `UploadIT` (testcontainers MinIO) — upload png 200 → URL `/media/products/<uuid>.png`, object tồn tại trong bucket; >5MB → 413/400; file .gif → 400; customer token → 403. `RelatedIT` (ES container) — seed 2 sản phẩm cùng category mô tả giống nhau → related trả product kia, không chứa self; sản phẩm không tồn tại → 200 rỗng. `csvExportIT` catalog tương tự.
- **cart**: `AbandonedCartTest` — redis cart user có email + items + updatedAt cũ (ghi trực tiếp key cũ) → chạy sweeper method trực tiếp → envelope publish (mock rabbit listener đếm qua queue real rabbit container? cart IT base chỉ redis+wiremock — thêm RabbitMQContainer như CartOrderConsumerTest đã làm) + flag SET NX; chạy lần 2 → KHÔNG publish nữa; cart mới update → không publish.
- **log**: `AdminEventsIT` — chèn 3 docs (2 type A 1 type B, occurredAt khác nhau) → GET filter eventType=A → 2 dòng sort desc; from/to filter đúng; anonymous → 401; customer → 403.
- **notification**: reset/abandoned/welcome consumer test — sendRaw envelope → Mailpit có mail đúng subject/to, SendLog SENT; dup eventId → 1 mail (idempotent).
- **E2E (`frontend/e2e/tests/`)**: `password-reset.spec.ts` (register → forgot → Mailpit API lấy link → trang reset đặt password mới → login lại OK; forgot email lạ → thông báo giống hệt), `cod-checkout.spec.ts` (add to cart → checkout chọn COD → đặt hàng → confirmation CONFIRMED, KHÔNG đụng Stripe), `upload-image.spec.ts` (admin → product form → upload png fixture → URL /media hiện + lưu → PDP thấy ảnh), `related-products.spec.ts` (PDP hiện "Sản phẩm tương tự" ≥1 card; về home thấy "Đã xem gần đây" có sản phẩm vừa xem). Chạy lại golden-path + admin-crud + saga-fail (regression, không được vỡ).

## 6. ACCEPTANCE mapping (context pack → kiểm chứng)

| # | ACCEPTANCE | Verify |
|---|---|---|
| 1 | Quên MK → Mailpit link → MK mới → login OK; email lạ không lộ | IT identity + E2E password-reset + browser flow |
| 2 | COD → CONFIRMED không cần Stripe | SagaTest cod + E2E cod-checkout + browser (không key) |
| 3 | Admin upload → ảnh trên PDP | UploadIT + E2E upload-image + browser |
| 4 | Bỏ giỏ ≥2h → email Mailpit | AbandonedCartTest + browser/manual Mailpit check |
| 5 | Admin audit log + filter | AdminEventsIT + browser audit page |
| 6 | PDP "Sản phẩm tương tự"; home "Đã xem gần đây" | RelatedIT + E2E + browser |
| 7 | GA4 pageview khi có env; CSV mở được Excel | script check + gtag debug + CSV parse IT + browser console |
| 8 | Newsletter → welcome email; dup không double | NewsletterIT + Mailpit + browser footer |
| 9 | E2E golden path cũ vẫn xanh | make e2e full suite |

## 7. Risks / mở đã ghi nhận

- Baseline tests đang chạy (log `/tmp/sf13-baseline-tests.log`) — phân biệt failure có sẵn.
- `.env` chưa có trên worktree → `cp .env.example .env` trước `make dev`/E2E.
- COD stock window (CONFIRMED→DELIVERED > TTL 30') — ADR ghi nhận, out of scope fix.
- `order.paid`-lúc-giao là ĐỌC của contract line "COD→PAID" — nếu coordinator hiểu khác, revert = 1 commit nhỏ (đã comment FI-310 trail).
- Gateway port 8080: máy này 8080 từng bị chiếm (memory) — kiểm trước make dev, nếu bận dùng GATEWAY_PORT riêng + env FE.
