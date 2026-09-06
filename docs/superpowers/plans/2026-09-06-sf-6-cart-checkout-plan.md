# SF-6 Cart + Checkout UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Luồng tiền demo được — guest cart Redis (cart_token cookie) + merge-on-login + cart page + checkout 3 bước (coupon stub WELCOME10, Stripe.js confirm THẬT) + confirmation + CartBadge trên shell.

**Architecture:** cart-service Spring Boot (Redis thuần, KHÔNG DB/Rabbit, port 8083) enrich qua catalog/inventory REST; mfe-checkout remote Vite MF (5175) expose CartBadge + 3 pages; ordering = FE stub 1 file (`lib/orderingStub.ts`) nhưng clientSecret lấy THẬT từ payment-service (SF-5). Shell tích hợp qua slot registry + manifest append-only.

**Tech Stack:** Java 21 + Boot 3.3.5 + spring-data-redis + oauth2-resource-server · React 18 + Vite MF 2.0 + @stripe/stripe-js · vitest · Testcontainers Redis + WireMock.

**Linear Issue:** FI-316 · **Spec:** `docs/superpowers/specs/2026-09-06-sf-6-cart-checkout-design.md` · **Worktree:** sf-6-cart-checkout

---

## 0. Root cause analysis

### Root cause
Epic build theo tier: T2 xong mới có browse/auth/payment nền, T3 mới dựng giao dịch. Cart/checkout là Tier-3 — đến giờ chưa tồn tại, không phải bug của SF cũ.
### Current state
PDP có nút add-to-cart nhưng chỉ POST ra endpoint không tồn tại → toast "Giỏ hàng sẽ sớm khả dụng". Không có /cart, /checkout. Guest không thể mua.
### Expected outcome
Guest thêm 2 sản phẩm từ PDP thật → badge shell = 2 → reload còn (cookie) → login merge đúng → checkout 3 bước → Stripe confirm (thật với key; mock panel không key) → confirmation.
### Constraints & hardships
Ordering là SF-9 (chưa có) → mọi order/coupon qua STUB; cart_token httpOnly → merge token phải lấy từ response body; catalog không có id-lookup → enrich qua slug hint; generated TS chưa reflect A1 → FE dùng fetch + types tay.
### High-level strategy
Contract-first theo cart.yaml freeze; stub cô lập 1 file để SF-10 thay; integrate shell/gateway/compose bằng append-only blocks; test theo tầng (unit store → API Testcontainers → browser walkthrough).

## 1. Problem
Khách duyệt được nhưng không mua được — epic chưa có luồng tiền; SF-6 là phần UX giao dịch đầu tiên.

## 2. Scope
- **In:** cart-service (7 endpoints theo cart.yaml) · mfe-checkout (cart/checkout/confirmation + badge) · shell wiring · gateway routes · PDP wire · compose/env append · tests.
- **Out:** ordering-service/coupon engine/saga (SF-9) · my-orders (SF-9) · COD (SF-13) · email (SF-10) · sửa contracts/packages/Header.
- **Success criteria (observable):** từng dòng ACCEPTANCE trong `docs/superpowers/contexts/sf-6.md` (badge=2, reload còn, merge qty gộp, unavailable không chặn, WELCOME10 −10%, 4242 thành công / 4000…0002 lỗi UI, mock panel khi không key).

## 3. Touch map
- **Create:** `backend/services/cart-service/**` · `frontend/apps/mfe-checkout/**`
- **Modify:** `backend/pom.xml` (+module) · `backend/gateway/src/main/resources/gateway-routes.yml` (un-comment cart KHÔNG strip + append shell pages) · `frontend/apps/shell/{vite.config.ts,src/remotes.d.ts,src/main.tsx,src/App.tsx}` (append block) · `frontend/apps/storefront-web/components/pdp/{PdpBuyBox.tsx,AddToCart.tsx}` (wire slug + event) · `frontend/pnpm-workspace.yaml` (+@stripe/stripe-js catalog) · `frontend/pnpm-lock.yaml` (regen) · `docker-compose.yml` (cart block profile full) · `.env.example` (3 dòng VITE_)
- **Shared surfaces:** gateway routes (append-only) · compose (append-only) · lockfile (regen, coordinator serialize lúc merge)

