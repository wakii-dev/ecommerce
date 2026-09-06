# SF-6 Cart + Checkout UX — Design Spec (FI-316)

> Date: 2026-09-06 · Status: Approved (autonomous — self-review + spec-critic passed)
> Epic: FI-310 · Context pack: `docs/superpowers/contexts/sf-6.md` · Phase 0: chat audit comment FI-316
> Contract authority: `contracts/openapi/{cart,ordering,payment}.yaml` (READ-ONLY, freeze SF-2 + amendment A1)

## 1. Problem

Epic có browse (SF-4) + auth (SF-3) + inventory/payment nền (SF-5) nhưng **chưa bán được hàng**: nút add-to-cart trên PDP mới chỉ stub, không có giỏ, không có checkout. SF-6 dựng luồng tiền demo được: guest thêm hàng → giỏ sống sót qua reload (cookie) → login merge giỏ → checkout 3 bước → **Stripe confirm THẬT** qua payment-service (SF-5) → confirmation. Đơn hàng là **mock** (ordering = SF-9, chưa tồn tại) — "thanh toán thật, đơn mock", stub gom 1 file để SF-10 thay.

## 2. Scope

**In:** cart-service (Redis, port 8083) · mfe-checkout remote (5175: /cart, /checkout, /order/confirmation) · CartBadge trên shell header (slot registry) · merge-on-login (authStore subscribe) · coupon UI theo contract shape (stub WELCOME10 = −10%) · Stripe.js PaymentElement + confirmCardPayment · gateway route (cart API + shell pages) · compose/.env append · storefront PDP wire (pack cho phép sửa nhỏ).

**Out (boundary pack):** ordering-service/coupon engine/saga (SF-9) · my-orders (SF-9) · COD (SF-13) · notification email (SF-10) · sửa `contracts/**` + `packages/**` + Header shell.

## 3. Architecture

```
PDP (Next :3000 via gateway :8080)
  └─ POST /api/cart/items?slug=… (credentials same-origin)
       └─ gateway → cart-service :8083
            ├─ Redis cart:guest:{token} | cart:user:{sub}
            ├─ enrich: catalog :8082 GET /api/catalog/products/{slug}
            └─ stock:  inventory :8084 GET /inventory/availability

Shell :5173 (hoặc :8080/cart qua gateway)
  ├─ CartBadge (mfe-checkout expose, slot 'right') ← event 'ecommerce:cart-changed'
  ├─ /cart, /checkout, /order/confirmation (lazy từ mfe-checkout)
  └─ initCheckoutShell: authStore.subscribe → login false→true → POST /api/cart/merge

Checkout submit (stub ON):
  orderingStub.createOrder → shape ordering.yaml (PENDING, mock)
    ├─ coupon: validateCoupon stub (WELCOME10 → −10% floor)
    └─ clientSecret: POST /api/payment/intents (THẬT, SF-5 live)
         └─ Stripe.js confirmPayment(card 4242 ✓ / 4000…0002 ✗)
              └─ ok → clear cart (DELETE từng item) → /order/confirmation
```

### 3.1 cart-service

- **Stack:** spring-boot-starter-web + data-redis + security + oauth2-resource-server + actuator + springdoc + common-lib (ApiError/GlobalExceptionHandler/RequestIdMdcFilter). **KHÔNG DB, KHÔNG RabbitMQ** (SF-6 không publish/consume events — cart clear sau payment là việc stub FE).
- **Redis model:** key `cart:guest:{uuid}` / `cart:user:{sub}` → JSON (`StringRedisTemplate` + Jackson, pattern catalog RedisConfig): `{items: [{id, productId, variantId?, qty, slug?, name?, image?, unitPrice?, lineTotal?}], updatedAt}`. TTL 30 ngày, refresh mỗi write. Line id = UUID sinh server. Line identity = `productId + (variantId ?? null)`.
- **Auth:** SecurityConfig permitAll + oauth2ResourceServer — JWT có mặt → validate (sai token → 401), `sub` = user cart; không token → guest theo cookie `cart_token` (HttpOnly, SameSite=Lax, **Path=/api/cart**, Max-Age 30d). JwtDecoder copy pattern catalog (PEM local hoặc JWKS).
- **Endpoints (đúng contract):**
  - `POST /api/cart` → 201 + Set-Cookie (guest chưa có giỏ).
  - `GET /api/cart` → 200 (enrich live) / **404 guest chưa có** (contract thắng pack — không auto-create).
  - `POST /api/cart/items` `{productId, variantId?, qty, allowOos?}` + query hint `?slug=` → auto-create giỏ khi guest mới; enrich snapshot; catalog 404 → **404**; variant OOS & !allowOos → **409**; response Cart mới nhất.
  - `PATCH /api/cart/items/{itemId}` `{qty}` → qty<1 → 400; vượt stock → 409; item không tồn tại → 404.
  - `DELETE /api/cart/items/{itemId}` → 200 Cart sau xóa. *(Pack có `DELETE /api/cart` nhưng contract freeze không có → không implement, clear-cart là việc FE xóa từng item.)*
  - `POST /api/cart/merge` (JWT bắt buộc) `{cartToken}` (fallback cookie) → gộp dedupe line identity (cộng qty), enrich lại, xóa giỏ guest + expire cookie; guest không tồn tại → 404.
