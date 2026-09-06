# SF-2 contracts-design-foundation — Implementation Plan (FI-312)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đóng băng tầng hợp đồng của toàn story FI-310 — 10 OpenAPI specs + JSON Schema events — rồi sinh TS clients, dựng packages/auth + ui-kit v1 + i18n vi/en, chứng minh Module Federation chạy thật (shell nạp 1 skeleton remote, 1 instance React), và chạy designer 3 hướng Tiki-inspired cho user chọn (hard gate riêng).

**Architecture:** Contract-first (D5): `contracts/` = source of truth, codegen TS commit vào repo. Error shape RFC 7807 khớp common-lib `ApiError`. MF cho Vite = `@module-federation/vite` (KHÔNG webpack enhanced — bài học SF-1), shared singletons qua preset `defineMfeConfig`. Contract freeze KHÔNG chờ designer; ui-kit tokens hoàn thiện sau khi user chọn hướng.

**Tech Stack:** OpenAPI 3.1 · Spectral lint · openapi-typescript + json-schema-to-typescript · pnpm catalog + Turborepo (`gen` pipeline) · React 18 · `@module-federation/vite` · i18next · Vitest

**Linear Issue:** FI-312 · **Nhánh đích:** `story/fi310-ecommerce-platform` · **Spec:** `docs/superpowers/contexts/sf-2.md` + epic spec §6.1

---

## Conventions dùng chung mọi task (đọc trước khi chạy task nào)

1. **Spec shape:** mỗi yaml tự chứa (self-contained) — `components.schemas` gồm `ApiError` mirror common-lib:

```yaml
    ApiError:
      type: object
      description: RFC 7807 problem+json — mirror backend/shared/common-lib ApiError
      properties:
        type: { type: string, default: "about:blank" }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
        instance: { type: string }
        timestamp: { type: string, format: date-time }
        requestId: { type: string }
        errors:
          type: array
          items:
            type: object
            properties:
              field: { type: string }
              message: { type: string }
```

Mọi error response `content: application/problem+json: { schema: { $ref: '#/components/schemas/ApiError' } }`.

2. **Paths:** prefix `/api/{service}` (partner: `/open-api/v1/**`; invoice: internal `/api/invoice`, `x-internal-only: true`, không route qua gateway). Path segments kebab-case (spectral rule warn — giữ 0 error).
3. **operationId:** camelCase duy nhất toàn file (codegen phụ thuộc).
4. **Money:** VND zero-decimal — `price`, `total`, `fee`... = `type: integer` (đơn vị VND). Không dùng number thập phân cho tiền.
5. **i18n (D17):** GET content công khai nhận `?locale=vi|en` + `Accept-Language`, fallback `vi`, response trả string ĐÃ resolve. Admin write nhận object `{vi, en}` — schema đặt tên hậu tố `I18n` (vd `ProductWrite` có `name: {type: object, properties: {vi: {type: string}, en: {type: string}}}`) + `seo_title`/`seo_description` nullable i18n + slug vi/en riêng. UGC (reviews) không i18n.
6. **Paging:** chuẩn `{items: [...], page, size, total}`; query `page` (0-based? — CHỐT: 1-based) + `size` (default 20, max 100).
7. **Lint sau mỗi spec:** `pnpm dlx @stoplight/spectral-cli lint contracts/openapi/<file>.yaml` → 0 error (0 error, warn cho phép).
8. **Deps mới:** chỉ thêm qua `frontend/pnpm-workspace.yaml` catalog + `catalog:` protocol. KHÔNG pin version mới khi catalog đã có.
9. **Commit:** mỗi task 1 atomic commit, stage đúng file task đó (KHÔNG `git add -A`). Format `<type>(<scope>): <summary>` — vd `feat(contracts): identity spec — auth/jwks/2fa/oauth/reset`.
10. **Không đụng:** `backend/**`, `Makefile`, `docker-compose.yml` (thiếu gì → flag coordinator trong báo cáo).

---

### Task 1: openapi-identity-spec

**Files:** Create `contracts/openapi/identity.yaml`