## 4. Design
- **Approach A (chọn):** đúng spec `2026-09-06-sf-6-cart-checkout-design.md` — enrichment slug-hint, stub 1 file, cookie httpOnly + token từ response body.
- **Alternatives bỏ:** sửa catalog (vi phạm READ-ONLY + đụng SF-8) · FE gửi snapshot giá (client quyết giá) · checkout guest (contract POST /orders bearerAuth).
- **Edge cases:** catalog chết lúc add → nhận item un-enriched (unavailable ở GET) · catalog 404 lúc add → reject 404 · all-unavailable → CTA disable · merge guest hết hạn → 404 nuốt êm · Stripe declined → lỗi UI, không finalize · remote down → shell fallback.
- **Non-functional:** security (JWT validate khi có, httpOnly cookie, không client-price) · perf (enrichment N≤vài item/request) · a11y (label form, role=status cho toast/badge) · i18n (vi hardcode như mfe-account precedent).

## 5. Implementation outline
- **Tasks (14, theo bracket):** backend 1-5 → FE 6-12 → wire 13 → tests 14. Chi tiết từng task bên dưới.
- **File structure:** cart-service theo pattern catalog (config/web/domain/service/repo→store); mfe-checkout theo mfe-account (bootstrap/pages/lib + page.css).
- **Testing strategy:** vitest cho stub/store/math; JUnit `*Test` (không `*IT`) + Testcontainers Redis singleton + WireMock catalog/inventory; cuối: browser walkthrough 3 tầng (Rule 0).

## 6. Risks & unknowns
- **Must verify trước T7:** identity-service chạy được từ worktree này (8081 bị keycloak chiếm → SERVER_PORT=8091 + gateway private :8090 cho walkthrough).
- **Unverified:** Stripe publishable key chưa có trên máy → nhánh 4242 thật cần user đặt key; verify fallback mock panel + wiring thật (payment 503 = chứng minh call thật).

---

### Task 1: cart-service-scaffold

**Files:** Create `backend/services/cart-service/pom.xml`, `src/main/java/com/ecommerce/cart/CartServiceApplication.java`, `src/main/resources/application.yml`, `src/test/resources/docker-java.properties`; Modify `backend/pom.xml` (module append).

- [ ] **Step 1:** pom.xml — parent `ecommerce-backend`, deps: web, data-redis, actuator, security, oauth2-resource-server, springdoc, common-lib, starter-test. KHÔNG jpa/flyway/postgres/amqp.

```xml
<dependency>
  <groupId>com.ecommerce</groupId>
  <artifactId>common-lib</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

- [ ] **Step 2:** Application — `@SpringBootApplication(scanBasePackages = {"com.ecommerce.cart", "com.ecommerce.common.web"})` — **LẤY common.web (ApiError handler + requestId), LOẠI common.outbox** (cart không JPA/Rabbit — OutboxRelay sẽ chết context). Javadoc ghi rõ deviation.

- [ ] **Step 3:** application.yml — port 8083, `spring.data.redis` host/port env (`REDIS_HOST:localhost:6379`), springdoc, management health show-details; KHÔNG datasource/flyway/rabbit. Env `CATALOG_BASE_URL:http://localhost:8082`, `INVENTORY_BASE_URL:http://localhost:8084`, `JWT_PUBLIC_KEY_PATH:../infra/keys/jwt-public.pem`, `CART_TTL_DAYS:30`.

- [ ] **Step 4:** Config classes: `RedisConfig` (StringRedisTemplate bean — copy catalog), `JwtDecoderConfig` (copy catalog — PEM walk + JWKS env), `SecurityConfig`:

```java
@Bean
SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder jwtDecoder,
                               JwtAuthenticationConverter converter) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable)
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/actuator/**", "/v3/api-docs/**", "/swagger-ui/**").permitAll()
            .anyRequest().permitAll()) // identity tự xử: JWT có → validate 401 sai; guest anonymous
        .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(jwtDecoder).jwtAuthenticationConverter(converter)));
    return http.build();
}
```

