# Spec: SF-7 admin MFE (FI-317) — story FI-310

Status: Approved (story-mode — epic spec + context pack `docs/superpowers/contexts/sf-7.md` đã duyệt direction; brainstorm self-answered autonomous, không có câu epic-level mở)

## 0. Root cause / bối cảnh

Story FI-310 cần proof "admin quản trị được": admin tạo product phải thấy ngay trên storefront SF-4 (live). Backend T2 đã có catalog admin CRUD (products/categories) + inventory low-stock; ordering/moderation là SF-8/9 (cùng T3, chưa merge) → các domain đó mock theo contract, toggle `VITE_ADMIN_STUB=1` mặc định ON để SF-10 wire live.

Hiện trạng (đã probe code):
- catalog-service: `AdminProductController` + `AdminCategoryController` CÓ; KHÔNG có admin reviews controller → reviews MOCK đúng pack.
- inventory-service: `GET /inventory/admin/low-stock` CÓ → LIVE.
- contracts clients: `adminListProducts/Create/Get/Update/Delete`, `adminListCategories/Create/Get/Update/Delete`, `adminListReviews/Approve/Reject`, `listLowStock`, ordering admin (orders/stats) — đầy đủ type.
- `ordering.yaml` KHÔNG có coupon admin CRUD (chỉ validate + public list) → coupons mock tự định nghĩa shape theo `PublicCoupon` + usage/active (pack quy định).
- Pattern remote: mfe-account (Vite MF remote, exposes, ShellContext 1 chiều, port .env `REMOTE_ADMIN_URL=http://localhost:5177`).
- Auth: `authStore` singleton shared; `authStore.fetch` = 401 → single-flight refresh → retry.

## 1. Problem

Admin chưa có UI vận hành. Success = ACCEPTANCE pack:
1. Guest `/admin` → redirect login; customer → trang 403.
2. Admin tạo product (publish) → storefront thấy trong ~60s; sửa giá → PDP cập nhật.
3. Categories: tạo con/đổi parent không vỡ tree; xóa có sản phẩm → chặn + message.
4. Coupons/Reviews/Orders render data mock, actions đúng shape (approve/ship/cancel) — không đòi backend thật.
5. Dashboard: low-stock LIVE từ inventory; charts vẽ với mock revenue; KPI VND đúng.

## 2. Scope

**In**: app `frontend/apps/mfe-admin` (layout + RBAC guards + products/categories CRUD live + product form i18n tabs + coupons/reviews/orders mock + dashboard KPI/charts/low-stock) + shell manifest `/admin` (3 append block) + i18n keys `admin.*` + vitest IT.
**Out** (boundary pack): không backend mới; không wire thật moderation/orders/coupons (SF-10); không users page; không upload MinIO (SF-13 — form dùng URL list); không sửa contracts/packages; shell ngoài 3 block append.

## 3. Touch map

- MỚI `frontend/apps/mfe-admin/**`: `vite.config.ts` (remote `mfe_admin`, :5177, proxy /api), `src/main.tsx` (standalone dev), `src/bootstrap.tsx` (expose entry: `initAdminShell(ctx)`, `authReady`, `appNavigate`), `src/lib/api.ts` (clients live), `src/lib/adminStub.ts` (mock adapters), `src/lib/format.ts` (VND, date), `src/AdminApp.tsx` (layout sidebar/topbar + guard + route table), `src/pages/*` (Dashboard, ProductsList, ProductForm, Categories, Coupons, Reviews, Orders, OrderDetail, Forbidden), `src/page.css`, `tests/*.test.ts`.
- Shell append: `vite.config.ts` (+remote `admin`), `src/remotes.d.ts` (+`admin/AdminApp`), `src/App.tsx` (+route `/admin*` — render full-bleed NGOÀI `<main maxWidth:960>`, vẫn giữ shell Header cho auth widget).
- `frontend/packages/i18n/src/catalogs/{vi,en}.ts`: append `admin.*` keys (additive).
- `frontend/apps/mfe-admin/package.json`: deps chuẩn workspace (`catalog:`) + `recharts` (không có trong catalog → version local `^2.15.0`); pnpm-lock regenerate.
- READ-ONLY: `backend/**`, `contracts/**`, `frontend/packages/**`, các mfe khác, `storefront-web`, `gateway-routes.yml`.

## 4. Design

