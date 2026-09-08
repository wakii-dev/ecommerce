# SF-5 admin-elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 14 màn admin nhất quán theo direction B "Chợ Sôi Động 2.0" §2.5 — sidebar icon + group + active state, dashboard KPI polish, tables client-side sort/page-size/sticky/skeleton/row-hover, pagination primitive thay "← Trước/Sau", dark-mode admin (`admin-dark`) hoạt động thật (4 trạng thái theme), cleanup `admin-badge-mock` + hex, KHÔNG đụng server/logic.

**Architecture:** Tiêu thụ nền SF-1 (tokens v2 4 theme blocks sẵn có, Pagination/TableSkeleton/Table/Icon primitives). Thiếu gì tự lo **admin-local**: nav icons gap (ui-kit READ-ONLY), sort/page-size dùng chung 1 module. Mọi màu qua `var(--*)`; keyframes surface không rải reveal vào admin (§5.5).

**Tech Stack:** React 18 + TS, CSS thuần var(--*), ui-kit primitives, vitest + RTL jsdom, Playwright (subset). KHÔNG thêm dependency.

**Linear Issue:** FI-395 · **Worktree:** sf-5-admin-elevation · **Đích merge:** `story/fi390-uiux-elevation` (sequence SF-2→SF-3→SF-4→SF-5, coordinator-owned)

**Nguồn sự thật:** `docs/superpowers/contexts/fi390-sf-5.md` (spec slice + ACCEPTANCE + boundary) · `docs/superpowers/designs/fi390-uiux-elevation-direction.md` §2.5/§3/§5 (hand-off) · epic spec `2026-09-08-uiux-elevation-design.md`.

---

## 0. Root cause analysis (WHY)

### Root cause
Admin (SF-7 + 5 SF append) build nhanh theo từng pack: sidebar flat 11 item không icon/group; tables dùng ui-kit `Table` raw + `Skeleton variant='rect'` thay skeleton bảng; pagination "← Trước/Sau" hand-roll 4 nơi; KPI chưa có shadow/tint; `.admin-badge-mock` (mock era SF-7) còn sót trong css; AdminApp hardcode `data-theme='admin'` nên block `admin-dark` (SF-1 đã provide) chưa bao giờ render — dark mode admin chết âm thầm.

### Current state (before) — đã đọc toàn bộ 14 pages + css + tests
- `AdminApp.tsx`: AdminShell sidebar `admin-side` flat nav (map ADMIN_NAV); theme effect dòng 183-189 set/restore 'admin'; **RBAC boot block 144-163 + subscribe 215-245 — FORBIDDEN**.
- `lib/guard.ts`: `ADMIN_NAV` flat array 11 item `{to,key}`; `activeNavIndex` map page→index (guard.test.ts phủ).
- 14 pages: 9 bảng (Products, Orders, Coupons, Affiliates, Audit, Newsletter, Reviews, RMA, Loyalty) — Products/Orders/Audit/Newsletter đã server-page (param `page`/`size` hiện có), còn lại load-all → slice client; pagination custom "← Trước/Sau" ở Products/Orders/Audit/Newsletter; loading = `Skeleton variant='rect'` / `Skeleton count=6`.
- `page.css`: 435 dòng, var(--*) tốt; `.admin-badge-mock` (209-217); hex TẤT CẢ nằm trong var() fallback; chưa có sticky/sort/pill-hover styles.
- i18n `admin:` block CUỐI catalogs vi/en — keys `admin.common.prev/next/pageOf/total` + `admin.status.*` đủ; labels e2e đang phụ thuộc: 'Mã', 'Giá trị', 'Đơn tối thiểu (₫)', 'Lượt dùng', tab 'Ảnh'.
- e2e subset chặt testid/selector: `coupon-create-btn/coupon-submit-btn/coupon-toggle-{code}/coupon-usage-{code}/coupon-delete-{code}/coupon-form-errors`, `audit-page/audit-filter-*/audit-apply/audit-prev/audit-next`, `rma-approve|received|refund-{id8}`, `upload-image`, `products-export-csv/orders-export-csv`, `review-row/category-row/loyalty-balance/loyalty-total-earned/affiliates-stat-total`, `admin-user`; upload-image cần `tr hasText`, `input[type=file]` ẩn, `input[value^="/media/products/"]`, nút `/Sửa/`, `/Đăng bán/`.