- [ ] **Step 5:** `backend/pom.xml` append `<module>services/cart-service</module>` dưới comment SF-6. Copy `docker-java.properties` (api.version=1.44).
- [ ] **Step 6:** Build: `cd backend && mvn -pl services/cart-service -am compile -q` → PASS. Commit `feat(cart): scaffold cart-service (SF-6) — redis-only, no db/amqp, optional-jwt security`.

### Task 2: redis-cart-guesttoken-user

**Files:** Create `domain/CartModels.java` (record LineItem/CartDocument), `store/CartStore.java`, `web/dto/CartDtos.java` (Cart/CartItem response mirror cart.yaml), `service/CartService.java`.

- [ ] **Step 1:** Model — LineItem `{id UUID, productId UUID, variantId UUID|null, qty int, slug String|null, name String|null, image String|null, unitPrice long}`; CartDocument `{items List<LineItem>, updatedAt Instant}`. Response DTO camelCase: `CartItem{id, productId, variantId?, slug?, name?, image?, qty, unitPrice, lineTotal, unavailable}` + `Cart{cartToken?, items[], subtotal}` — `@JsonInclude(NON_NULL)`.
- [ ] **Step 2:** CartStore — StringRedisTemplate + ObjectMapper:

```java
public static String guestKey(String token) { return "cart:guest:" + token; }
public static String userKey(String sub) { return "cart:user:" + sub; }

public Optional<CartDocument> load(String key);
public CartDocument save(String key, CartDocument doc); // TTL 30d refresh mỗi write
public void delete(String key);
public Optional<String> newGuestToken(); // UUID
```

Line identity helper: `sameLine(a, b) = a.productId equals b.productId && Objects.equals(a.variantId, b.variantId)`.
- [ ] **Step 3:** Unit test `CartStoreTest` — Testcontainers `GenericContainer("redis:7")` singleton static (pattern AbstractIntegrationTest — start 1 lần static init, **KHÔNG @Container per-class**), `@DynamicPropertySource` trỏ host/port; test save/load roundtrip JSON, TTL set, delete, sameLine dedupe cases (variant null vs present ≠ same).
- [ ] **Step 4:** `mvn -pl services/cart-service test -Dtest=CartStoreTest` → PASS. Commit `feat(cart): redis cart store guest/user + line identity (SF-6)`.

### Task 3: cart-crud-apis (enrichment + cookie)

**Files:** Create `service/CatalogEnricher.java`, `service/InventoryChecker.java`, `web/CartController.java`, `web/CookieSupport.java`; Test `CartApiTest.java`.

- [ ] **Step 1:** CatalogEnricher — RestClient (`CATALOG_BASE_URL`, timeout 2s): `Optional<ProductView> fetchBySlug(String slug)` gọi `GET /api/catalog/products/{slug}` (catalog KHÔNG strip — full path). ProductView `{name, image{url}, price, variants[]{id, priceDelta}}`. Phân biệt: 404 → `PRODUCT_MISSING`; lỗi mạng/5xx/timeout → `CATALOG_DOWN`. unitPrice = price + variant.priceDelta (variant item).
- [ ] **Step 2:** InventoryChecker — RestClient: `Map<variantId, available>` từ `GET /inventory/availability?variantIds=a,b` (inventory CÓ strip — controller map `/inventory`); lỗi → empty map (skip check).
- [ ] **Step 3:** CartController `@RequestMapping("/api/cart")` — identity resolution helper: `Authentication` instanceof Jwt → `sub`; else cookie `cart_token`; else none.

  - `POST ""` → tạo guest cart (token mới, rỗng) → 201 + `Set-Cookie: cart_token=<uuid>; HttpOnly; SameSite=Lax; Path=/api/cart; Max-Age=2592000` (ResponseCookie) + Cart rỗng.
  - `GET ""` → guest không có cookie/ cart hết → **404** problem+json; user không có giỏ → 200 giỏ rỗng (user cart auto-create nhẹ khi JWT — trả rỗng, chưa ghi Redis cho đến lần write đầu; ĐƠN GIẢN: tạo luôn key user rỗng).
  - `POST "/items?slug="` body AddItem `{productId, variantId?, qty≥1, allowOos?}`:
    1. resolve giỏ (guest auto-create **+ Set-Cookie trên response này** / user)
    2. enrich: slug có → fetch; `PRODUCT_MISSING` → **404** `product_not_found`; `CATALOG_DOWN` → nhận item un-enriched (unitPrice 0, unavailable-flag nội bộ)
    3. variant + không allowOos: available < requested → **409** `out_of_stock` (detail variantId)
    4. dedupe sameLine → cộng qty (max 99), else thêm line id UUID mới
    5. trả Cart enriched 200.
  - `PATCH "/items/{itemId}"` `{qty≥1}` → 404 nếu không thấy line; variant qty>available → 409; trả Cart.
  - `DELETE "/items/{itemId}"` → trả Cart sau xóa (200, không 204).
