# SF-2 Context Pack — contracts-design-foundation

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> SF này SỞ HỮU `contracts/` — sau khi SF-2 merge, mọi SF khác coi `contracts/` + `frontend/packages/contracts/` là READ-ONLY.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)

1. **10 OpenAPI 3.1 specs** trong `contracts/openapi/`: `identity.yaml`, `catalog.yaml`, `cart.yaml`, `ordering.yaml`, `payment.yaml`, `inventory.yaml`, `notification.yaml`, **`invoice.yaml` (nội bộ cho Python renderer D18 — `POST /api/invoice/generate`, pydantic-side mirror ở `services/invoice-service/`; đánh dấu internal-only, không route qua gateway)**, **`partner-api.yaml` (D19 — namespace `/open-api/v1/**`: products/categories/search/orders + schemas API key auth + webhook HMAC payload)**, **`affiliate.yaml` (D20 — registry/ref/track/ledger + admin approve/rate)**. Pins BẮT BUỘC (spec §6.1 — checklist review từng item):
   - `variant_id` xuất hiện trong: cart item, order line, reservation request/items.
   - `ordering.yaml`: order status enum `PENDING|PAID|CONFIRMED|SHIPPED|DELIVERED|CANCELLED|FAILED` + transition table §3.6; `POST /api/ordering/orders` (header `Idempotency-Key`) → `{order, clientSecret}`; `POST /api/ordering/orders/validate-coupon`; admin stats: `GET /api/ordering/admin/stats/revenue-by-day`, `/admin/stats/orders-summary`, `/admin/stats/top-products`; admin orders list/detail + `POST .../{id}/ship|deliver|cancel`; `GET /api/ordering/me/orders`, `/{id}`, `/{id}/cancel`.
   - `payment.yaml` endpoints REST (ordering sẽ gọi): `POST /api/payment/intents`, `POST /api/payment/webhook`, `POST /api/payment/refunds`, `POST /api/payment/void`.
   - `inventory.yaml`: `POST /api/inventory/reservations` (all-or-nothing; lỗi 409 kèm `insufficient[]`), `GET /api/inventory/availability?variant_ids=`, `GET /api/inventory/admin/low-stock`.
   - `cart.yaml`: guest `cart_token`; `POST /api/cart/merge`; item shape `{product_id, variant_id, qty}` + response enrich `unavailable` flag.
   - `identity.yaml`: register/login/refresh/logout/me + JWKS path + `GET /api/identity/admin/users`.
   - `catalog.yaml`: products list (filters category/price/rating/brand, sort, page), detail by slug, categories tree, search + suggest (**mọi content endpoint nhận `?locale=vi|en` + `Accept-Language`, fallback `vi` — D17**; trường i18n trong schema đánh dấu `{vi,en}` object), admin products/categories CRUD (**product schema gồm trường i18n `{vi,en}` + `seo_title`/`seo_description` nullable i18n + slug vi/en — D16/D17**), reviews (submit/approve/reject/list + rating breakdown — UGC không i18n), wishlist (me), `GET /api/catalog/me/wishlist/ids`.
   - `ordering.yaml` bổ sung: `GET /api/ordering/coupons/public` (danh sách coupon active cho coupon center — code gợi ý, type, giá trị tối thiểu, window; KHÔNG lộ usage nội bộ); **hóa đơn (D18): `GET /api/ordering/me/orders/{id}/invoice` + `GET /api/ordering/admin/orders/{id}/invoice` → `application/pdf` (InvoiceProvider SPI, số HĐ tuần tự)**; **`POST /orders` thêm field `payment_method: stripe|cod` (default stripe — D21: COD → saga bỏ bước intent, CONFIRMED ngay sau reserve; PAID lúc admin giao)**.
   - `identity.yaml` bổ sung (D21): `POST /api/identity/password/forgot` (email → token 30', email qua notification) + `POST /api/identity/password/reset` (token + mật khẩu mới). **Bổ sung D22**: OAuth Google/Facebook (`GET /oauth/{provider}` + callback, find-or-create + link email) + 2FA TOTP (`POST /2fa/setup|enable|disable|verify`, login flow trả `two_factor_required`).
   - `catalog.yaml` bổ sung (D21): `POST /api/catalog/admin/uploads` (multipart → MinIO, trả URL public `/media/**` qua gateway) — giới hạn 5MB/ảnh, jpg/png/webp. **Bổ sung D22**: `POST /api/catalog/products/{slug}/stock-alert` (email + variant, public) + admin `related` (more_like_this) nếu cần endpoint riêng.
   - `ordering.yaml` bổ sung (D22): RMA paths (`/me/rma` create/list, `/admin/rma` approve|reject|mark-received|refund — trạng thái REQUESTED→APPROVED→RECEIVED→REFUNDED/REJECTED, window 7 ngày), shipping (`GET /shipping/methods`, order có `shipping_method` + `tracking_code` + `GET /me/orders/{id}/tracking`), loyalty (`POST /orders` nhận `use_points` + response `points_discount`; internal `/internal/loyalty/redeem` ở affiliate.yaml).
   - Response lỗi = problem+json (khớp common-lib `ApiError`). Mọi path qua prefix `/api/{service}`.
2. **Events JSON Schema** `contracts/events/`: envelope chung + `user.created`, `product.changed`, `inventory.reserved|released|committed`, `payment.succeeded|failed`, `order.created|paid|confirmed|cancelled|failed`, `review.moderated`. `order.confirmed` FAT: `{order_id, user_id, email, items[{product_id, variant_id, qty, price}], subtotal, discount, total, coupon_code, affiliate_code nullable}`. Additive-only rule ghi README.
3. **TS codegen**: turbo pipeline `gen` — openapi-typescript + json-schema-to-typescript → `frontend/packages/contracts/src/generated/**` + typed client factory per service (fetch wrapper nhận `baseURL` + `getToken()` từ packages/auth). COMMIT generated code.
4. **`frontend/packages/auth`**: AuthStore singleton (access token in-memory; refresh qua cookie httpOnly), auto-refresh on 401 (queue requests), `hasRole()`, `useAuth()` + provider, export tên shared cho MF config.
5. **`frontend/packages/ui-kit`**: `tokens.css` (color/spacing/radius/typography/shadow) + 2 theme (`storefront`, `admin` — CSS vars, switch bằng `data-theme`); primitives: Button, Input, Select, Card, Badge, Modal, Drawer, Tabs, Table, Toast, StarRating, Price (VND format vi-VN), Skeleton, EmptyState; demo page cho từng component + theme switcher. **Framework-portable (D16)**: không dùng browser-only API ở module top-level — components dùng được cả trong Next Server/Client Components lẫn Vite MFE.
6. **`frontend/packages/i18n`**: i18next init + vi (default) / en catalogs cho chrome chung (nav, auth labels, actions), `useT()`.
7. **Federation harness**: `frontend/apps/shell` (MF host: remote manifest từ env `REMOTE_*_URL`; **header có SLOT REGISTRY** — `HeaderSlots.register('right', Component)` để SF sau đăng ký auth/cart-badge từ remote app, KHÔNG sửa file Header; route registry trống), `frontend/apps/_skeleton-remote` (expose 1 page). Shared singletons: react, react-dom, packages/auth, ui-kit, i18n (KHÔNG react-router — routing của shell). Verify: 1 instance React, remote load trong layout, route động hoạt động. **Lưu ý D16**: storefront là Next.js app riêng (`storefront-web`, SF-4) — KHÔNG thuộc shell; harness chứng minh pattern cho 3 remotes: checkout/account/admin. Search bar nằm trong header riêng của Next app, không phải slot shell.
8. **Designer mock-prototype** (designer agent, huashu-design): 3 hướng Tiki-inspired (home + PLP + PDP + header storefront, kèm 1 admin dashboard mockup dùng chung tokens) → publish artifacts → **USER CHỌN (hard gate)** → hand-off `docs/superpowers/designs/fi310-storefront-direction.md` (hex tokens, spacing, structure, behavior notes). Contract freeze KHÔNG chờ gate này; ui-kit tokens hoàn thiện THEO hướng được chọn.
9. Ghi `.env.example` (append): `REMOTE_ACCOUNT_URL=http://localhost:5177`, `REMOTE_STOREFRONT_URL=...5174`, `REMOTE_CHECKOUT_URL=...5176`, `REMOTE_ADMIN_URL=...5175` (số port agent chốt, ghi rõ).

## Touch map (files SF-2 tạo/sở hữu)

```
contracts/** (TOÀN BỘ — SF-2 là chủ cuối cùng)
frontend/packages/contracts/** · frontend/packages/auth/** · frontend/packages/ui-kit/** · frontend/packages/i18n/**
frontend/apps/shell/** · frontend/apps/_skeleton-remote/**
.env.example (append REMOTE_*/ports)
```
READ-ONLY: `backend/**`, `docker-compose.yml`, `Makefile`, `frontend/packages/config` (chỉ additive nếu thiếu preset).

## ACCEPTANCE (user-visible)

- Specs lint (spectral/redocly) 0 error; PR có checklist §6.1 đủ items.
- `pnpm gen` sạch; `packages/contracts` build xanh; 1 smoke test compile 1 client call.
- `packages/auth` unit tests xanh (store, refresh-on-401, hasRole).
- Federation harness: browser thấy page từ skeleton remote render TRONG shell layout; console không có 2 bản React; header slot registry demo được.
- ui-kit demo page mở được, switch 2 theme được, Price format VND đúng.
- USER đã chọn 1/3 hướng design; `docs/superpowers/designs/fi310-storefront-direction.md` tồn tại.

## Boundary (KHÔNG làm)

- KHÔNG implement service business nào; KHÔNG wiring JWT gateway (SF-3).
- KHÔNG dựng storefront/admin pages thật (SF-4/7) — skeleton remote chỉ là harness.
- KHÔNG đụng Makefile/compose (nếu thiếu thứ gì → flag coordinator).
- Sau merge: contracts đóng băng — mọi amendment chỉ qua coordinator.