### Expected outcome
6 dòng ACCEPTANCE context pack (sidebar/group/icon+active · sort/aria/page-size/sticky/skeleton · pagination chuyên nghiệp · product form thoáng + CRUD sống · admin-dark 4 trạng thái sạch + không admin-badge-mock · e2e subset + unit mfe-admin xanh).

### Constraints & hardships
Brand lock — KHÔNG hex mới (admin-dark đã có trong tokens v2 từ SF-1; SF-5 không đụng tokens.css) · contracts/backend READ-ONLY · ui-kit READ-ONLY (bug → flag) · KHÔNG server-side sort/filter/bulk (Q5) · KHÔNG đụng RBAC boot/react-query invalidate/state-machine/CSV/invoice logic · i18n chỉ `admin.*` additive · pnpm-lock freeze · e2e chỉ 4 spec subset (FULL là SF-6).

### High-level strategy
Infrastructure-first tuần tự (theme map + sidebar + DataTable/sort/page-size dùng chung + pagination) → rồi mới rải polish per-page (mỗi task 1 commit = rollback unit). Serialize toàn bộ (mọi task đụng chung page.css/i18n catalogs — bài học shared-worktree race + SF-1).

## 1. Problem
Bằng chứng cuối của epic FI-390: tokens v2 + primitives phải dùng được TOÀN hệ thống. Admin là surface dày nhất (14 màn) nhưng đang "trước elevation": không icon, không sort, pagination thô, dark-mode chết — nếu admin không elevation sạch 4 trạng thái theme thì epic không chứng minh được claim "consistency toàn hệ thống".

## 2. Scope
- **In:** 11 task dưới (khớp bracket SF-5). Sidebar group/icon/active; theme map admin-dark; DataTable sort/page-size/sticky/skeleton/hover; pagination swap 4 pages; Products/Orders/OrderDetail/ProductForm polish; 8 màn visual pass; Forbidden/error states; badge-mock cleanup; walkthrough 4-state + screenshots; tests xanh.
- **Out:** server-side sort/pagination/filter/bulk · logic react-query/state-machine/RBAC/CSV/invoice · ui-kit/packages khác (bug → flag) · namespace i18n checkout:/account: · FULL e2e · merge main · storefront/shell/account code.
- **Success criteria:** 6 ACCEPTANCE lines context pack — verify Phase 5 TỪNG DÒNG.