- [ ] **Step 4:** GET/write flow enrich từng item (nhưng chưa dùng unavailable — Task 5): name/image/unitPrice refresh từ snapshot khi catalog down; subtotal = Σ lineTotal (Task 5 lọc unavailable).
- [ ] **Step 5:** `CartApiTest` — Redis container + MockMvc/full-context: guest flow cookie captured (201 → Set-Cookie header assert), POST items auto-create + cookie, GET không cookie → 404, PATCH qty 0 → 400, DELETE trả cart, PATCH line lạ → 404, **add khi catalog chết (WireMock shutdown) → 200 + line unitPrice 0** (khóa pin spec). JWT guest/user tách giỏ (mint token pattern keypair IT).
- [ ] **Step 6:** Run tests → PASS. Commit `feat(cart): cart CRUD APIs + guest cookie + catalog/inventory clients (SF-6)`.

### Task 4: merge-on-login-endpoint

**Files:** Modify `web/CartController.java` (+POST /merge), `service/CartService.java` (+merge logic); Test `MergeCartTest.java`.

- [ ] **Step 1:** `POST "/merge"` — **JWT bắt buộc** (anonymous → 401 qua security: path này KHÔNG permitAll vô điều kiện — thêm rule `.requestMatchers(HttpMethod.POST, "/api/cart/merge").authenticated()` TRƯỚC anyRequest permitAll). Body `MergeCartRequest{cartToken}` required (400 khi thiếu); fallback cookie chỉ khi body rỗng (leniency).
- [ ] **Step 2:** merge: load guest key (không tồn tại → 404 `guest_cart_not_found`) → với từng guest line: sameLine trong user cart → cộng qty, else thêm line → save user key (enrich lại) → delete guest key → response Set-Cookie expire (`Max-Age=0`) + Cart user.
- [ ] **Step 3:** `MergeCartTest` — guest thêm 2 line (1 trùng productId+variant với user line) → merge → user cart gộp qty đúng, không mất line; guest key biến mất; cookie expire header; 401 khi không JWT; 404 token sai.
- [ ] **Step 4:** Run → PASS. Commit `feat(cart): merge-on-login endpoint — dedupe line identity + invalidate guest (SF-6)`.

### Task 5: removed-product-filter (unavailable + subtotal)

**Files:** Modify `service/CartService.java`, `web/dto/CartDtos.java` (unavailable field); Test `CartEnrichmentTest.java` (WireMock).

- [ ] **Step 1:** Enrichment flow hoàn chỉnh mỗi GET/write: item có slug → fetch catalog: 200 → refresh name/image/unitPrice; `PRODUCT_MISSING` → `unavailable=true` giữ snapshot; `CATALOG_DOWN` → snapshot cũ + unavailable giữ nguyên trạng thái trước đó. Variant item: inventory available==0 → `unavailable=true`.
- [ ] **Step 2:** CartItem response luôn có `unavailable` bool; `subtotal` = Σ lineTotal **chỉ item `unavailable=false`**.
- [ ] **Step 3:** `CartEnrichmentTest` — WireMock_catalog: stub 200 detail JSON (name/price/variants) → GET cart có giá mới; stub 404 → item unavailable=true, vẫn trong items, subtotal không tính; WireMock chết (port trống) → degraded giữ snapshot; WireMock_inventory: available 0 → unavailable.
- [ ] **Step 4:** Run full module tests → PASS. Commit `feat(cart): unavailable enrichment + available-only subtotal (SF-6 §6.1)`.