- **Enrichment (mỗi GET/ghi):** từng item có slug → catalog GET theo slug: 200 → cập nhật name/image/unitPrice (variant: `price + variants[].priceDelta`), lineTotal = qty × unitPrice; **404 (draft/deleted/slug đổi) hoặc lỗi mạng/timeout → `unavailable: true`, giữ snapshot cũ, KHÔNG tự xóa** (§6.1.2). Item variant thêm check inventory: available=0 → unavailable. Catalog/inventory chết = degraded (unavailable), không 500.
- **Subtotal** = Σ lineTotal **các item khả dụng** (contract). `unavailable` item không bị chặn checkout phần còn lại (stub order chỉ nhận item khả dụng).

### 3.2 mfe-checkout (remote `mfe_checkout`, port 5175)

- **exposes:** `./bootstrap` (initCheckoutShell), `./CartBadge`, `./CartPage`, `./CheckoutPage`, `./ConfirmationPage`.
- **API layer (`lib/cartApi.ts`):** fetch same-origin `/api/**` (credentials include) + local TS types mirror contract yaml (camelCase). **Không import generated client cho cart** — `cartSchema.d.ts` chưa reflect A1 (variantId vẫn `required`); pattern `executeRequest` của SF-3 là precedent xử gap, ở đây raw fetch + types tay sạch hơn. Toàn bộ mutation xong → `window.dispatchEvent('ecommerce:cart-changed')`.
- **Guest cartToken cache:** response body `Cart.cartToken` (chỉ guest) → localStorage `ecommerce.guest_cart_token` — nguồn cho merge body (cookie httpOnly không đọc được từ JS; server vẫn nhận cookie fallback).
- **lib/orderingStub.ts (1 file duy nhất chạm ordering — SF-10 thay):** toggle `VITE_ORDERING_STUB !== '0'`.
  - `validateCoupon(code, subtotal)` → `ValidateCouponResponse`: `WELCOME10` → valid, `discount = floor(subtotal × 10 / 100)`; code khác → `{valid:false, discount:0, message}`.
  - `createOrder(req)` → build `CreateOrderRequest` đúng shape (items chỉ item khả dụng, address, shippingMethod `standard`, couponCode?, Idempotency-Key uuid) → mock `Order` (id `mock-…`, status PENDING, subtotal/discount/shippingFee/total tự tính) → gọi **THẬT** `POST /api/payment/intents` `{orderId, amount: total, currency:'VND', idempotencyKey}` → `clientSecret`. Payment 503/unconfigured → throw `PaymentUnavailableError` (FE rơi mock panel). Không đụng gateway route ordering (chưa tồn tại).
- **Cart page:** danh sách line (ảnh, tên link PDP theo slug, giá, qty stepper −/+, remove) · badge `Không còn khả dụng` + line không tính subtotal, không sửa qty (chỉ remove) · summary subtotal (từ server) · CTA "Thanh toán" → /checkout · empty state + link về trang chủ.
- **Checkout (stepper 3 bước, state giữ khi back/forward bước):**
  1. **Địa chỉ:** fullName, phone, line1, ward, district, city (đủ `Address` contract — required validation client).
  2. **Vận chuyển:** flat fee `VITE_SHIPPING_FLAT_FEE` (default 25000₫, format VND), shippingMethod `standard`.
  3. **Thanh toán + review:** coupon box (input → validateCoupon stub → hiển thị −số tiền / message lỗi) · review items + subtotal/discount/shipping/total · **Stripe:** `loadStripe(VITE_STRIPE_PUBLISHABLE_KEY)` + `Elements {clientSecret}` + PaymentElement + `confirmPayment({redirect:'if_required'})` — 4242 → success; 4000…0002 → lỗi trả về UI (đơn vẫn mock). Không publishable key hoặc payment 503 → **mock pay panel + cảnh báo "Chưa cấu hình thanh toán — đơn demo không trừ tiền"** (nút "Đặt hàng (demo)").
  - Guest vào /checkout → banner "Đăng nhập để thanh toán" + link /login (POST /orders là bearerAuth). Không chặn /cart cho guest.
- **Confirmation `/order/confirmation`:** đọc order từ sessionStorage (`ecommerce.last_order` — stub không có server persist) → cảm ơn + order summary + trạng thái "Đang xử lý" (CONFIRMED mock) · rơi vào mà không có order → empty state.
- **CartBadge:** mount → `GET /api/cart` (404 → 0) → badge `Σ qty`; lắng nghe `ecommerce:cart-changed` → re-fetch; click → navigate /cart. Không badge khi 0 (trừ khi cart có item).
- **Bootstrap:** `initCheckoutShell(ctx)` — register CartBadge vào slot 'right' (`ctx.onRegistryChange`), `authStore.subscribe`: authenticated false→true → nếu localStorage có guest token → `POST /api/cart/merge` (qua authStore.fetch — tự gắn Bearer) → xong clear localStorage token + dispatch cart-changed; 404 (giỏ guest hết) → clear token im lặng.

