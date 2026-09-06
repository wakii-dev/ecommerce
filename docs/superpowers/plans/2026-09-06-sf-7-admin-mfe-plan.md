# SF-7 admin MFE Implementation Plan (FI-317)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin MFE `/admin` — RBAC guard UX + products/categories CRUD LIVE (tạo product thấy ngay trên storefront SF-4) + coupons/reviews/orders mock theo contract + dashboard KPI/charts/low-stock live.

**Architecture:** Vite MF remote `mfe_admin` :5177 expose `AdminApp` + `bootstrap` (pattern mfe-account: ShellContext 1 chiều, không mang router vào host). Live = contracts clients (`authStore.fetch` 401-refresh-retry); mock = `lib/adminStub.ts` deterministic toggle `VITE_ADMIN_STUB`. Shell mount append-only 3 block; `/admin` render full-bleed ngoài `<main>` 960px.

**Tech Stack:** Vite 5 + React 18 + Module Federation (`@module-federation/vite`), `@ecommerce/{auth,ui-kit,i18n,contracts}`, recharts ^2.15.0 (local dep), vitest (node env + 1 jsdom smoke).

**Linear Issue:** FI-317

**Spec:** `docs/superpowers/specs/2026-09-06-sf-7-admin-mfe-design.md`

---

### Task 1: mfe-admin scaffold + shell mounts + i18n keys

**Files:**
- Create: `frontend/apps/mfe-admin/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/bootstrap.tsx`, `src/page.css`
- Modify: `frontend/apps/shell/vite.config.ts` (+remote `admin`), `src/remotes.d.ts` (+`admin/AdminApp`), `src/App.tsx` (+route `/admin*` full-bleed)
- Modify: `frontend/packages/i18n/src/catalogs/vi.ts`, `en.ts` (append `admin` namespace)

- [x] Scaffold như mfe-account: remote name `mfe_admin`, exposes `./bootstrap`, `./AdminApp`; port 5177; proxy `/api` → gateway; deps `catalog:` + `@ecommerce/contracts` + `recharts: ^2.15.0`
- [x] `bootstrap.tsx`: `initAdminShell(ctx)` lưu `navigateRef` + `configureAuth` idempotent (cùng giá trị account dùng), `authReady`, `appNavigate`
- [x] `main.tsx` standalone: `__shellReact__`, `data-theme='admin'`, render AdminApp
- [x] Shell: `admin: { type: 'module', name: 'mfe_admin', entry: REMOTE_ADMIN_URL ?? :5177 }`; declare module; App.tsx — path startsWith `/admin` → ErrorBoundary + Suspense lazy `admin/AdminApp`, render NGOÀI `<main>` (trả trực tiếp trong AuthProvider)
- [x] i18n `admin` namespace vi/en: nav (dashboard/products/categories/coupons/reviews/orders), common (save/cancel/edit/delete/create/search/loading/confirm), products labels, statuses (DRAFT/PUBLISHED/PENDING/APPROVED/REJECTED + order states), 403 (title/desc/back), toasts (saved/deleted/error)
- [x] `pnpm -C frontend install` (lockfile regen); build xanh: `pnpm -C frontend --filter @ecommerce/mfe-admin build` + `--filter @ecommerce/shell build`
- [x] Commit: `feat(admin): mfe-admin scaffold + shell /admin mount + i18n admin keys`

### Task 2: RBAC guard + layout + route table + 403

**Files:**
- Create: `src/AdminApp.tsx` (guard + sidebar/topbar + theme + routes), `src/pages/ForbiddenPage.tsx`
- Test: `tests/guard.test.ts`

- [x] Guard: state `booting|ok|guest|forbidden`; mount → `configureAuth` → `authStore.refresh()` settle → guest → `appNavigate('/login?next=' + enc(path))` (standalone: EmptyState hướng dẫn); `!hasRole('admin')` → Forbidden; admin → layout
- [x] Theme: lưu prev `documentElement.dataset.theme` → set `admin`; cleanup restore
- [x] Layout: bọc `ToastProvider` (ui-kit) quanh app con; sidebar (6 nav items active theo path prefix), topbar (user fullName/email từ `useAuth()` + nút Đăng xuất `logout()` + `appNavigate('/')`, link xem storefront)
- [x] Routes: `/admin`, `/admin/dashboard` → placeholder Dashboard; `/admin/products` → placeholder; ... (mỗi page placeholder EmptyState cho tới task tương ứng); fallback EmptyState 404
- [x] Tests (node, stub `authStore`): guest → không render layout; customer → Forbidden text; admin → render nav 6 items
- [x] Commit: `feat(admin): rbac guard + layout + route table + 403`