### Task 6: mfe-checkout-remote-registration

**Files:** Create `frontend/apps/mfe-checkout/{package.json,vite.config.ts,index.html,tsconfig.json? (kế thừa preset),src/{main.tsx,bootstrap.tsx,page.css}}`; Modify `frontend/apps/shell/vite.config.ts` (+remote checkout), `src/remotes.d.ts` (+declare modules), `frontend/pnpm-workspace.yaml` (+@stripe/stripe-js catalog).

- [ ] **Step 1:** package.json — name `@ecommerce/mfe-checkout`, scripts dev/build= tsc --noEmit, deps: react/react-dom/@ecommerce/ui-kit/@ecommerce/auth/@ecommerce/contracts/@ecommerce/i18n (catalog:), devDeps như mfe-account + `@stripe/stripe-js: catalog:`.
- [ ] **Step 2:** pnpm-workspace.yaml catalog append:

```yaml
  # mfe-checkout (SF-6) — Stripe.js confirm (FE chỉ cần pk + clientSecret)
  "@stripe/stripe-js": ^7.3.0
```

- [ ] **Step 3:** vite.config.ts — copy mfe-account, name `mfe_checkout`, port **5175**, exposes `./bootstrap ./CartBadge ./CartPage ./CheckoutPage ./ConfirmationPage`, proxy /api → GATEWAY_URL:8080.
- [ ] **Step 4:** bootstrap.tsx — `ShellContext` như mfe-account (HeaderSlots/navigate/onRegistryChange) + `initCheckoutShell(ctx)`:

```ts
export function initCheckoutShell(ctx: ShellContext): void {
  navigateRef = ctx.navigate;
  ctx.HeaderSlots.register('right', 'checkout-cart-badge', CartBadge);
  ctx.onRegistryChange?.();
  // merge-on-login: authStore flip guest→user → POST /api/cart/merge
  let wasAuthenticated = authStore.isAuthenticated();
  authStore.subscribe(() => {
    const isAuth = authStore.isAuthenticated();
    if (isAuth && !wasAuthenticated) void mergeGuestCartOnLogin();
    wasAuthenticated = isAuth;
  });
  void refreshBadge();
}
```

`lib/cartApi.ts`: fetch same-origin + `notifyCartChanged()` dispatch `ecommerce:cart-changed`; guest token localStorage `ecommerce.guest_cart_token` đọc từ `Cart.cartToken` response. `mergeGuestCartOnLogin()`: token có → `authStore.fetch('/api/cart/merge', POST {cartToken})` → ok/404 → clear token + notify.
- [ ] **Step 5:** main.tsx (vite entry federation preset của config — copy mfe-account main.tsx). Shell wiring: vite.config remotes + `checkout: {type:'module', name:'mfe_checkout', entry: REMOTE_CHECKOUT_URL:5175}`; remotes.d.ts declare 5 modules (bootstrap có initCheckoutShell).
- [ ] **Step 6:** shell `main.tsx` append block sau account bootstrap:

```tsx
import('checkout/bootstrap')
  .then((m) => m.initCheckoutShell({ HeaderSlots, navigate, onRegistryChange: onHeaderSlotsChanged }))
  .catch((error) => console.warn('[shell] mfe-checkout chưa chạy — cart badge tạm vắng:', error.message));
```

- [ ] **Step 7:** `pnpm install` (lockfile regen) + `pnpm -C frontend --filter @ecommerce/mfe-checkout lint` + shell lint → PASS. Commit `feat(checkout): mfe-checkout remote scaffold + shell wiring + stripe dep (SF-6)`.

### Task 7: cart-page-ui

**Files:** Create `src/pages/CartPage.tsx`, `src/CartBadge.tsx`, `src/lib/cartStore.ts` (subscribe/notify nhẹ); Modify `frontend/apps/shell/src/App.tsx` (routes append).

