# SF-2 Context Pack — contracts-design-foundation

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> SF này SỞ HỮU `contracts/` — sau khi SF-2 merge, mọi SF khác coi `contracts/` + `frontend/packages/contracts/` là READ-ONLY.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)

1. **7 OpenAPI 3.1 specs** trong `contracts/openapi/`: `identity.yaml`, `catalog.yaml`, `cart.yaml`, `ordering.yaml`, `payment.yaml`, `inventory.yaml`, `notification.yaml`. Pins BẮT BUỘC (spec §6.1 — checklist review từng item):
   - `variant_id` xuất hiện trong: cart item, order line, reservation request/items.
   - `ordering.yaml`: order status enum `PENDING|PAID|CONFIRMED|SHIPPED|DELIVERED|CANCELLED|FAILED` + transition table §3.6; `POST /api/ordering/orders` (header `Idempotency-Key`) → `{order, clientSecret}`; `POST /api/ordering/orders/validate-coupon`; admin stats: `GET /api/ordering/admin/stats/revenue-by-day`, `/admin/stats/orders-summary`, `/admin/stats/top-products`; admin orders list/detail + `POST .../{id}/ship|deliver|cancel`; `GET /api/ordering/me/orders`, `/{id}`, `/{id}/cancel`.
   - `payment.yaml` endpoints REST (ordering sẽ gọi): `POST /api/payment/intents`, `POST /api/payment/webhook`, `POST /api/payment/refunds`, `POST /api/payment/void`.
   - `inventory.yaml`: `POST /api/inventory/reservations` (all-or-nothing; lỗi 409 kèm `insufficient[]`), `GET /api/inventory/availability?variant_ids=`, `GET /api/inventory/admin/low-stock`.
   - `cart.yaml`: guest `cart_token`; `POST /api/cart/merge`; item shape `{product_id, variant_id, qty}` + response enrich `unavailable` flag.
   - `identity.yaml`: register/login/refresh/logout/me + JWKS path + `GET /api/identity/admin/users`.
   - `catalog.yaml`: products list (filters category/price/rating/brand, sort, page), detail by slug, categories tree, search + suggest, admin products/categories CRUD, reviews (submit/approve/reject/list + rating breakdown), wishlist (me), `GET /api/catalog/me/wishlist/ids`.
   - Response lỗi = problem+json (khớp common-lib `ApiError`). Mọi path qua prefix `/api/{service}`.
2. **Events JSON Schema** `contracts/events/`: envelope chung + `user.created`, `product.changed`, `inventory.reserved|released|committed`, `payment.succeeded|failed`, `order.created|paid|confirmed|cancelled|failed`, `review.moderated`. `order.confirmed` FAT: `{order_id, user_id, email, items[{product_id, variant_id, qty, price}], subtotal, discount, total, coupon_code}`. Additive-only rule ghi README.
3. **TS codegen**: turbo pipeline `gen` — openapi-typescript + json-schema-to-typescript → `frontend/packages/contracts/src/generated/**` + typed client factory per service (fetch wrapper nhận `baseURL` + `getToken()` từ packages/auth). COMMIT generated code.
4. **`frontend/packages/auth`**: AuthStore singleton (access token in-memory; refresh qua cookie httpOnly), auto-refresh on 401 (queue requests), `hasRole()`, `useAuth()` + provider, export tên shared cho MF config.
5. **`frontend/packages/ui-kit`**: `tokens.css` (color/spacing/radius/typography/shadow) + 2 theme (`storefront`, `admin` — CSS vars, switch bằng `data-theme`); primitives: Button, Input, Select, Card, Badge, Modal, Drawer, Tabs, Table, Toast, StarRating, Price (VND format vi-VN), Skeleton, EmptyState; demo page cho từng component + theme switcher.
6. **`frontend/packages/i18n`**: i18next init + vi (default) / en catalogs cho chrome chung (nav, auth labels, actions), `useT()`.
7. **Federation harness**: `frontend/apps/shell` (MF host: remote manifest từ env `REMOTE_*_URL`; **header có SLOT REGISTRY** — `HeaderSlots.register('center'|'right', Component)` để SF sau đăng ký search/auth/cart-badge từ remote app, KHÔNG sửa file Header; route registry trống), `frontend/apps/_skeleton-remote` (expose 1 page). Shared singletons: react, react-dom, packages/auth, ui-kit, i18n (KHÔNG react-router — routing của shell). Verify: 1 instance React, remote load trong layout, route động hoạt động.
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