- [x] Viết spec OpenAPI 3.1, `info.title: Identity API`, `tags: [auth, me, admin, password, oauth, 2fa]`:
  - `POST /api/identity/auth/register` `{email, password, fullName}` → 201 `{id, email, fullName, roles[]}`; 409 email tồn tại
  - `POST /api/identity/auth/login` `{email, password}` → 200 `{accessToken, tokenType: "Bearer", expiresIn, user{...}}` **hoặc** (2FA bật) 200 `{twoFactorRequired: true, challengeToken}` (D22)
  - `POST /api/identity/auth/refresh` — request KHÔNG body, refresh cookie httpOnly; response `{accessToken, expiresIn}`; 401 cookie hết
  - `POST /api/identity/auth/logout` → 204, clear cookie
  - `GET /api/identity/me` (JWT) → `{id, email, fullName, roles[], twoFactorEnabled}`
  - `GET /api/identity/.well-known/jwks.json` → JWKS RFC 7517 (`{keys: [{kty, kid, alg: RS256, use: sig, n, e}]}`) — **đây là JWKS path pin, SF-3/5 verify qua đây**
  - `GET /api/identity/admin/users?page&size&q` → page`{id, email, fullName, roles[], createdAt}`
  - `POST /api/identity/password/forgot` `{email}` → 202 (luôn 202, không lộ user tồn tại); email token 30' qua notification
  - `POST /api/identity/password/reset` `{token, newPassword}` → 204
  - `GET /api/identity/oauth/{provider}/authorize` (provider `google|facebook`) → 302 redirect provider; `GET /api/identity/oauth/{provider}/callback` → 302 về FE kèm code một-lần (D22; chi tiết flow SF-15)
  - `POST /api/identity/2fa/setup` (JWT) → `{secret, otpauthUrl}`; `POST /api/identity/2fa/enable` `{code}` → `{recoveryCodes[]}`; `POST /api/identity/2fa/disable` `{password}` → 204; `POST /api/identity/2fa/verify` `{challengeToken, code}` → `{accessToken, expiresIn, user}`
- [x] Lint 0 error
- [x] Commit: `feat(contracts): identity spec — auth/jwks/me/2fa/oauth/password-reset`

### Task 2: openapi-catalog-spec

**Files:** Create `contracts/openapi/catalog.yaml`

- [x] Spec 3.1, `tags: [products, categories, search, reviews, wishlist, admin, uploads]`. Schemas chính:
  - `ProductCard`: `{id, slug (resolved theo locale), slugEn, name (resolved), brand?, price int VND, comparePrice? int, discountPercent? int (computed), flashSaleEndsAt? date-time, ratingAvg number, ratingCount int, image {url, alt?}, tags: string[] (badge "Chính hãng"/"Freeship" — admin set), categoryId}`
  - `ProductDetail` = ProductCard + `description (resolved, string)`, `images[] {url, alt?, position}`, `variants[] {id, name (resolved), options object, priceDelta? int, stock int}`, `relatedCount?`
  - `ProductWrite` (admin): trường i18n dạng object `{vi, en}`: `nameI18n`, `descriptionI18n`, `seoTitleI18n?`, `seoDescriptionI18n?` (2 seo nullable), `slugVi`, `slugEn`, + fields phẳng còn lại; `status: DRAFT|PUBLISHED`
- [x] Endpoints công khai (mọi content GET nhận `?locale=` + `Accept-Language`, fallback vi — D17):
  - `GET /api/catalog/products` filters `category (slug), minPrice, maxPrice, minRating, brand, sort (price_asc|price_desc|rating|newest|discount), page, size, locale` → page\<ProductCard\>
  - `GET /api/catalog/products/{slug}` → ProductDetail; 404
  - `GET /api/catalog/categories` → cây `[{id, slug (resolved), slugEn, name, parentId, children: [...recursion]}]`
  - `GET /api/catalog/search?q&locale&page&size&category&sort` → page\<ProductCard\>; `GET /api/catalog/search/suggest?q&locale` → `{products: [ProductCard](≤5), categories: [{slug, name}](≤5)}`
  - Reviews (UGC không i18n): `GET /api/catalog/products/{slug}/reviews?page&size` → `{items: [{id, userId, userName, rating int 1-5, title?, content, verifiedPurchase bool, createdAt}], breakdown: {"5": int...}, total}`; `POST` (JWT) `{rating, title?, content}` → 202 PENDING
  - Wishlist: `GET /api/catalog/me/wishlist?page&size` → page\<ProductCard\>; `PUT /api/catalog/me/wishlist/{productId}` → 204; `DELETE ...` → 204; `GET /api/catalog/me/wishlist/ids` → `{productIds: string[]}`
  - `POST /api/catalog/products/{slug}/stock-alert` `{email, variantId}` → 202 (D22, public)
- [x] Admin:
  - Products: `GET /api/catalog/admin/products?page&size&q&status`, `POST` (ProductWrite) → 201, `GET/PUT/DELETE /api/catalog/admin/products/{id}` (GET/PUT trả + nhận full object I18n)
  - Categories CRUD tương tự (`CategoryWrite` i18n + parentId)
  - Reviews moderation: `GET /api/catalog/admin/reviews?status=PENDING|APPROVED|REJECTED&page`, `POST /api/catalog/admin/reviews/{id}/approve|reject` → 200 Review
  - `POST /api/catalog/admin/uploads` multipart (`image`, ≤5MB, jpg/png/webp) → 201 `{url}` (public `/media/**` qua gateway — D21)
- [x] Lint 0 error
- [x] Commit: `feat(contracts): catalog spec — products/i18n-locale/search/reviews/wishlist/uploads`

### Task 3: openapi-cart-spec

**Files:** Create `contracts/openapi/cart.yaml`