### 4.1 Kiến trúc + routing
- Vite MF remote `mfe_admin` expose `./AdminApp` (component) + `./bootstrap` (init). Shell lazy-load khi path khớp `/admin` hoặc `/admin/**`; ErrorBoundary + Suspense như account.
- Routing nội bộ: AdminApp tự đọc `window.location.pathname` + popstate listener riêng (không mang router vào host). Links sidebar gọi `appNavigate` (ShellContext) khi trong shell, fallback pushState khi standalone. Route table: `/admin`, `/admin/dashboard` → Dashboard; `/admin/products` → list; `/admin/products/new` → form tạo; `/admin/products/:id` → form sửa; `/admin/categories`; `/admin/coupons`; `/admin/reviews`; `/admin/orders`; `/admin/orders/:id` → detail; khác → EmptyState 404.
- Theme: mount → lưu `data-theme` cũ + set `admin`; unmount → restore. Desktop-first 1280px.
- Full-bleed: route block của shell render `<AdminApp/>` trực tiếp (không qua `<main>` 960px); shell Header giữ nguyên (auth widget login/logout chung).

### 4.2 RBAC guard UX (server vẫn là gateway — SF-3)
Trạng thái `booting` → render skeleton; `await authStore.refresh()` (idempotent, single-flight; cả standalone lẫn trong shell — shell đã refresh qua mfe-account nhưng gọi lại vô hại):
- guest (refresh fail / không token) → `appNavigate('/login?next=' + encodeURIComponent(path))` (trong shell); standalone → EmptyState hướng dẫn chạy qua shell :5173.
- `!hasRole('admin')` → trang 403 "Không có quyền" (nút về `/`).
- admin → render app.

### 4.3 API layer + mock adapters
`lib/api.ts` dựng clients (`baseURL: ''` same-origin proxy, `getToken: authStore.getToken`, `fetchImpl: authStore.fetch`):
- LIVE LUÔN (kể cả stub ON): catalog admin products/categories + inventory `listLowStock`.
- MOCK (stub ON mặc định — `VITE_ADMIN_STUB !== '0'`): coupons CRUD, reviews moderation, orders (list/detail/ship/deliver/cancel/invoice), stats (orders-summary, revenue-by-day, top-products).
`lib/adminStub.ts`: interface `StubApi` + dữ liệu deterministic (fixed ids/dates/sums; 4 coupons, 5 reviews PENDING+trạng thái khác, 5 orders phủ PENDING/PAID/CONFIRMED/SHIPPED/DELIVERED/CANCELLED, 14 ngày revenue, 5 top products). Delay ~120ms giả lập network. Mutations lưu in-memory session (reload = reset — chấp nhận, mock sống tới SF-10).
- Orders mock state machine §3.6: ship chỉ từ CONFIRMED (mock không sinh PAID đơn lẻ — PAID cũng cho ship vì §3.6 PAID→CONFIRMED tự động), deliver từ SHIPPED, cancel từ PENDING/PAID/CONFIRMED. KHÔNG nút confirm.
- "Tải hóa đơn" (mock): stub tạo Blob PDF placeholder (`%PDF-1.4 ... Hoa don demo #<id>`) → download `hoa-don-<id>.pdf`.
- Reviews mock shape theo `ReviewAdmin` (productId/userName/rating/content/verifiedPurchase/status); approve/reject đổi status + rời queue PENDING.
- Coupons mock shape: `{id, code, type PERCENT|FIXED, value, minOrderValue?, startsAt?, endsAt?, usageLimit, usedCount, active, description}`.

### 4.4 Products (LIVE)
- **List**: table (ảnh thumb, tên vi, slug, giá, tồn variant tổng, status badge, category, cập nhật) + search `q` (server) + filter status (server) + filter category (client-side trên trang) + pagination (server `page/size`, size 10). Nút: Thêm sản phẩm; row: Sửa / Deactivate (soft-delete `adminDeleteProduct`, confirm modal).
- **Form** (create + edit cùng component): Tabs ui-kit:
  - **Thông tin**: sub-tabs vi/en cho tên + mô tả (en trống được → submit `en: ""`, server fallback vi — D17); slug vi/en (auto-từ tên vi khi trống, editable); brand; category select (tree flatten depth-first, indent "—"); checkbox "Chính hãng" → `tags: ["Chính hãng"]`.
  - **SEO**: `seoTitleI18n` + `seoDescriptionI18n` vi/en; placeholder = fallback tự sinh (title: tên vi; description: cắt 160 ký tự mô tả vi); bỏ trống → null.
  - **Giá**: price*, comparePrice (validate > price → cảnh báo), flashSaleEndsAt (datetime-local → ISO).
  - **Variants**: rows — name vi/en, options text `color=đỏ, size=XL` (parse → Record, hiển thị parse lỗi), priceDelta, stock. Không row nào → product không variant (amendment A1 variantId optional).
  - **Ảnh**: URL list + preview + alt + sort (lên/xuống → `position`).
  - Footer: status toggle Draft/Published + Lưu.