## 3. Touch map
**Modify:** `frontend/apps/mfe-admin/src/AdminApp.tsx` (theme map + AdminShell JSX) · `lib/guard.ts` (ADMIN_NAV → groups + icon field; `activeNavIndex` GIỮ semantics) · `page.css` (sở hữu) · 14 `pages/*.tsx` · `frontend/packages/i18n/src/catalogs/{vi,en}.ts` (CHỈ block `admin:`, additive).
**Create (admin-local):** `src/lib/tableSort.ts` (+ test) · `src/components/DataTable.tsx` · `src/components/PageSizeSelect.tsx` · `src/components/AdminIcon.tsx` (chỉ icon thiếu).
**READ-ONLY:** ui-kit/**, shell/**, storefront-web/**, mfe-account/**, contracts/**, backend/**, e2e/** (chạy).
**Consumers/regression:** `mount.smoke.test.tsx` (render AdminApp — jsdom), `guard.test.ts` (ADMIN_NAV shape), e2e subset 4 spec (testid/label ở mục 0), shell remote contract `exposes` KHÔNG đổi.

## 4. Design
- **Approach:** (Phase 0 direction A) — admin-local `DataTable` bọc semantic `<table class="uk-table">` + sticky thead + sortable th (button + arrow 9px + `aria-sort` 3 trạng thái asc/desc/none) — dùng lại shape `TableColumn` của ui-kit (thêm optional `sortValue?: (row) => string|number` trong type admin-local); page-size: server-paged pages đổi param `size` (param HIỆN CÓ — không backend change), load-all pages slice client; `Pagination` primitive client-mode (`onPageChange`) với labels `admin.common.*` hiện có.
- **Theme map (AdminApp):** mount đọc `documentElement.dataset.theme`; observer `MutationObserver` trên `attributes:['data-theme']` → `dark|admin-dark → 'admin-dark'`, còn lại `'admin'`; unmount restore prev (logic hiện có). KHÔNG matchMedia (jsdom an toàn).
- **Nav groups (guard.ts):** Tổng quan [Dashboard] · Sản phẩm [Products, Categories, Coupons] · Đơn hàng [Orders, RMA] · Khách hàng & tương tác [Reviews, Affiliates, Newsletter, Loyalty] · Hệ thống [Audit]. Icons: reuse `Icon` SF-1 cho tên có sẵn (package/ticket/cart/user/star/settings…), `AdminIcon` chỉ bổ sung thiếu (grid-dashboard/folder/mail/rotate-ccw/award/file-text) — copy đúng viewBox + stroke attrs Icon.tsx cho khớp nét. **Count-badge active: BỎ** (cần data fetch mới = logic mới, cấm — ghi chú lệch direction nhỏ này).
- **Alternatives loại:** extend ui-kit Table sortable prop (READ-ONLY ownership); aria-sort đặt trên span con (không hợp lệ a11y); table sort CSS-only (không có — phải JS client).
- **Edge cases:** sort giữ ổn định khi page/filter đổi (reset sort khi đổi filter? — GIỮ sort, chỉ sort lại rows hiện tại: kỳ vọng "sort trang hiện tại"); page-size đổi → về trang 1; totalPages khi data rỗng = 1; Pagination primitive tự ẩn ≤1 trang (giữ `.admin-pagination` info text riêng — tổng bản ghi vẫn hiện); sort giá trị lẫn string/number qua accessor bắt buộc cho cột phức tạp (items count, code string); vi locale collator cho tiếng Việt (`localeCompare('vi')`).
- **Non-functional:** a11y (aria-sort, button trong th keyboard-OK, focus-visible có sẵn) · i18n (mọi label mới qua key, vi/en parity) · perf (CSS-only transition `--dur-fast`, icon inline SVG) · security (không thêm input mới; 0 attack surface mới — security-audit vẫn chạy theo ceremony).

## 5. Implementation outline

**Execution order (11 task = 11 bracket names, tuần tự — chung page.css/i18n):**

| # | Bracket task name | Đụng file chính |
|---|---|---|
| 1 | admin-theme-4-state-map | AdminApp.tsx (theme effect thôi) + page.css (nếu cần) |
| 2 | adminshell-sidebar-icons-active-groups | guard.ts + AdminApp.tsx + AdminIcon.tsx (MỚI) + page.css + i18n |
| 3a | tables-client-sort-pagesize-sticky-skeleton-rowhover (INFRA) | lib/tableSort.ts (MỚI) + DataTable.tsx (MỚI) + PageSizeSelect.tsx (MỚI) + tests/tableSort.test.ts (MỚI) + page.css + i18n |
| 3b | tables-rollout-9-pages (plan-critic P1: tách khỏi 3a) | 9 pages (Products/Orders/Coupons/Affiliates/Audit/Newsletter/Reviews/RMA/Loyalty) — sub-commit 2 batch nếu cần |
| 4 | pagination-primitive-swap-4-pages | 4 pages (Products/Orders/Audit/Newsletter) |
| 5 | dashboard-kpi-charts-polish | DashboardPage.tsx + page.css |
| 6 | productslist-productform-polish-grid-upload-variants | 2 pages + page.css |
| 7 | orders-orderdetail-pill-timeline-actions | OrdersPage + OrderDetailPage + page.css |
| 8 | remaining-pages-visual-pass-8-man-hinh | 8 pages (Categories/Coupons/Affiliates/Audit/Newsletter/Loyalty/Reviews/RMA) + page.css |
| 9 | admin-badge-mock-cleanup-hex-tokenize | page.css + grep tsx dùng class |
| 10 | forbidden-error-states | ForbiddenPage.tsx + AdminApp guest/forbidden JSX + page.css |
| 11 | walkthrough-4-state-theme-tests | không code mới — walkthrough + e2e subset + unit + screenshots (fix nhỏ nếu vỡ) |

Ghi chú: bracket list thứ tự gốc là adminshell trước dashboard; chạy theo bảng trên vì task 3 (DataTable) là dep thật của các page-polish task; task 1 tách khỏi 2 để theme map (rủi ro cao nhất — jsdom/mount.smoke) cô lập rollback.

**File structure:** component mới `src/components/` PascalCase named export; hook thuần `src/lib/tableSort.ts` (pure sort compare — test node được); css thêm cuối page.css theo section comment `/* ── <Mục> (SF-5 FI-395) */`; i18n key mới cụm cuối block `admin:` với comment `// SF-5 (FI-395) append`.