- [x] Spec 3.1, `tags: [cart]`. `CartItem`: `{id, productId, variantId, slug, name (resolved), image?, qty int ≥1, unitPrice int, lineTotal int, unavailable bool}`; `Cart`: `{cartToken?, items[], subtotal int}`. `unavailable` do enrich khi GET (sản phẩm xóa/hết — §6.1.2)
- [x] Endpoints (identity: guest qua cookie `cart_token`, user qua JWT; cả hai cùng shape response):
  - `POST /api/cart` (guest, không body) → 201 Cart + `Set-Cookie: cart_token`
  - `GET /api/cart` → 200 Cart
  - `POST /api/cart/items` `{productId, variantId, qty}` → 200 Cart (enrich); 404 sản phẩm/variant không tồn tại; 409 variant hết hàng (vẫn thêm được nếu `allowOos` — CHỐT: 409 khi hết, body ApiError.detail rõ)
  - `PATCH /api/cart/items/{itemId}` `{qty}` → 200 Cart; `DELETE /api/cart/items/{itemId}` → 200 Cart
  - `POST /api/cart/merge` (JWT + body `{cartToken}` của guest) → 200 Cart đã merge (dedupe theo variantId, cộng qty)
- [x] Lint 0 error
- [x] Commit: `feat(contracts): cart spec — guest cart_token/merge/enrich unavailable`

### Task 4: openapi-ordering-spec

**Files:** Create `contracts/openapi/ordering.yaml`