### 3.3 Shell wiring (append-only từng block)

- `vite.config.ts`: remotes + `checkout` (name `mfe_checkout`, entry `REMOTE_CHECKOUT_URL`/5175).
- `remotes.d.ts`: declare `checkout/bootstrap|CartBadge|CartPage|CheckoutPage|ConfirmationPage`.
- `main.tsx`: eager `import('checkout/bootstrap').then(m => m.initCheckoutShell({...}))` — catch warn (remote down không chặn shell), pattern mfe-account.
- `App.tsx`: routes `/cart`, `/checkout`, `/order/confirmation` lazy + ErrorBoundary fallback pattern account.
- **KHÔNG sửa Header.tsx** (slot registry là cơ chế).

### 3.4 Gateway + compose + env (append-only)

- `gateway-routes.yml`: un-comment block cart (port 8083, **KHÔNG StripPrefix** — controller map full `/api/cart/**`, precedent SF-4) + append block shell pages `/cart,/checkout,/order/confirmation,/login,/register,/account` → :5173 (same-origin cookie jar xuyên PDP→login là điều kiện sống của merge acceptance; /login… là route shell SF-3 chưa ai append).
- `docker-compose.yml`: append `cart-service` (profile `full`, REDIS_HOST=redis, không datasource).
- `.env.example`: `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx` + `VITE_SHIPPING_FLAT_FEE=25000` + `VITE_ORDERING_STUB=1`.
- `backend/pom.xml`: + module `services/cart-service`. Makefile đã wire sẵn (`svc=cart`, `dev-fe app=mfe-checkout`).

### 3.5 Storefront PDP wire (sửa nhỏ được pack cho phép)

- `PdpBuyBox.tsx` truyền `slug` vào AddToCart (đã có sẵn trong PDP data).
- `AddToCart.tsx`: POST kèm `?slug=`; thành công → toast "Đã thêm vào giỏ" (thay toast stub) + dispatch `ecommerce:cart-changed` + lưu cartToken localStorage; "MUA NGAY" → thêm rồi điều hướng `/cart`. Lỗi network → giữ toast êm cũ.

## 4. Error handling (tổng hợp)

| Lỗi | Hành vi |
|---|---|
| Catalog 404/không reachable | item `unavailable: true`, giữ snapshot, không chặn phần còn lại |
| Inventory 0 (variant) | add/patch → 409 (nếu !allowOos); GET → unavailable |
| Guest GET chưa có giỏ | 404 → badge 0, cart page empty state |
| Merge guest token hết hạn | 404 → FE clear token, không lỗi user |
| Payment 503/unconfigured | mock pay panel + cảnh báo rõ |
| Stripe declined (4000…0002) | message lỗi Stripe lên UI, đơn không finalize |
| Remote mfe-checkout down | shell warn + fallback EmptyState (không trắng trang) |

## 5. Testing

- **cart-service (JUnit, tên `*Test` — surefire, không `*IT`):** `CartStoreTest` (Redis Testcontainers singleton — CRUD/TTL/dedupe) · `CartApiTest` (guest cookie flow 201/404/add/patch/delete + 400/404/409) · `MergeCartTest` (JWT mint pattern catalog IT, merge gộp qty + invalidate guest) · `CartEnrichmentTest` (WireMock catalog + inventory: enrich live / 404→unavailable / degraded timeout). Copy `docker-java.properties` (api.version=1.44) + harness singleton per JVM.
- **mfe-checkout (vitest):** orderingStub (WELCOME10 floor math, invalid shape, createOrder payload + payment call), cartStore event dispatch, Address validation, review total math (subtotal − discount + shipping).
- **Shell:** `tsc --noEmit` xanh (remotes.d.ts khớp expose thật).
- **Verify (Phase 5):** từng dòng ACCEPTANCE pack qua browser thật (Rule 0 3 tầng).

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Enrichment slug-hint lệch nếu product đổi slug | chấp nhận (unavailable ≠ mất item); fix đúng = id-lookup (REQUIREMENT-GAP FI-310, SF-10) |
| R2 | pnpm-lock churn khi thêm @stripe/stripe-js | lockfile append-only, coordinator serialize lúc merge |
| R3 | SF-7/8/9 song song đụng gateway-routes/compose/Makefile | append-only block có comment SF-6, không sửa block người khác |
| R4 | Stripe publishable key thiếu trên máy demo | nhánh mock panel là acceptance có sẵn, không crash |
| R5 | Merge race khi user login ở 2 tab | merge idempotent theo line identity (cộng qty); chấp nhận cho demo tier |