### Task 3: API layer + adminStub deterministic + order state machine

**Files:**
- Create: `src/lib/api.ts` (clients live + `isStubOn()`), `src/lib/adminStub.ts` (dữ liệu + mutations in-memory), `src/lib/types.ts` (StubCoupon, StubReview, StubOrder...), `src/lib/invoice.ts` (Blob PDF placeholder)
- Test: `tests/stub.test.ts`

- [x] `api.ts`: `createCatalogClient/createInventoryClient` với `baseURL: ''`, `getToken: authStore.getToken`, `fetchImpl: authStore.fetch`; export `catalogApi`, `inventoryApi`, `orderingApi` (dùng khi stub off)
- [x] Stub data deterministic (fixed ids `c1..c4`, `r1..r5`, `o1..o5`, dates 2026-09-01..06, totals round); orders phủ 6 statuses; revenue-by-day 14 điểm (from=today-13, pattern cố định), orders-summary (todayRevenue 4_250_000...), top-products 5
- [x] Mutations: coupon create/update/toggleActive; review approve/reject; order ship/deliver/cancel — **state machine**: ship từ PAID|CONFIRMED, deliver từ SHIPPED, cancel từ PENDING|PAID|CONFIRMED; sai → throw `Error('INVALID_TRANSITION')`; timeline push `{at, description}`
- [x] `invoiceBlob(orderId)`: `%PDF-1.4` header + text hóa đơn demo → Blob `application/pdf`
- [x] Tests: determinism (2 lần newStubApi() cùng giá trị), transitions hợp lệ/chặn, approve đổi status + rời PENDING, invoice blob starts `%PDF`
- [x] Commit: `feat(admin): live api layer + deterministic stub adapters + order state machine`

### Task 4: Products list LIVE + Categories CRUD LIVE

**Files:**
- Create: `src/pages/ProductsListPage.tsx`, `src/pages/CategoriesPage.tsx`, `src/lib/productPayload.ts` (slugify + tree flatten), `src/lib/format.ts` (formatVnd wrapper, formatDate)
- Test: `tests/productPayload.test.ts`

- [x] List: `adminListProducts({page,size:10,q,status})` qua TanStack Query; columns ảnh/tên vi/slug/giá (formatVnd)/status badge/category/actions (Sửa→navigate, Deactivate→Modal confirm→`adminDeleteProduct`→invalidate); filter category client-side trên trang; pagination controls (Trước/Sau + total)
- [x] Categories: `adminListCategories` tree recursive render (expand, indent); form thêm/sửa (name vi/en, slug vi/en auto từ name vi qua slugify — editable, parent Select flatten "— Gốc —"); delete → 409 → toast `detail` (chặn mềm)
- [x] `slugify()`: lowercase, đà→a, đ→d, bỏ dấu, space→`; tree flatten depth-first với depth
- [x] Tests: slugify tiếng Việt, flatten depth, payload category create (en rỗng → "")
- [x] Commit: `feat(admin): products list + categories CRUD live`

### Task 5: Product form i18n tabs (create/edit)

**Files:**
- Create: `src/pages/ProductFormPage.tsx` (Tabs: info/seo/price/variants/images), `src/lib/productForm.ts` (state + payload mapping)
- Test: `tests/productForm.test.ts`

- [x] Create: form state; edit: `adminGetProduct(id)` → state (nameI18n/descriptionI18n/seo nullable/images/variants/status/slugEn)
- [x] Thông tin: sub-tabs vi/en (tên, mô tả textarea) — en trống → `""`; slug vi/en auto từ tên vi khi chưa sửa tay; brand; category Select; checkbox Chính hãng → tags
- [x] SEO: seoTitle/seoDescription vi/en; placeholder fallback tự sinh (tên vi; cắt 160 ký tự mô tả vi); trống → undefined (null seo)
- [x] Giá: price* (number), comparePrice (validate > price → text cảnh báo, vẫn submit), flashSaleEndsAt datetime-local → ISO
- [x] Variants: rows {nameVi, nameEn, optionsText `k=v, k=v`, priceDelta, stock}; parse → Record + lỗi parse hiển thị; row xóa/thêm
- [x] Ảnh: rows url + alt + lên/xuống (position = index); preview img
- [x] Submit → `adminCreateProduct`/`adminUpdateProduct(ProductWrite)`; publish create xong → toast + 2 link storefront tab mới (`VITE_STOREFRONT_URL ?? http://localhost:3000` + `/p/<slugVi>`, `/en/p/<slugEn>`); Draft → toast thường
- [x] Tests: payload create (en rỗng→"", tags, seo null, variants parse, flash ISO), payload edit round-trip, slug auto chỉ khi chưa touched
- [x] Commit: `feat(admin): product form i18n tabs + storefront toast links`