**Testing strategy:** unit mfe-admin `cd frontend/apps/mfe-admin && pnpm vitest run` xanh sau mỗi task đụng logic (tableSort test mới: compare vi/number/desc; guard.test giữ xanh — thêm shape group không vỡ assert cũ nếu test nào phụ thuộc → đọc trước); i18n parity `cd frontend/packages/i18n && pnpm vitest run`; ui-kit regression đọc-only check `cd frontend/packages/ui-kit && pnpm vitest run` (phải vẫn xanh — nếu vỡ do ai khác, flag); e2e subset: `pnpm --filter @ecommerce/e2e exec playwright test admin-coupon admin-crud upload-image rbac` chống stack verify riêng (+300).

**Verify stack recipe (task 11 + Rule 0):** backend dùng chung đang sống (gateway :8080 từ main checkout — FE-only change nên hợp lệ); FE từ worktree NÀY ports +300: shell :5473 (`REMOTE_ADMIN_URL=http://localhost:5477 REMOTE_ACCOUNT_URL=http://localhost:5476 REMOTE_CHECKOUT_URL=http://localhost:5475 REMOTE_SKELETON_URL=http://localhost:5478`), admin :5477 (GATEWAY_URL=http://localhost:8080, proxy /api), account :5476, checkout :5475, skeleton :5478; e2e override `E2E_SHELL_URL=http://localhost:5473`. Walkthrough orca browser: login admin → 14 màn → sort + page-size + 4 theme (shell toggle) → screenshot mỗi state.

## 6. Risks & unknowns
- **Must verify:** mount.smoke còn xanh sau theme observer (jsdom có MutationObserver — không matchMedia) · e2e 4 spec trên stack +300 · admin-dark contrast thật bằng screenshot (không tự tin DOM) · Pagination primitive styled đúng trong admin (uk-page trong page.css admin context) · sort không phá order assert nào của e2e (đã đọc — không spec nào assert thứ tự rows).
- **Unverified assumptions (giảm thiểu):** REMOTE_*_URL recipe hoạt động cho admin (FI-368 đã chứng minh pattern cho account/checkout) · i18n anchor rule giữ merge sạch với SF-3/4 (giữ mọi edit trong block admin:) · gateway :8080 từ main checkout phục vụ được admin APIs (FE-only change — chạy chung như dev hiện tại).
- **Unknown → REQUIREMENT-GAP nếu nảy sinh giữa chừng:** batch comment lên FI-390, không tự quyết thay đổi epic-scope.

---

## Tasks

### Task 1: admin-theme-4-state-map — admin-dark hoạt động thật

**Files:**
- Modify: `frontend/apps/mfe-admin/src/AdminApp.tsx` (CHỈ theme effect ~183-189)

- [ ] **Step 1:** Thay effect theme: mount đọc `documentElement.dataset.theme ?? 'storefront'` → map `'admin' | 'admin-dark'` (dark/admin-dark → admin-dark); `MutationObserver` observe `documentElement` attr `data-theme` → remap live (shell toggle trong phiên admin phải flip ngay); unmount: disconnect + restore `prevTheme.current`.
- [ ] **Step 2:** Unit: chạy `pnpm vitest run` mfe-admin — mount.smoke phải xanh (jsdom MutationObserver có sẵn; nếu test env thiếu → polyfill trong test setup, KHÔNG trong app code).
- [ ] **Step 3:** Commit `feat(admin): map shell theme dark→admin-dark khi mount (FI-395 T1)`.

### Task 2: adminshell-sidebar-icons-active-groups

**Files:**
- Modify: `frontend/apps/mfe-admin/src/lib/guard.ts` (ADMIN_NAV → nhóm + icon), `src/AdminApp.tsx` (AdminShell JSX), `src/page.css`, catalogs vi/en
- Create: `frontend/apps/mfe-admin/src/components/AdminIcon.tsx`

- [ ] **Step 1:** guard.ts: `ADMIN_NAV` giữ export cũ (backward-compat test) THÊM `ADMIN_NAV_GROUPS: {labelKey, items: {to,key,icon: IconName|AdminIconName}[]}[]` (groups per Design mục 4); `activeNavIndex` GIỮ NGUYÊN semantics (prefix match; order-detail → Orders).
- [ ] **Step 2:** AdminIcon.tsx: chỉ icon THIẾU so catalog Icon.tsx (grid-dashboard, folder, mail, rotate-ccw, award, file-text… tùy map cuối) — 24×24 viewBox, copy ĐÚNG stroke attrs của Icon.tsx (đọc file trước khi viết), aria-hidden decorative.
- [ ] **Step 3:** AdminShell JSX: group label (11px uppercase ls .12em muted) + item (icon 18 + label; active: tint bg + border-left primary + chữ c-link — style có sẵn .admin-nav-link--active, bổ sung .admin-nav-link__icon + group styles); user block cuối sidebar border-top (tên + pill ADMIN tint) — topbar GIỮ nguyên (logout/storefront).
- [ ] **Step 4:** page.css: styles group/icon/user-block theo direction §2.5; responsive ≤900px strip ngang giữ hoạt động (group ẩn label? — group label thành separator đứng | đơn giản: mobile giữ flat scroll, group labels display:none).
- [ ] **Step 5:** i18n `admin.nav.group.{overview,products,orders,engagement,system}` vi/en (additive cuối block, comment SF-5).
- [ ] **Step 6:** Test: guard.test + mount.smoke xanh; vitest i18n parity xanh.
- [ ] **Step 7:** Commit `feat(admin): sidebar groups + icons + active state (FI-395 T2)`.

### Task 3a: tables-client-sort — INFRA (components + css + i18n + unit test)

**Files:**
- Create: `src/lib/tableSort.ts`, `src/components/DataTable.tsx`, `src/components/PageSizeSelect.tsx` (+ `tests/tableSort.test.ts`)
- Modify: `page.css`, catalogs vi/en

- [x] **Step 1:** tableSort.ts: pure `compareRows(accessor, dir, locale='vi')` (number → numeric; string → localeCompare vi; null/undefined xuống cuối) + `useClientSort` hook (state {key,dir} | null; click cùng key → asc→desc→none; khác key → asc).
- [x] **Step 2:** DataTable.tsx: props `{columns: AdminTableColumn<Row>[] (header, render?, align?, sortValue?), rows, rowKey, empty, caption, loading (→ TableSkeleton rows/cols), sort? (controlled từ useClientSort), onSortClick?}`; render `<div class="admin-table-block">` (surface + border + radius-md + shadow-1 + overflow) → `<table class="uk-table admin-table">` thead sticky (`position: sticky; top: 0; background: var(--c-surface)` + shadow `0 1px 0 var(--c-border)`; th 11/700 uppercase ls .08em muted) — sortable th = `<button>` (header text + arrow ▲/▼ 9px, asc primary/desc primary rotate 180/none muted) + `aria-sort` trên th; row hover `--wash-hover` `--dur-fast`; empty/caption pattern ui-kit.
- [x] **Step 3:** PageSizeSelect.tsx: nhóm nút 10/25/50 (active nền primary chữ trắng, padding 5×11) + label `admin.common.pageSize`; props `{value, onChange}`.
- [x] **Step 4:** page.css: .admin-table-block/.admin-table thead/sort arrow/hover (dur-fast) /page-size group; i18n: `admin.common.pageSize`, `admin.common.sortLabel` ('Sắp xếp' — aria), vi/en.
- [x] **Step 5:** Test: tableSort.test mới (asc/desc/none, number+string vi, null cuối); vitest mfe-admin xanh.
- [x] **Step 6:** Commit **3a** `feat(admin): DataTable sort/page-size/sticky infra (FI-395 T3a)`.

**Task 3b — rollout 9 pages** (sub-commit 2 batch: server-paged Products/Orders/Audit/Newsletter trước, load-all Coupons/Affiliates/Reviews/RMA/Loyalty sau):

- [x] **Step 1:** Rải 9 pages: thay `Table`→`DataTable` (thêm `sortValue` cho cột có nghĩa: name/price/status/createdAt/total/code/qty…), `Skeleton rect`→`loading`, page-size state (server-paged: set size param + page=1; load-all: slice client), GIỮ NGUYÊN mọi data-testid + label i18n cũ.
- [x] **Step 2 (commit gate — plan-critic P1):** grep testid inventory vs §0 list (`coupon-create-btn|coupon-submit-btn|coupon-toggle-|coupon-usage-|coupon-delete-|coupon-form-errors|audit-page|audit-filter-|audit-apply|rma-approve-|rma-received-|rma-refund-|upload-image|products-export-csv|orders-export-csv|review-row|category-row|loyalty-balance|loyalty-total-earned|affiliates-stat-total|admin-user`) — diff rỗng mới commit.
- [x] **Step 3:** vitest mfe-admin xanh.
- [x] **Step 4:** Commit **3b** — dispatch chia 2 sub-commit: `feat(admin): rollout DataTable 4 server-paged tables (FI-395 T3b-1)` + `feat(admin): rollout DataTable 5 client tables (FI-395 T3b-2)`.

### Task 4: pagination-primitive-swap-4-pages

**Files:**
- Modify: ProductsListPage, OrdersPage, AuditPage, NewsletterPage

- [x] **Step 1:** Thay khối `.admin-pagination` "← Trước/Sau" bằng `Pagination` primitive client mode (`onPageChange`, labels từ `admin.common.*` — `prev`='Trước' → dùng `prevLabel={t('admin.common.prev')}`...) + giữ dòng tổng `(pageOf + total)` cạnh; Audit/Newsletter GIỮ testid nav? (audit-prev/audit-next có trong e2e? — grep: KHÔNG spec nào bấm audit-prev/next; giữ testid bằng cách bọc span data-testid ngoài? → bỏ testid cũ an toàn vì e2e subset không dùng; ghi check grep trước khi xóa).
- [x] **Step 2:** page-size select đặt cạnh pagination (toolbar phải); đảm bảo page>totalPages sau page-size đổi → clamp trang.
- [x] **Step 3:** vitest mfe-admin xanh (mount.smoke render dashboard; pages khác không phủ — mount smoke vẫn pass vì không đụng).
- [x] **Step 4:** Commit `feat(admin): pagination primitive thay nút Trước/Sau (FI-395 T4)`.

### Task 5: dashboard-kpi-charts-polish

**Files:**
- Modify: DashboardPage.tsx, page.css

- [x] **Step 1:** KPI tile: shadow-1 + hover cascade nhẹ (−2px shadow-2, dur-base) + label/value đúng §2.5 (label 11/700 uppercase ls .08em; value 23/800 tabular — css có sẵn, bổ sung tint top-accent nhẹ theo direction tint-primary); KHÔNG chế delta data.
- [x] **Step 2:** Charts: giữ pattern override token page.css:349-360 (recharts colors qua var) — polish grid/toast; low-stock table qua DataTable (Task 3 đã rải? — low-stock dùng Table nội dòng; rải DataTable + skeleton luôn ở đây nếu chưa).
- [x] **Step 3:** Skeleton loading các khối → TableSkeleton/Skeleton composition hợp lý.
- [x] **Step 4:** Commit `feat(admin): dashboard KPI + charts polish (FI-395 T5)`.

### Task 6: productslist-productform-polish-grid-upload-variants

**Files:**
- Modify: ProductsListPage.tsx, ProductFormPage.tsx, page.css

- [x] **Step 1:** ProductsList: filter bar polish (search/status/category giữ logic), density hàng (44px ảnh giữ), empty state EmptyState primitive thay text? (kiểm empty hiện là string qua Table empty — đổi EmptyState component).
- [x] **Step 2:** ProductForm: form grid gap thoáng (space-5), label/hint typography; **upload area dropzone-style visual** (border dashed tint + icon + hover — KHÔNG đổi logic input file; input[type=file] vẫn ẩn trong DOM — e2e setInputFiles cần nó); variants grid: hàng rõ ranh giới + cột đều (page.css §232-239 polish); tabs vi/en dùng Tabs primitive (đã dùng — polish khoảng cách).
- [x] **Step 3:** e2e constraints (commit gate — grep testid inventory như T3b Step 2 + `input[type=file]`, tab 'Ảnh' exact, `/Đăng bán/`, `/Sửa/`) — diff rỗng mới commit.
- [x] **Step 4:** Commit `feat(admin): products list + product form polish (FI-395 T6)`.

### Task 7: orders-orderdetail-pill-timeline-actions

**Files:**
- Modify: OrdersPage.tsx (đã DataTable ở T3), OrderDetailPage.tsx, page.css

- [ ] **Step 1:** OrderDetail: timeline thay `<ol>` thô → dot 10px + đường 1px c-border, mốc hoàn thành (event cuối) nền c-success (css `.admin-timeline`), GIỮ data/logic (chỉ JSX/CSS quanh nó).
- [ ] **Step 2:** Action buttons ship/deliver/cancel: đổi emoji ('🚚','✓','✕','⬇') → Icon SF-1 (package/check/x/external) + Button variant nhất quán; confirm dialog cancel giữ Modal + copy.
- [ ] **Step 3:** Status pill 6 màu đã đúng token — review padding/ls khớp §2.5 (11/800 ls .05 padding 3×9 full — css .admin-pill có 3px 9px; bổ sung letter-spacing 0.05em).
- [ ] **Step 4:** Commit `feat(admin): order detail timeline + action buttons polish (FI-395 T7)`.

### Task 8: remaining-pages-visual-pass-8-man-hinh

**Files:**
- Modify: CategoriesPage, CouponsPage, AffiliatesPage, AuditPage, NewsletterPage, LoyaltyPage, ReviewsPage, RmaPage, page.css

- [ ] **Step 1:** (2×4 nếu budget executor cạn — chia sub-commit) Mỗi page: page-head nhất quán (title + actions), pills/badges tint đúng, empty states EmptyState primitive (icon muted 48 + eyebrow), spacing/headers §2.5; KHÔNG đụng mutation/query logic.
- [ ] **Step 2:** Coupons form modal-card: grid 2 cột thoáng; stats KPI Affiliates/Loyalty → pattern .admin-kpi (Task 5 style dùng lại).
- [ ] **Step 3:** Audit/Newsletter: đã DataTable ở T3b — chỉ polish filter/empty ở đây.
- [ ] **Step 4:** Commit gate: grep testid inventory (như T3b Step 2) — diff rỗng mới commit.
- [ ] **Step 5:** Commit `feat(admin): visual pass 8 pages còn lại (FI-395 T8)`.

### Task 9: admin-badge-mock-cleanup-hex-tokenize

**Files:**
- Modify: page.css; grep tsx nếu còn dùng class

- [ ] **Step 1:** grep `admin-badge-mock` toàn src — xóa class (209-217) + mọi usage tsx còn sót (mock badge hiển thị 'MOCK' — nếu page nào còn render thì thay bằng pill tint thường).
- [ ] **Step 2:** Hex sweep: verify KHÔNG hex ngoài var() fallback (script grep); mọi var() được tham chiếu phải tồn tại ở CẢ 4 theme blocks (script check tokens.css) — lệch → sửa fallback hoặc flag token thiếu.
- [ ] **Step 3:** Commit `chore(admin): bỏ admin-badge-mock + verify hex tokenize (FI-395 T9)`.

### Task 10: forbidden-error-states

**Files:**
- Modify: ForbiddenPage.tsx, AdminApp.tsx (guest/forbidden JSX — KHÔNG đụng guard logic), page.css

- [ ] **Step 1:** ForbiddenPage: EmptyState polish (icon 🔒→Icon 'alert'? giữ emoji an toàn i18n — dùng EmptyState + action button về storefront), guest screen standalone polish card border tint.
- [ ] **Step 2:** error/toast tint nhất quán: check `.admin-error-text`/`.admin-error` dùng tint-danger tokens; toast variant danger success đã qua ToastProvider — chỉ đảm bảo page-error dùng Alert primitive где phù hợp (nhẹ tay — không đụng mutation onError).
- [ ] **Step 3:** Commit `feat(admin): forbidden + error states polish (FI-395 T10)`.

### Task 11: walkthrough-4-state-theme-tests (verify gate — Rule 0)

**Files:**
- Không code mới (fix nhỏ nếu phát hiện vỡ — commit fix riêng)

- [ ] **Step 1:** Unit xanh: mfe-admin vitest + i18n parity + ui-kit vitest (read-only check) + re-run hex/var sweep script (plan-critic P2 — T10 đã thêm css sau T9).
- [ ] **Step 2:** Bật verify stack +300 (recipe mục 5); pre-check backend cap: curl `${GATEWAY}/api/catalog/admin/products?page=1&size=50` với admin token — nếu service cap < 50 → REQUIREMENT-GAP lên FI-390 trước khi claim ACCEPTANCE 2 (plan-critic P1); copy .env từ main checkout.
- [ ] **Step 3:** orca browser mở `http://localhost:5473/admin` → login admin thật qua UI shell (admin@demo.vn / admin123 từ .env nếu seed mặc định).
- [ ] **Step 4:** Walkthrough 14 màn: mỗi màn screenshot; sort click (asc/desc/none + aria), page-size 10/25/50 đổi số dòng, sticky header cuộn, skeleton thấy lúc load chậm. Forbidden-state recipe (plan-critic P2): đăng nhập user customer (đăng ký qua shell UI hoặc user demo từ seed) → mở /admin → thấy ForbiddenPage → screenshot → đăng xuất.
- [ ] **Step 5:** 4 trạng thái theme: shell storefront light/dark + admin light/dark — toggle tại /admin → sidebar/table/KPI flip `admin`↔`admin-dark` live; screenshot đủ 4; check console sạch.
- [ ] **Step 6:** e2e subset: `E2E_SHELL_URL=http://localhost:5473 pnpm --filter @ecommerce/e2e exec playwright test admin-coupon admin-crud upload-image rbac` — XANH.
- [ ] **Step 7:** Teardown verify stack (+300) sau khi evidence đủ (port-squatting hygiene) — kill đúng PID mình spawn.
- [ ] **Step 8:** Tổng hợp evidence screenshots + kết quả từng dòng ACCEPTANCE vào comment FI-395 (ghi rõ deviation count-badge đã duyệt ở plan §4).

---

## Verification checklist (Phase 5 — từng dòng ACCEPTANCE context pack)

1. Login admin → sidebar icon + active + group rõ; 14 màn đồng bộ 1 design language — **bằng chứng: screenshots 14 màn**.
2. Sort header asc/desc/none client-side + aria-sort; page-size 10/25/50 đổi số dòng; sticky header cuộn; loading = skeleton — **bằng chứng: eval + screenshots**.
3. Pagination primitive (số trang + ‹/› + dots) thay "← Trước/Sau" — **bằng chứng: screenshot**.
4. Product form grid thoáng + upload dropzone + variants dễ đọc; CRUD sống (e2e admin-crud + upload-image XANH).
5. admin-dark sạch 4 trạng thái, không hex lệch, `admin-badge-mock` không còn — **bằng chứng: screenshots 4 state + grep**.
6. e2e subset (admin-coupon, admin-crud, upload-image, rbac) XANH + unit mfe-admin xanh — **bằng chứng: output runner**.