- [ ] **Step 1:** cartStore — `useCart()` hook: state Cart|null, load() GET /api/cart (404 → empty), mutate helpers (add/patch/remove) gọi cartApi + set state + notifyCartChanged; badge + cart page dùng chung 1 store pattern (subscribe qua CustomEvent).
- [ ] **Step 2:** CartPage — line items: ảnh (img 80px fallback), tên (link PDP `/p/{slug}` — điều hướng qua `window.location` vì PDP ở Next qua gateway), `formatPrice(unitPrice)`, qty stepper −/+ (disable khi unavailable), nút xóa; unavailable line: badge đỏ `Không còn khả dụng`, không stepper; summary: subtotal (từ server) + ghi chú "Cập nhật lúc thanh toán"; CTA `Button variant="primary"` "Thanh toán" → appNavigate('/checkout'), disable khi subtotal=0; empty state `EmptyState` + link trang chủ.
- [ ] **Step 3:** CartBadge — nút 🛒 + badge số (`Σ qty`): mount → GET; listener `ecommerce:cart-changed` → re-fetch; count>0 → badge đỏ; click → appNavigate('/cart') (nếu standalone dev → window.location).
- [ ] **Step 4:** shell App.tsx routes append: `/cart` → lazy `checkout/CartPage` trong ErrorBoundary + Suspense (fallback pattern AccountErrorFallback — thêm CheckoutErrorFallback dùng chung).
- [ ] **Step 5:** vitest `__tests__/cartPage.test.ts`: subtotal render, unavailable không có stepper, empty state. Run PASS. Commit `feat(checkout): cart page + badge + cart store (SF-6)`.

### Task 8: checkout-steps-address-shipping-review

**Files:** Create `src/pages/CheckoutPage.tsx` (stepper 3 bước, state một nơi), `src/lib/format.ts` nếu cần.

- [ ] **Step 1:** Stepper UI 3 bước (1 Địa chỉ · 2 Vận chuyển · 3 Thanh toán) — step state trong page, back/forward giữ state form. Guest gate: `authStore.isAuthenticated()` false → banner "Đăng nhập để thanh toán" + link /login (authStore.subscribe để vào lại được sau login).
- [ ] **Step 2:** Step 1 Địa chỉ — form fields fullName, phone, line1, ward, district, city (đủ `Address` contract) — Input ui-kit + label; validate required + phone regex; Next disable khi invalid.
- [ ] **Step 3:** Step 2 Vận chuyển — flat fee: `Number(import.meta.env.VITE_SHIPPING_FLAT_FEE ?? 25000)` hiển thị `formatPrice`; card "Giao tiêu chuẩn — 25.000 ₫"; shippingMethod id `standard`.
- [ ] **Step 4:** Step 3 review — coupon box (Task 9) + bảng tóm tắt: subtotal (server) − discount + shipping = **total**; items list từ cart (chỉ item khả dụng); nút đặt hàng (Task 10/11).
- [ ] **Step 5:** vitest: address validation, total math (subtotal − discount + shipping). Commit `feat(checkout): 3-step checkout address/shipping/review (SF-6)`.

### Task 9: coupon-apply-ui-contract-stub

**Files:** Create `src/lib/orderingStub.ts` (validateCoupon + createOrder + toggle), Modify CheckoutPage (coupon box).

- [ ] **Step 1:** orderingStub.ts — đúng shapes ordering.yaml:

```ts
export const ORDERING_STUB = import.meta.env.VITE_ORDERING_STUB !== '0';
const COUPONS: Record<string, {type:'PERCENT'|'FIXED'; value:number}> = { WELCOME10: {type:'PERCENT', value:10} };
export function validateCoupon(code: string, subtotal: number): ValidateCouponResponse {
  const c = COUPONS[code.trim().toUpperCase()];
  if (!c) return { valid: false, discount: 0, message: 'Mã không tồn tại hoặc đã hết hạn' };
  const discount = c.type === 'PERCENT' ? Math.floor((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
  return { valid: true, discount };
}
```