### Task 6: Coupons mock + Reviews moderation mock

**Files:**
- Create: `src/pages/CouponsPage.tsx`, `src/pages/ReviewsPage.tsx` (dùng StubApi qua hook `useAdminData` — chọn stub/live theo `isStubOn()`)

- [x] Coupons: table (code, type badge %/₫, value, window, used/usageLimit progress text, active Switch=Button toggle); form Modal create/edit (code, type Select, value, minOrderValue, startsAt/endsAt datetime-local, usageLimit, description, active); xóa mock
- [x] Reviews: filter status (mặc định PENDING); rows product name (map productId từ stub products), userName, StarRating, title/content, verifiedPurchase badge, createdAt; Approve (variant primary) / Reject → stub → toast + list invalidate (row rời PENDING)
- [x] Cả 2 page render qua stub; badge "MOCK" nhỏ góc card (gợi ý SF-10 wire live)
- [x] Commit: `feat(admin): coupons + reviews moderation mock pages`

### Task 7: Orders mock list/detail/actions

**Files:**
- Create: `src/pages/OrdersPage.tsx`, `src/pages/OrderDetailPage.tsx`

- [x] List: filter status Select (tất cả + 7 states), q, date from/to (client filter), paginate; columns id/ngày/user/itemsCount/total VND/paymentMethod badge/status badge/actions (Xem)
- [x] Detail: items table (tên/qty/unitPrice/lineTotal), Address block, totals (subtotal − discount + shippingFee = total, coupon/affiliate code nếu có), timeline desc (at + description); actions hiển thị theo state machine (Ship: PAID/CONFIRMED; Deliver: SHIPPED; Cancel: PENDING/PAID/CONFIRMED — Modal confirm); KHÔNG nút confirm; nút "Tải hóa đơn" → `invoiceBlob` download `hoa-don-<id>.pdf`
- [x] Commit: `feat(admin): orders mock list/detail + state machine actions + invoice download`

### Task 8: Dashboard KPI + recharts + low-stock LIVE

**Files:**
- Create: `src/pages/DashboardPage.tsx`
- Modify: `frontend/apps/mfe-admin/package.json` nếu thiếu recharts

- [x] KPI 4 tiles: Doanh thu hôm nay (summary.todayRevenue), Doanh thu 7 ngày (sum 7 điểm cuối revenue-by-day), Đơn hôm nay (todayOrders), AOV = totalRevenue / max(1, đơn PAID+) — formatVnd
- [x] Charts recharts: LineChart revenue 14 ngày (x=date dd/MM, y=revenue, stroke `var(--c-accent)`), BarChart ngang top-products (fill token, layout vertical); ResponsiveContainer; tooltip format VND; labels i18n
- [x] Low-stock LIVE: `listLowStock({})` — table variantId/productName/available/threshold + badge đỏ khi available ≤ threshold; riêng loading/error card (live fail không sập charts mock)
- [x] Commit: `feat(admin): dashboard kpi + revenue/top charts + low-stock live`

### Task 9: Smoke test + polish + full build

**Files:**
- Test: `tests/mount.smoke.test.tsx` (jsdom)
- Modify: polish CSS `src/page.css`, i18n còn thiếu label

- [x] jsdom smoke: mount AdminApp với fetch stub + authStore inject admin token → sidebar + heading render (jsdom từ catalog)
- [x] `pnpm -C frontend turbo build` xanh TOÀN workspace (không vỡ shell/account/storefront)
- [x] `pnpm -C frontend turbo test` xanh
- [x] Rà i18n: mọi label qua `useT`/keys, không hardcode ngoài tokens
- [x] Commit: `test(admin): mount smoke + workspace build xanh + i18n polish`

---

## Verification (chạy sau Task 9, trước merge)

- ACCEPTANCE từng dòng (pack): guard guest/customer; tạo product publish → storefront :3000 thấy; sửa giá → PDP; categories tree/delete-block; mock pages actions shape; dashboard low-stock live + charts + VND
- Rule 0 browser 3 tầng: DOM đo → screenshot → flow login-admin → tạo product → xem storefront → dashboard
- code-reviewer độc lập APPROVED → merge story branch → `~/.claude/bin/story-verify sf-7-admin-mfe` (ORCA_BIN=/usr/local/bin/orca) → FI-317 Done