- Create publish thành công → toast + 2 link storefront (`{VITE_STOREFRONT_URL|http://localhost:3000}/p/<slugVi>`, `/en/p/<slugEn>`) mở tab mới. Edit → PUT toàn bộ `ProductWrite` (round-trip `ProductAdminView` → form: nameI18n/descriptionI18n/seo nullable/images/variants/status; `slugEn` từ ProductCard.slugEn).
- Payload mapping pure functions (`lib/productPayload.ts`) để unit test.

### 4.5 Categories (LIVE)
Tree view (recursive, expand mặc định) từ `adminListCategories` (CategoryAdmin: +nameI18n/slugVi). Create/edit inline form: name vi/en, slug vi/en (auto từ name vi), parent select (tree flatten, "— Gốc —"). Delete: gọi DELETE; 409 (có sản phẩm/con) → toast message chặn mềm từ `detail`.

### 4.6 Coupons (MOCK)
Table: code, type badge (PERCENT %/FIXED ₫), value, window (startsAt–endsAt), usage `used/usageLimit`, active toggle (stub). Form modal create/edit: code, type, value, minOrderValue, startsAt/endsAt (datetime-local), usageLimit, description, active.

### 4.7 Reviews moderation (MOCK)
Queue mặc định PENDING (filter status). Row: product (tên mock map productId), user, StarRating, title/content, verifiedPurchase badge, createdAt. Actions Approve/Reject → stub đổi status, row rời PENDING + toast.

### 4.8 Orders (MOCK)
- List: filter status (OrderStatus enum), từ/đến ngày (client filter createdAt), q, pagination. Row: id ngắn, ngày, user, itemsCount, total VND, paymentMethod badge, status badge.
- Detail route `/admin/orders/:id`: items (tên/qty/đơn giá/thành tiền), địa chỉ (Address), tổng (subtotal − discount + shippingFee = total), timeline (at + description, desc), coupon/affiliate code nếu có. Actions theo state (4.3) + nút "Tải hóa đơn".

### 4.9 Dashboard
- KPI tiles: Doanh thu hôm nay, Doanh thu 7 ngày (sum revenue-by-day 7 điểm cuối), Đơn hôm nay, AOV (totalRevenue/(đơn PAID+)) — `formatPrice` VND.
- Charts recharts: `RevenueByDay[]` 14 ngày → LineChart; `TopProduct[]` → BarChart ngang. Màu `var(--c-*)` tokens (stroke/fill qua CSS var), labels i18n, tooltip format VND. Recharts không có trong pnpm catalog → dep local mfe-admin.
- Low-stock table LIVE: variantId, product, available, threshold; available ≤ threshold → badge đỏ; EmptyState khi trống. Loading riêng (live có thể fail độc lập charts mock — lỗi live → error message trong card, không sập dashboard).

### 4.10 i18n
`admin.*` namespace vi/en: nav, actions, form labels, statuses, toasts, 403, dashboard/charts labels. UI vi-first, en catalog đầy đủ (D10 chrome). `useT` từ `@ecommerce/i18n` singleton.

### 4.11 Lỗi + trạng thái
- Table/page: Skeleton loading; EmptyState rỗng; lỗi live → EmptyState retry (mã lỗi từ `ApiErrorClient.detail`); 403 API → về guard 403.
- Toast success/fail mọi mutation (dùng `ToastProvider` + `useToast`).
- Không `dangerouslySetInnerHTML`; ảnh external `<img>` alt.

## 5. Impl outline + test strategy

Thứ tự: scaffold app + shell mounts → guard/403 → api layer + stub → products list/form → categories → coupons → reviews → orders → dashboard → polish/i18n → tests.
Vitest node env (theo pattern SF-4 `tests/`): guard states (guest/customer/admin — stub authStore), stub determinism + order state machine + invoice blob, product payload mapping (i18n trống → "", tags, variants parse, slug auto), coupon form payload. React render qua jsdom chỉ cho smoke AdminApp mount với fetch stub (jsdom đã có catalog). Build gate: `pnpm -C frontend --filter @ecommerce/mfe-admin build` (tsc --noEmit) + shell build + turbo build toàn workspace (không vỡ app khác).

## 6. Risks

- **Identity :8081 đụng keycloak trên máy** (memory) — verify bằng log khi browser test.
- **Shell main maxWidth** — đã thiết kế full-bleed block riêng.
- **authStore chưa configure khi mfe-account down** — AdminApp tự `configureAuth` trước refresh (idempotent, cùng giá trị).
- **VariantWrite options string parse** — validate + báo lỗi parse, không câm lặng.
- **recharts version xung đột peer** — pin ^2.15.0 (React 18 compat), local deps.
- **Merge conflict i18n catalogs với SF-6/8/9** — append-only keys, serialize commit (memory: shared-worktree parallel executors).
- **ProductWrite.en required nhưng rỗng được** — hợp đồng server fallback vi (D17); spec chốt submit `en: ""` (không null — I18nText.en là string required).