- [ ] **Step 2:** Coupon box step 3: input mã + nút Áp dụng → validateCoupon → valid: hiển thị dòng "WELCOME10 −10%: −{formatPrice(discount)}" + nút gỡ; invalid: message đỏ. Discount state đưa vào total.
- [ ] **Step 3:** vitest: WELCOME10 floor math (subtotal 1234567 → 123456), invalid shape. Commit `feat(checkout): coupon box + validate stub contract shape (SF-6)`.

### Task 10: order-create-post-contract-stub

**Files:** Modify `src/lib/orderingStub.ts` (+createOrder).

- [ ] **Step 1:** createOrder — build CreateOrderRequest (items chỉ khả dụng, **variantId `""` cho non-variant** — pin spec-critic; address; shippingMethod; couponCode?), Idempotency-Key = crypto.randomUUID; mock Order đầy đủ required fields (id `mock-{uuid8}`, userId từ authStore.getUser()?.id ?? 'guest', status PENDING, timeline [{status:'PENDING', at: now}], currency VND, paymentMethod stripe, subtotal/discount/shippingFee/total).
- [ ] **Step 2:** clientSecret THẬT: `POST /api/payment/intents` `{orderId, amount: total, currency:'VND', idempotencyKey}` → 201 `{clientSecret…}`; **503/`payment_unconfigured` → throw `PaymentUnavailableError`**; lỗi khác → throw message.
- [ ] **Step 3:** advance status sau confirm: `confirmOrderMock(order)` → PENDING→PAID→CONFIRMED (timeline append, updatedAt) — gọi ở Task 12 success path.
- [ ] **Step 4:** vitest: payload shape (variantId "" khi thiếu), idempotencyKey uuid, PaymentUnavailableError mapping từ 503. Commit `feat(checkout): order-create stub + real payment intent call (SF-6)`.

### Task 11: stripejs-confirm-flow-real-payment

**Files:** Modify CheckoutPage (pay section), Create `src/lib/stripePay.ts`.

- [ ] **Step 1:** stripePay.ts — `loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '')`; key rỗng → null (mock panel branch). `mountPaymentElement(container, clientSecret)`: `stripe.elements({clientSecret, appearance:{theme:'stripe'}})` → `elements.create('payment')` → mount; `confirm(elements)`: `await elements.submit()` → `stripe.confirmPayment({elements, clientSecret, redirect:'if_required'})` → `{error}` trả lên.
- [ ] **Step 2:** CheckoutPage step 3 flow: createOrder stub → clientSecret có + stripe có → mount PaymentElement + nút "Thanh toán" → confirm: **success** → `confirmOrderMock` → lưu sessionStorage `ecommerce.last_order` → clear cart (DELETE từng item qua cartApi) → `notifyCartChanged` → appNavigate('/order/confirmation'); **error** → hiện `error.message` đỏ (declined 4000…0002 vào đây) — order KHÔNG finalize.
- [ ] **Step 3:** Nhánh mock panel: PaymentUnavailableError HOẶC không publishable key → panel cảnh báo vàng "⚠ Chưa cấu hình thanh toán — đơn demo, không trừ tiền" + nút "Đặt hàng (demo)" → cùng flow confirm (không gọi Stripe).
- [ ] **Step 4:** vitest: key rỗng → mock branch; PaymentUnavailableError → mock branch. Commit `feat(checkout): stripe.js confirm real + mock panel fallback (SF-6)`.

### Task 12: confirmation-page

**Files:** Create `src/pages/ConfirmationPage.tsx`; Modify shell App.tsx (+route /order/confirmation).

- [ ] **Step 1:** Đọc `ecommerce.last_order` sessionStorage → cảm ơn (✓ icon, "Cảm ơn bạn đã mua hàng!") + order id + summary (items/subtotal/discount/shipping/total) + badge trạng thái "Đang xử lý" + timeline mock. Không có order → EmptyState + link trang chủ.
- [ ] **Step 2:** Route append shell. vitest render 2 nhánh. Commit `feat(checkout): confirmation page + route (SF-6)`.