- [x] Spec 3.1, `tags: [orders, coupons, rma, shipping, admin]`. Enum status **pin §3.6**: `PENDING|PAID|CONFIRMED|SHIPPED|DELIVERED|CANCELLED|FAILED`; mô tả transitions table §3.6 vào `description` của schema `OrderStatus` (PENDING→PAID system; PAID→CONFIRMED system; CONFIRMED→SHIPPED admin; SHIPPED→DELIVERED admin; PENDING→CANCELLED admin; PAID/CONFIRMED→CANCELLED admin+refund; PENDING→FAILED system; →CANCELLED TTL 30'). **Admin KHÔNG có endpoint confirm.**
- [x] Schemas: `OrderLine {productId, variantId, name (resolved), image?, qty, unitPrice, lineTotal}`, `Address {fullName, phone, line1, ward, district, city, postalCode?}`, `Order {id, userId, status, items[], subtotal, discount, shippingFee, pointsDiscount?, total, currency: "VND", couponCode?, affiliateCode?, paymentMethod: stripe|cod, shippingMethod, trackingCode?, address, timeline: [{status, at}], createdAt, updatedAt}`, `OrderSummary` (list — không items, có `itemsCount`, `paymentMethod`)
- [x] Customer:
  - `POST /api/ordering/orders` — header `Idempotency-Key` (BẮT BUỘC, 409 khi trùng key payload khác); body `{items: [{productId, variantId, qty}], couponCode?, usePoints? int, paymentMethod (enum stripe|cod, default stripe — D21), shippingMethod, affiliateCode?, address}` → 201 `{order, clientSecret?}` — `clientSecret` null khi COD (saga bỏ bước intent, CONFIRMED sau reserve); lỗi → 409 (hết stock — detail kèm `insufficient[]`) / 422 (coupon invalid) problem+json
  - `POST /api/ordering/orders/validate-coupon` `{code, subtotal}` → 200 `{valid, discount, message?}` (không reserve)
  - `GET /api/ordering/coupons/public` → `[{code, type: PERCENT|FIXED, value, minOrderValue?, startsAt?, endsAt?, description}]` — KHÔNG lộ usage-limit/used-count nội bộ
  - `GET /api/ordering/me/orders?page&size` → page\<OrderSummary\>; `GET /api/ordering/me/orders/{id}` → Order; `POST /api/ordering/me/orders/{id}/cancel` → 200 Order (409 khi không được phép theo §3.6)
  - `GET /api/ordering/me/orders/{id}/invoice` → `application/pdf` (binary) — D18, 409 khi đơn chưa CONFIRMED
  - `GET /api/ordering/me/orders/{id}/tracking` → `{trackingCode, carrier, status, events?: [{at, description}]}`
  - RMA (D22): `POST /api/ordering/me/rma` `{orderId, lines: [{lineId, qty}], reason}` → 202 `{id, status: REQUESTED}`; `GET /api/ordering/me/rma?page` → page\<Rma `{id, orderId, status, lines, reason, createdAt}\>` — lifecycle `REQUESTED→APPROVED→RECEIVED→REFUNDED | REJECTED`, window 7 ngày từ DELIVERED (ghi description)
- [x] Shipping: `GET /api/ordering/shipping/methods` → `[{id, name, fee int, etaDays int}]` (flat-fee MVP; GHN SF-14 cùng shape)
- [x] Admin:
  - `GET /api/ordering/admin/orders?status&page&size&q` → page\<Order\>; `GET /api/ordering/admin/orders/{id}` → Order
  - `POST /api/ordering/admin/orders/{id}/ship | deliver | cancel` → 200 Order (cancel sau PAID kèm refund — server lo)
  - `GET /api/ordering/admin/orders/{id}/invoice` → pdf
  - RMA admin: `GET /api/ordering/admin/rma?status`, `POST /api/ordering/admin/rma/{id}/approve | reject | mark-received | refund` → 200 Rma
  - Stats (§6.1.8): `GET /api/ordering/admin/stats/revenue-by-day?from&to` → `[{date, revenue, orders}]`; `GET /api/ordering/admin/stats/orders-summary` → `{counts per status, totalRevenue, todayRevenue, todayOrders}`; `GET /api/ordering/admin/stats/top-products?limit&from&to` → `[{productId, name, qty, revenue}]`
- [x] Lint 0 error
- [x] Commit: `feat(contracts): ordering spec — state machine §3.6/idempotency/COD/coupons-public/invoice/rma/shipping/stats`

### Task 5: openapi-inventory-spec

**Files:** Create `contracts/openapi/inventory.yaml`

- [x] Spec 3.1, `tags: [inventory, admin]`. Reservation = **variant-level** (§6.1.4):
  - `POST /api/inventory/reservations` `{orderId, items: [{variantId, qty}], ttlMinutes? (default 30)}` → 201 `{reservationId, expiresAt}` | **409** `{...ApiError, insufficient: [{variantId, requested, available}]}` (all-or-nothing — một thiếu = hủy cả reservation)
  - `GET /api/inventory/availability?variantIds=a,b,c` → `[{variantId, available, reserved}]`
  - `GET /api/inventory/admin/low-stock?threshold` → `[{variantId, productId, productName, available, threshold}]`
  - description pin: commit/release KHÔNG qua REST — qua events `order.paid` (commit) + `order.cancelled/order.failed` (release); `inventory.reserved|released|committed` publish ra broker
- [x] Lint 0 error
- [x] Commit: `feat(contracts): inventory spec — reservations all-or-nothing variant-level`

### Task 6: openapi-payment-spec

**Files:** Create `contracts/openapi/payment.yaml`

- [x] Spec 3.1, `tags: [payments, admin]` (REST ordering gọi — sync command edge §3.3):
  - `POST /api/payment/intents` `{orderId, amount int, currency: "VND", idempotencyKey}` → 201 `{paymentIntentId, clientSecret, status}` (Stripe zero-decimal VND); 409 idempotent replay khác payload
  - `POST /api/payment/webhook` — body raw Stripe event, header `Stripe-Signature`; response 200 `{received: true}`; 400 signature sai
  - `POST /api/payment/refunds` `{paymentIntentId, amount?, reason}` → 201 `{refundId, status, amount}`
  - `POST /api/payment/void` `{paymentIntentId}` → 200 `{status}`
  - description pin: adapter SPI (`createIntent/void/refund/verifyWebhook`) — Stripe đầu tiên, VNPay/MoMo sau; COD không qua service này
- [x] Lint 0 error
- [x] Commit: `feat(contracts): payment spec — intents/webhook/refunds/void`

### Task 7: openapi-notification-spec

**Files:** Create `contracts/openapi/notification.yaml`

- [x] Spec 3.1, `tags: [notification]`, `info.description`: chủ yếu event-driven (consume `order.confirmed`, `order.cancelled`, `review.moderated`); REST chỉ internal send + log:
  - `POST /api/notification/emails` (`x-internal-only: true`) `{to, template, params object, idempotencyKey?}` → 202 `{emailId}`
  - `GET /api/notification/admin/emails?page&size&to` → page\<{id, to, template, subject, status: SENT|FAILED, sentAt, error?}\> (debug dev — Mailpit là UI thật)
- [x] Lint 0 error
- [x] Commit: `feat(contracts): notification spec — internal send + admin log`

### Task 8: openapi-aux-specs (invoice D18 + partner-api D19 + affiliate D20)

**Files:** Create `contracts/openapi/invoice.yaml`, `contracts/openapi/partner-api.yaml`, `contracts/openapi/affiliate.yaml`

- [x] `invoice.yaml` — internal-only (`x-internal-only: true`, không qua gateway; ordering gọi trực tiếp :8090):
  - `POST /api/invoice/generate` — body `InvoicePayload`: `{order: {id, number?, createdAt, items: [{name, qty, unitPrice, lineTotal}]}, seller: {name, address, phone?}, buyer: {name, taxId?, address, phone?}, invoice: {templateSymbol, seriesSymbol, number int (tuần tự), vatRate number (env INVOICE_VAT_RATE=10), totalAmount, note?}}` → 200 `application/pdf` (binary); 503 renderer lỗi (degraded rõ ràng — D18); VAT-inclusive breakdown do CALLER (ordering) tính, renderer thuần stateless
- [x] `partner-api.yaml` — `servers` namespace `/open-api/v1`; `securitySchemes: ApiKeyAuth (apiKey in header, name X-API-Key)`; mọi endpoint security ApiKeyAuth; 401 key sai/hết; 429 rate-limit (problem+json):
  - `GET /open-api/v1/products?page&size&category` → page\<PartnerProduct {id, sku?, slug, name, price, stock?, updatedAt}\>
  - `GET /open-api/v1/products/{id}` → PartnerProduct chi tiết (gồm description + variants)
  - `GET /open-api/v1/categories` → cây phẳng `[{id, slug, name, parentId}]`
  - `GET /open-api/v1/search?q&page&size` → page\<PartnerProduct\>
  - `POST /open-api/v1/orders` `{partnerRef (idempotent theo partner), customer {name, phone, email?, address}, items: [{productId, variantId?, qty}]}` → 201 `{orderId, partnerRef, status}`
  - `GET /open-api/v1/orders/{id}` → `{orderId, partnerRef, status, items, updatedAt}`
  - Webhook schema (outbound — mô tả + schema, không endpoint): `partner.order.changed` `{eventId, orderId, partnerRef, status, occurredAt}`; header `X-Signature: HMAC-SHA256(secret, body)`; retry + DLQ
- [x] `affiliate.yaml` — `tags: [affiliate, admin, internal]`:
  - `POST /api/affiliate/register` (JWT) `{portfolioUrl?, note?}` → 202 `{id, status: PENDING}`; `GET /api/affiliate/me` (JWT) → `{id, code, status: PENDING|APPROVED|REJECTED, rate number (%), stats {clicks, conversions, earnings}}`
  - `GET /api/affiliate/me/ledger?page` → page\<{id, orderId, orderTotal, rate, commission, status: PENDING|CONFIRMED, createdAt}\>
  - `POST /api/affiliate/track/click` (public — storefront capture) `{refCode}` → 204
  - Admin: `GET /api/affiliate/admin/affiliates?status&page`, `POST /api/affiliate/admin/affiliates/{id}/approve | reject`, `PUT /api/affiliate/admin/affiliates/{id}/rate {rate}`; `GET /api/affiliate/admin/stats?from&to` → `{totalAffiliates, activeClicks, conversions, totalCommission}`
  - Internal (D22 loyalty): `POST /api/affiliate/internal/loyalty/redeem` (`x-internal-only`) `{userId, points int, orderId}` → 200 `{discount int, remaining}`; loyalty accounts/ledger tables thuộc affiliate-service (SF-14)
- [x] Lint cả 3 file 0 error
- [x] Commit: `feat(contracts): aux specs — invoice internal/partner open-api/affiliate+loyalty (D18-D20)`

### Task 9: events-jsonschema-fat-payloads

**Files:** Create `contracts/events/envelope.schema.json`, `contracts/events/*.schema.json` (12 events), Update `contracts/events/README.md` (tạo mới — hiện chưa có)

- [x] `envelope.schema.json`: `{eventId (uuid), eventType (pattern ^[a-z]+\.[a-z-]+$), occurredAt (date-time), correlationId (X-Request-Id gateway), producer (service name), schemaVersion int, payload (object)}` — mọi event schema dùng `$ref` vào envelope bằng cách TỰ CHỨA: mỗi file định nghĩa full `{envelope fields..., payload: {...event-specific}}` (json-schema-to-typescript không theo ref liên file — chấp nhận lặp, ghi chú README)
- [x] 12 schemas (`user.created`, `product.changed`, `inventory.reserved`, `inventory.released`, `inventory.committed`, `payment.succeeded`, `payment.failed`, `order.created`, `order.paid`, `order.confirmed`, `order.cancelled`, `order.failed`, `review.moderated`) — payload pin:
  - `user.created`: `{userId, email, fullName, roles[], createdAt}`
  - `product.changed`: `{productId, action: CREATED|UPDATED|DELETED, slugVi, slugEn, changedAt}` (indexer ES per-locale + cache invalidate)
  - `inventory.reserved|released|committed`: `{reservationId, orderId, items: [{variantId, qty}]}`
  - `payment.succeeded|failed`: `{orderId, paymentIntentId, amount, currency, failureReason?}`
  - `order.created`: `{orderId, userId, status, total, createdAt}`
  - `order.paid`: `{orderId, paymentIntentId, paidAt}`
  - **`order.confirmed` FAT (§6.1.5)**: `{orderId, userId, email, items: [{productId, variantId, qty, price}], subtotal, discount, shippingFee, total, currency, couponCode?, affiliateCode? nullable, confirmedAt}` — ĐỦ cho notification/cart/catalog/log/partner/affiliate, CẤM consumer call-back HTTP
  - `order.cancelled`: `{orderId, reason, cancelledBy: USER|ADMIN|SYSTEM, refunded? bool}`
  - `order.failed`: `{orderId, reason, stage: RESERVE|PAYMENT|OTHER}`
  - `review.moderated`: `{reviewId, productId, userId, status: APPROVED|REJECTED, rating, moderatedAt}` (catalog cập nhật rating_avg denormalized)
- [x] `contracts/events/README.md`: quy tắc additive-only (chỉ thêm field optional; đổi/xóa = breaking cấm), naming `<domain>.<event>`, exchange topic `ecommerce.events`, correlation từ `X-Request-Id`
- [x] Validate: `pnpm dlx ajv-cli compile` hoặc script node parse-all → pass (chọn 1, ghi lệnh vào README)
- [x] Commit: `feat(contracts): events schemas — envelope + 12 events, order.confirmed fat payload`

### Task 10: ts-codegen-packages-contracts

**Files:** Create `frontend/packages/contracts/package.json`, `frontend/packages/contracts/src/**` (generated + client factory), `frontend/packages/contracts/vitest.config.ts`? (theo preset config package — nếu cần); Modify `frontend/pnpm-workspace.yaml` (catalog thêm `openapi-typescript`, `json-schema-to-typescript` nếu chưa có)

- [ ] `package.json`: name `@ecommerce/contracts`; scripts: `gen` — chạy 2 bước: (1) `openapi-typescript` từng file `contracts/openapi/*.yaml` → `src/generated/<service>Schema.d.ts` (paths object types), (2) `json-schema-to-typescript` từng `contracts/events/*.schema.json` → `src/generated/events/<name>.d.ts`; `build` — tsc; `test` — vitest
- [ ] `src/index.ts` export barrels: `export type * from './generated/...'` + client factories
- [ ] Client factory `src/client.ts`: `createApiClient(service, opts)` — fetch wrapper: nhận `{baseURL, getToken?: () => string | null, fetchImpl?}`; tự gắn `Authorization: Bearer` khi có token + `X-Request-Id` (crypto.randomUUID nếu có — framework-portable: KHÔNG dùng browser API top-level, chỉ trong hàm); parse error → throw `ApiErrorClient` (mirror problem+json shape); method theo paths của từng service
- [ ] Smoke test (vitest): compile 1 client call kiểu-an-toàn (ví dụ `createIdentityClient(...).login({...})` typecheck) + mock fetch assert URL/header/parse problem+json → pass
- [ ] `pnpm -C frontend --filter @ecommerce/contracts gen && build && test` xanh
- [ ] COMMIT generated code (pack yêu cầu)
- [ ] Commit: `feat(contracts): TS codegen pipeline + typed clients + smoke test`

### Task 11: packages-auth-rs256-refresh-rolesingleton

**Files:** Create `frontend/packages/auth/package.json`, `src/{AuthStore.ts, provider.tsx, useAuth.ts, index.ts}`, `src/__tests__/authStore.test.ts`

- [x] `AuthStore` (singleton `export const authStore`): state `accessToken` in-memory ONLY (KHÔNG localStorage — XSS), `user {id, roles}` decode từ JWT payload (RS256 — decode phần payload base64, KHÔNG verify chữ ký client-side); `refresh()` gọi `POST /api/identity/auth/refresh` (cookie httpOnly, `credentials: 'include'`); **auto-refresh on 401 với request queue**: fetch wrapper chờ 1 refresh duy nhất rồi retry toàn bộ; `hasRole(...roles)`; `logout()`; `subscribe(listener)` cho UI re-render
- [x] Config inject được: `configureAuth({refreshUrl, loginPath?})` — KHÔNG hardcode URL (framework-portable D16, storefront-web dùng lại được)
- [x] `AuthProvider` + `useAuth()` (react; import react qua peerDep) + re-export singleton
- [x] Unit tests (vitest): set/get token; 401 → refresh 1 lần + 2 request hàng đợi đều retry; refresh fail → logout; `hasRole` admin/customer; không rò token ra storage
- [x] `pnpm -C frontend --filter @ecommerce/auth test` xanh
- [x] Commit: `feat(auth): AuthStore singleton — in-memory token, refresh queue on 401, hasRole, useAuth`

### Task 12: ui-kit-v1-tokens-primitives-2themes

**Files:** Create `frontend/packages/ui-kit/package.json`, `src/styles/tokens.css`, `src/components/{Button,Input,Select,Card,Badge,Modal,Drawer,Tabs,Table,Toast,StarRating,Price,Skeleton,EmptyState}.tsx`, `src/components/index.ts`, `src/demo/UiKitDemo.tsx`, `src/demo/index.ts`

- [x] `tokens.css`: CSS variables 2 theme qua `[data-theme="storefront"]` + `[data-theme="admin"]` — scale: `--c-*` (primary, primary-hover, bg, surface, text, text-muted, border, danger, warning, success, focus), `--space-1..8`, `--radius-sm/md/lg/full`, `--font-sans/serif?`, `--text-xs..3xl`, `--shadow-1..3`. Giá trị v1 = neutral sạch (sẽ hoàn thiện theo hướng designer ở Task 16)
- [x] 14 primitives (Tailwind KHÔNG bắt buộc ở đây — dùng CSS vars thuần cho tính portable; mỗi component `<button class="uk-btn">` + styles trong `ui-kit.css`): Button (variant primary/secondary/ghost/danger, size, loading), Input (label, error, hint), Select, Card, Badge (variant theo `--c-*`), Modal (portal + focus trap + ESC), Drawer (trái/phải), Tabs (keyboard ←→), Table (thead/tbody/empty), Toast (provider + useToast), StarRating (hiển thị + nhập, half-star), **Price (VND `Intl.NumberFormat('vi-VN', {style:'currency', currency:'VND'})` + giá gạch strikethrough prop + badge %)**, Skeleton, EmptyState
- [x] **Framework-portable (D16):** không browser-only API ở module top-level (localStorage/window chỉ trong effect/handler); components dùng được trong Next Server import (client boundary do app lo) lẫn Vite MFE
- [x] `UiKitDemo`: render từng component + showcase bảng giá VND (1.290.000 ₫) + **theme switcher** đổi `data-theme` trên `<html>` (storefront ↔ admin) — demo được mount ở shell route `/ui-kit` (Task 14)
- [x] Vitest: Price format đúng "1.290.000 ₫"; StarRating value; Badge variant class
- [x] Commit: `feat(ui-kit): v1 — tokens 2 theme + 14 primitives + Price VND + demo page`

### Task 13: i18n-vi-en

**Files:** Create `frontend/packages/i18n/package.json`, `src/{init.ts, useT.ts, catalogs/vi.ts, catalogs/en.ts, index.ts}`, `src/__tests__/i18n.test.ts`

- [x] i18next init (export `initI18n({lang?})` — idempotent, framework-portable): `vi` default + `en` fallback `vi`; resources chỉ **chrome chung** (nav: home/cart/checkout/account/admin/login/register/logout; auth: email/password/login/register/forgot; actions: save/cancel/delete/edit/search/addToCart/buyNow; common: loading/empty/error/retry/currency)
- [x] `useT()` = wrapper react-i18next trả `{t, lang, setLang}`; KHÔNG init tại module top-level
- [x] Test: default vi; switch en dịch đúng key; key thiếu → fallback vi
- [x] Commit: `feat(i18n): i18next vi/en — chrome catalogs + useT`

### Task 14: federation-harness-shell-skeleton-remote

**Files:** Create `frontend/apps/shell/**` (package.json, vite.config.ts, index.html, src/{main.tsx, App.tsx, header/{Header.tsx, HeaderSlots.ts}, routes.tsx? (registry), pages/{Home.tsx, RemotePage.tsx, UiKitDemoPage.tsx}}), Create `frontend/apps/_skeleton-remote/**` (package.json, vite.config.ts, index.html, src/{main.tsx, Page.tsx, HeaderWidget.tsx}), Modify `.env.example` (append `REMOTE_SKELETON_URL=http://localhost:5178` + comment skeleton là harness fixture), Modify `frontend/packages/config/vite-preset.mjs` (additive: thêm `@ecommerce/auth`, `@ecommerce/ui-kit`, `@ecommerce/i18n` vào SHARED_SINGLETONS — pack pin shared: react, react-dom, auth, ui-kit, i18n; react-router VẪN không shared)

- [ ] `shell` (host, port **5173**): `defineMfeConfig({name: 'shell_host', remotes: {skeleton: \`skeleton@\${process.env.REMOTE_SKELETON_URL ?? 'http://localhost:5178'}/remoteEntry.js\`}})`; routes: `/` Home, `/skeleton` → remote `skeleton/Page` (import qua module federation), `/ui-kit` → UiKitDemo; Header dùng **SLOT REGISTRY**:
  ```ts
  // HeaderSlots — registry API (additive, SF-6/7 đăng ký từ remote của chúng)
  type SlotKey = 'left' | 'center' | 'right';
  export const HeaderSlots = {
    register(slot: SlotKey, id: string, Component: React.ComponentType): void,
    unregister(slot: SlotKey, id: string): void,
    list(slot: SlotKey): React.ComponentType[]
  };
  ```
  Shell đăng ký 1 item mặc định (logo/nav) + **load HeaderWidget từ skeleton remote rồi `HeaderSlots.register('right', 'skeleton-demo', HeaderWidget)`** — chứng minh remote đăng ký được mà KHÔNG sửa file Header
- [ ] `_skeleton-remote` (port **5178**, package name `@ecommerce/skeleton-remote`): expose `./Page` + `./HeaderWidget`; Page dùng `@ecommerce/ui-kit` Button + `useT()` + đọc `authStore` (chứng minh shared singletons xuyên boundary); **Page render chip kiểm chứng React singleton:**
  ```tsx
  import React from 'react';
  // shell gắn window.__shellReact__ trước khi load remote
  const sameReact = (window as any).__shellReact__ === React;
  <span data-testid="react-singleton">{sameReact ? 'REACT ✓ 1 INSTANCE' : 'REACT ✗ DUPLICATE'}</span>
  ```
- [ ] Ports: shell 5173 / skeleton 5178 (5174-5177 dành storefront/checkout/account/admin theo .env.example SF-1)
- [ ] Chạy: `pnpm -C frontend install` → 2 terminal: `pnpm -C frontend --filter @ecommerce/skeleton-remote dev` + `pnpm -C frontend --filter shell dev` (Makefile dev-fe KHÔNG có skeleton — READ-ONLY, flag coordinator trong báo cáo)
- [ ] Verify thủ công (bắt buộc trước commit): mở `http://localhost:5173/skeleton` — page remote render TRONG layout shell (header shell vẫn hiện) + chip `REACT ✓ 1 INSTANCE`; console sạch duplicate-react warning; widget từ remote hiện trong header
- [ ] Commit: `feat(harness): MF shell + skeleton remote — slot registry, shared singletons 1 React`

### Task 15: designer-mockup-3huong-user-gate (song song từ đầu — KHÔNG chặn Task 1-14)

**Files:** Create `docs/superpowers/designs/fi310-storefront-direction.md` (SAU khi user chọn)

- [x] Designer agent (huashu-design + mock-prototype pipeline): **3 hướng** Tiki-inspired, mỗi hướng gồm: storefront **home** (hero + flash-deal countdown + featured) + **PLP** (sidebar danh mục + filter + sort + pagination) + **PDP** (gallery + info + variant + add-to-cart) + **header** (logo + search bar trung tâm + cart badge + account menu — sticky) + **1 admin dashboard** (KPI + chart + bảng low-stock) **dùng chung tokens** với hướng đó
- [x] Publish artifact links (unlisted) → coordinator đăng worktree comment + Linear comment FI-312 + hỏi user → **USER CHỌN = HARD GATE** (chỉ block SF-2, không block Task 1-14)
- [x] Sau lựa chọn: hand-off `docs/superpowers/designs/fi310-storefront-direction.md` — hex tokens (color scale đầy đủ), spacing scale, radius/typography/shadow, cấu trúc layout (header breakpoint, grid), behavior notes (hover, transition, countdown format), link artifact hướng được chọn
- [x] Commit: `docs(design): storefront direction hand-off — hướng được user chọn`

### Task 16: uikit-tokens-refine-per-direction

**Files:** Modify `frontend/packages/ui-kit/src/styles/tokens.css` (+ `ui-kit.css` nếu cần), Modify `frontend/packages/i18n/src/catalogs/*` (polish nhãn theo hướng nếu cần)

- [ ] Đọc hand-off doc → thay giá trị tokens v1 neutral bằng tokens hướng được chọn (giữ NGUYÊN tên biến — chỉ đổi value; thêm biến mới = additive)
- [ ] Demo page + shell harness mở lại → 2 theme vẫn switch được, Price VND đúng, không vỡ layout
- [ ] Snapshot so tokens.css với hand-off (spot-check ≥5 hex khớp)
- [ ] Commit: `feat(ui-kit): tokens hoàn thiện theo hướng <tên-hướng> (hand-off fi310)`

---

## Phụ thuộc (DAG)

```
T1..T9 (contracts, files rời nhau — tuần tự 1 executor hoặc chia 2) ─┐
T10 codegen ← (T1..T9)                                              │
T11 auth ──┐                                                        │
T12 ui-kit ─┼─ T14 harness (cần 11+12+13)                           │
T13 i18n ──┘                                                        │
T15 designer (nền độc lập — CHẠY SONG SONG từ đầu; gate USER) ── T16 tokens-refine (cần T12 + gate xong)
```

Execution groups (rolling review — code-reviewer độc lập giữa các nhóm):
- **G1:** T1-T5 → review → **G2:** T6-T9 → review → **G3:** T10 → **G4:** T11+T13 rồi T12 → **G5:** T14 → review → **[USER GATE T15]** → **G6:** T16 → verify Phase 5.

## Acceptance tổng (Phase 5 verify từng dòng — từ pack)

1. Specs lint 0 error (10 file); checklist §6.1 đủ items (comment Linear liệt kê từng dòng)
2. `pnpm gen` sạch; `@ecommerce/contracts` build xanh; smoke test client call pass
3. `@ecommerce/auth` unit tests xanh (store, refresh-on-401 queue, hasRole)
4. Browser: page skeleton remote render TRONG shell layout; console KHÔNG 2 bản React; slot registry demo (widget remote trong header)
5. ui-kit demo mở được; switch 2 theme; Price VND đúng
6. User đã chọn 1/3 hướng; `docs/superpowers/designs/fi310-storefront-direction.md` tồn tại
7. Merge → `story/fi310-ecommerce-platform` + `story-verify sf-2` sạch → FI-312 Done