### Task 13: shell-cart-badge-wire + storefront PDP wire

**Files:** Modify `frontend/apps/storefront-web/components/pdp/{PdpBuyBox.tsx,AddToCart.tsx}`.

- [ ] **Step 1:** PdpBuyBox nhận thêm `slug: string` prop từ page (`[locale]/p/[slug]/page.tsx` truyền `product.slug` — đọc file trước khi sửa), thread vào AddToCart.
- [ ] **Step 2:** AddToCart submit: `POST /api/cart/items?slug=${encodeURIComponent(slug)}` → ok: parse body Cart → `cartToken` guest → localStorage; `window.dispatchEvent(new CustomEvent('ecommerce:cart-changed'))`; toast "Đã thêm vào giỏ ✓" (badge shell tự refresh qua event — cùng window khi chạy qua gateway); "MUA NGAY" → thêm xong `window.location.assign('/cart')`. Lỗi network → toast cũ "Giỏ hàng sẽ sớm khả dụng".
- [ ] **Step 3:** Verify build storefront (`pnpm --filter storefront-web lint` / next build tùy nhanh). Commit `feat(checkout): wire PDP add-to-cart → cart-service thật + cart-changed event (SF-6)`.

### Task 14: gateway/compose/env append + checkout-it-tests (bundle cuối)

**Files:** Modify `backend/gateway/src/main/resources/gateway-routes.yml`, `docker-compose.yml`, `.env.example`; Create cart-service tests còn thiếu + mfe-checkout vitest suite gộp.

- [ ] **Step 1:** gateway-routes.yml — un-comment block cart **XÓA dòng StripPrefix** (comment SF-4 precedent) + append:

```yaml
        - id: cart                                          # SF-6 · port 8083
          uri: http://localhost:8083
          predicates: [ "Path=/api/cart/**" ]
        # SF-6 (2026-09-06): shell app pages qua gateway — same-origin cookie jar
        # (cart_token) xuyên PDP(:3000 Next) → login → /cart trên MỘT origin :8080.
        # Dev: shell Vite :5173 (REMOTE khác mount qua remoteEntry).
        - id: shell-pages                                   # SF-6 · port 5173
          uri: http://localhost:5173
          predicates: [ "Path=/cart,/checkout,/order/confirmation,/login,/register,/account" ]
```

- [ ] **Step 2:** docker-compose append block `cart-service` (profile `full`, build Dockerfile path, REDIS_HOST: redis, expose 8083) + Dockerfile copy từ template (nếu template có Dockerfile — copy catalog's, đổi path). `.env.example` append:

```
# ── SF-6 checkout FE (Vite chỉ expose VITE_*) ──────────────────────────
VITE_ORDERING_STUB=1
VITE_SHIPPING_FLAT_FEE=25000
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx   # trống → checkout hiện mock pay panel
```

- [ ] **Step 3:** Full test suite: `mvn -pl services/cart-service test` (Redis IT + WireMock) + `pnpm -C frontend --filter '@ecommerce/mfe-checkout' test` + lint shell → ALL PASS.
- [ ] **Step 4:** Commit `feat(cart): gateway routes + compose + env + integration tests (SF-6)`.

---

## Verify checklist (Phase 5 — từng dòng ACCEPTANCE pack)

| # | Acceptance | Cách verify |
|---|---|---|
| 1 | Guest thêm 2 SP từ PDP/PLP thật → badge = 2; reload còn | Browser qua gateway :8090(private)/8080 — DOM + screenshot + reload |
| 2 | Login với guest cart → merge đúng (qty gộp) | Register user mới → thấy merge, cart giữ đúng |
| 3 | Đổi qty/remove cập nhật tổng; unpublish → "Không còn khả dụng" không chặn | Browser + admin unpublish 1 product |
| 4 | Checkout 3 bước; WELCOME10 → −10%; tổng đúng | Browser từng bước + math |
| 5 | Có key: 4242 → thành công thật; 4000…0002 → lỗi UI | Cần user key — không key: verify mock panel nhánh |
| 6 | Không key → mock panel + cảnh báo | Browser screenshot |
