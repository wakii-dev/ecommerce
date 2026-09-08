# SF-4 account-elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Account MFE elevation theo hướng B "Chợ Sôi Động 2.0" — side-nav thống nhất 6 mục + active state + responsive collapse; auth flows validate realtime + password toggle; UserMenu keyboard-OK (role=menu); skeleton thay mọi "Đang tải…"; OrderDetail decss 42 khối inline → page.css + ui-kit Table/Modal/Textarea + timeline GHN; wishlist/myreviews/affiliate/loyalty polish; i18n hard-code vi → keys `account.*` additive-only. Zero backend, zero route change, zero logic-auth change.

**Architecture:** Pure presentation layer BÊN TRONG `apps/mfe-account` — `AccountLayout` component bọc các page đã đăng nhập (side-nav + content), shell router GIỮ NGUYÊN. Primitives ui-kit SF-1 consume read-only. i18n keys `account.*` thêm additive vào catalogs (anchor: ngay sau block `nav:`). Mọi màu qua `var(--*)`; duy nhất 2 hex pin `#FDEBEC/#C0151F` giữ (context pack cho phép).

**Tech Stack:** React 18 + TypeScript, CSS thuần (page.css classes), ui-kit primitives (Table/Modal/Textarea/Badge/EmptyState/ListSkeleton/ProductCardSkeleton/Icon/IconButton/Input), vitest + @testing-library (jsdom) — catalog-pinned, KHÔNG dependency mới ngoài catalog.

**Linear Issue:** FI-394 · **Worktree:** sf-4-account-elevation · **Đích merge:** `story/fi390-uiux-elevation` (KHÔNG main) · **E2E port base: +200** khi cần isolate.

**Nguồn sự thật:** `docs/superpowers/contexts/fi390-sf-4.md` (spec slice + ACCEPTANCE + boundary) · `docs/superpowers/designs/fi390-uiux-elevation-direction.md` (§2.5 sidebar pattern, §4 account/wishlist/affiliate rules, §5 cấm) · epic spec `docs/superpowers/specs/2026-09-08-uiux-elevation-design.md`. Commit convention: `<type>(<scope>): <imperative summary> (FI-394 Tx …)`.

---

## 0. Root cause analysis (WHY)

### Root cause
mfe-account lớn dần qua 6 SF file-slice (SF-3/8/9/12/14/15) — mỗi slice tự livesStyle riêng: không layout chung (điều hướng chỉ qua footer storefront `Footer.tsx:44-45`), loading là `<p>Đang tải…</p>`, OrderDetail viết 396 dòng với 42 khối inline-style + `<table>` tay, UserMenu span-based không keyboard, text tiếng Việt hard-code trong JSX (không i18n). SF-1 đã cung cấp tokens v2 + primitives nhưng account chưa tiêu thụ.

### Current state (before — đã đọc toàn bộ app)
- 11 page components + AuthWidget; `page.css` 318 dòng (auth-card, account-grid 2 cột, wl-grid, mr-*, oauth, twofa — KHÔNG có side-nav).
- Loading: OrdersPage:76, OrderDetailPage:151, WishlistPage:81, MyReviewsPage:67, AffiliatePage:126, LoyaltyPointsSection:44 — text "Đang tải…".
- UserMenu (AuthWidget.tsx:25-78): role=menu CÓ nhưng item là `<a>` không role=menuitem, không keyboard, không Escape/focus-restore, mũi tên ▲/▼ text, hover đổi style bằng JS inline.
- OrderDetailPage: 42 khối inline style, `<table>` tay (203-215), RMA modal dùng ui-kit Modal (tốt) nhưng textarea raw (381-388), timeline = `<ol>` + Badge (310-317).
- Status pill: Badge 5 variants map tay (OrdersPage STATUS_META) — KHÔNG dùng 6 token `--pill-*`.
- Forgot/Reset success banner: hex cứng inline `#eefcf0/#1b7a34`.
- 0 unit test, 0 vitest config trong mfe-account.
- i18n catalogs: chỉ `nav/auth/actions/common/ui/admin` — chưa có `account.*`.

### Expected outcome
6 dòng ACCEPTANCE context pack: side-nav 6 mục + active; skeleton mọi trang + pill 6 màu; OrderDetail table/modal/textarea/timeline chuẩn; UserMenu keyboard + form validate blur + password toggle; locale en chuyển TOÀN BỘ account text; e2e subset + unit xanh.

### Constraints & hardships
- `packages/ui-kit/**`, `packages/auth/**`, `apps/shell/**`, `apps/mfe-checkout/**`, `storefront-web`, `contracts/**`, `backend/**` READ-ONLY; e2e/ chỉ chạy subset (read-only).
- KHÔNG đổi route/URL pattern; KHÔNG sổ địa chỉ; KHÔNG password strength meter; KHÔNG FULL e2e (SF-6); KHÔNG logic auth/2FA/OAuth/merge-cart mới.
- i18n CHỈ namespace `account.*`; ANCHOR: block `account:` ngay sau `nav:` trong CẢ vi.ts + en.ts (SF-3 chèn sau `auth:`, SF-5 trong `admin:` — khác anchor = merge sạch).
- Hex cứng ngoài tokens = P1 (trừ 2 hex pin #FDEBEC/#C0151F có comment sẵn trong page.css).
- Icon set 22 names KHÔNG có eye/coin → toggle mật khẩu dùng inline SVG stroke 1.8 (surface-owned file, KHÔNG sửa ui-kit); Điểm thưởng → `ticket`, Affiliate → `external`.
- 6 pill tokens chỉ phủ 6 status (pending/paid/confirmed/shipped/delivered/cancelled) — FAILED dùng family cancelled-red.

### High-level strategy
Tuần tự (không parallel worker — T1-T10 cùng đụng page.css + catalogs + nhiều page dùng chung AccountLayout): layout/test-infra trước → auth flows → UserMenu → các trang data (profile → orders → orderdetail → wishlist → reviews → affiliate) → i18n sweep → responsive+walkthrough+tests. Mỗi task = 1 atomic commit = rollback unit. i18n keys thêm THEO TASK (vi+en cùng commit với page dùng key — parity không vỡ); Task 10 = sweep residual + lock test.

## 1. Problem
Trang account là bề mặt user đăng nhập (nhiều dùng nhất sau storefront) nhưng thô nhất hệ thống: không điều hướng nội bộ, loading text, 42 khối inline-style, không keyboard a11y, không i18n — vi phạm trực tiếp ACCEPTANCE epic FI-390 (side-nav + skeleton + keyboard + i18n parity).

## 2. Scope
- **In:** 11 task dưới (bracket FI-390 block SF-4) — AccountLayout side-nav + collapse, auth polish + password toggle, UserMenu keyboard, profile/2FA polish, orders skeleton+pill, OrderDetail decss + Table/Modal/Textarea/timeline, wishlist grid + confirm delete, myreviews badges, affiliate/loyalty KPI polish, i18n `account.*` sweep, responsive + walkthrough + tests.
- **Out:** ui-kit/auth/shell/checkout/storefront/contracts/backend · route mới/đổi URL · sổ địa chỉ · password strength meter · FULL e2e · merge main · logic auth mới.
- **Success criteria:** 6 ACCEPTANCE lines context pack — verify Phase 5 từng dòng (browser 3 tầng).

## 3. Touch map
```
apps/mfe-account/src/AccountLayout.tsx          (MỚI — side-nav)
apps/mfe-account/src/page.css                   (sở hữu — thêm acc-*, pill, timeline; giữ 2 hex pin)
apps/mfe-account/src/AuthWidget.tsx             (UserMenu keyboard + GuestLinks decss)
apps/mfe-account/src/pages/{Login,Register,Forgot,Reset,TwoFactor}Page.tsx  (validate blur + toggle + i18n)
apps/mfe-account/src/pages/AccountPage.tsx      (profile polish + wrap layout)
apps/mfe-account/src/pages/twofa/TwoFactorSection.tsx (polish + i18n)
apps/mfe-account/src/pages/orders/{OrdersPage,OrderDetailPage}.tsx (skeleton/pill; decss/Table/Textarea/timeline)
apps/mfe-account/src/pages/wishlist/WishlistPage.tsx (grid + confirm + skeleton)
apps/mfe-account/src/pages/my-reviews/MyReviewsPage.tsx (badges + skeleton)
apps/mfe-account/src/pages/affiliate/{AffiliatePage,LoyaltyPointsSection}.tsx (KPI + Table + anchor)
apps/mfe-account/src/components/EyeIcon.tsx     (MỚI — inline SVG toggle, stroke 1.8)
apps/mfe-account/vitest.config.ts + package.json (MỚI test infra — catalog deps)
apps/mfe-account/src/**/*.test.ts(x)            (MỚI unit tests)
packages/i18n/src/catalogs/{vi,en}.ts           (block account:* ngay sau nav:)
```
READ-ONLY: mọi thứ khác (ui-kit, auth, shell, contracts, e2e specs). Consumers/regression: e2e subset (testids giữ: `forgot-email/forgot-submit/reset-password-input/reset-submit/reset-success/forgot-sent/reset-missing-token/orders-page/order-detail/tracking-block/rma-create/rma-submit/rma-list/points-discount/affiliate-clicks/affiliate-conversions/affiliate-earnings/affiliate-code/affiliate-link/loyalty-section/loyalty-balance/auth-guest/auth-user`), i18n parity test (vi/en cùng cấu trúc), authReady guard + duck-type ApiErrorClient pattern GIỮ nguyên mọi page.

## 4. Design
- **Approach:** Direction A (Phase 0) — AccountLayout trong mfe-account bọc 6 trang đã đăng nhập (Account/Orders/OrderDetail/Wishlist/Reviews/Affiliate); auth pages (login/register/forgot/reset/2fa/oauth-callback) KHÔNG layout (guest flow center card giữ nguyên — đúng UX auth). Side-nav = pattern admin sidebar direction §2.5 (border-left 3px active tint, rộng 240, icon 16-18) thu nhỏ cho storefront context.
- **Alternatives loại:** sửa shell router (SF-3 own — boundary); nav copy mỗi page (drift); Tabs primitive làm nav ngang <600px (tabs là switching không phải navigation — dùng scroll-x nav tự viết đúng semantics `<nav>`).
- **Điểm thưởng routing:** không có route riêng → item `/account/affiliate#loyalty`; shell `usePath` đọc `location.pathname` (router.tsx — hash không vỡ match); `LoyaltyPointsSection` render `<section id="loyalty">` + effect scrollIntoView khi `location.hash === '#loyalty'`. Active state: cả 2 item affiliate/điểm-thưởng không active đồng thời — active theo hash khi có.
- **Edge cases / second-order:** authReady race guard GIỮ (AccountPage:21-48 pattern — mọi page mới bọc layout KHÔNG đụng guard); hash navigate qua `appNavigate` (pushState giữ hash); modal RMA/hủy đã dùng ui-kit Modal (focus-trap sẵn) — chỉ decss footer; QuantityStepper cho RMA qty (min 0 max item.qty — thay raw input number); Table items không có thead dữ liệu thật (tên/SL/thành tiền) → dùng Table với columns thường; emoji 🛍️/⚠️ → Icon (EmptyState.icon nhận ReactNode).
- **Non-functional:** a11y (role=menu/menuitem/aria-activedescendant-free roving, focus-visible, Escape, label Textarea, inputMode tel/numeric) · i18n (vi/en song song parity mỗi commit) · perf (skeleton reserve CLS tốt hơn text; KHÔNG thêm reveal/ken-burns vào account — direction §5.5 cấm rải motion điểm nhấn) · security (không đổi auth; toggle chỉ đổi type input; không log password) · dark mode (chỉ var(--*), hex pin giữ).

## 5. Implementation outline

**Execution order (11 tasks = 11 bracket names, tuần tự):**

| # | Bracket task name | Đụng file chính |
|---|---|---|
| 1 | account-layout-sidenav-routes | AccountLayout.tsx (MỚI) + page.css + wrap 6 pages + vitest infra |
| 2 | auth-flows-polish-realtime-validation | 5 auth pages + EyeIcon.tsx (MỚI) + page.css + catalogs |
| 3 | usermenu-keyboard-role-menuitem-icon | AuthWidget.tsx + page.css + catalogs |
| 4 | accountpage-profile-2fa-polish | AccountPage.tsx + TwoFactorSection.tsx + catalogs |
| 5 | orders-page-card-skeleton-status-pill | OrdersPage.tsx + page.css + catalogs |
| 6 | orderdetail-decss-uikit-table-modal-textarea-timeline | OrderDetailPage.tsx + page.css + catalogs |
| 7 | wishlist-grid-consistent-skeleton-empty | WishlistPage.tsx + page.css + catalogs |
| 8 | myreviews-badges-polish | MyReviewsPage.tsx + page.css + catalogs |
| 9 | affiliate-loyalty-stats-ledger-polish | AffiliatePage.tsx + LoyaltyPointsSection.tsx + page.css + catalogs |
| 10 | i18n-account-hardcode-to-keys-account-namespace-only | catalogs vi/en (sweep residual) + parity run |
| 11 | responsive-walkthrough-tests | responsive audit + unit consolidation + browser walkthrough + e2e subset |

**File structure:** `AccountLayout.tsx` + `EyeIcon.tsx` ở `src/` (component dùng chung app, cùng cấp AuthWidget); CSS prefix `acc-*` (layout/nav), `od-*` (order detail), `pill-*` (status pill), `um-*` (user menu) — thêm vào page.css CUỐI với section comment `/* ── SF-4 (FI-394) … */`; catalogs theo anchor rule.

**Testing strategy:** vitest jsdom trong package (`pnpm -C frontend/apps/mfe-account exec vitest run` — config riêng vitest.config.ts pattern mfe-checkout; deps catalog: vitest/jsdom/@testing-library/react/@testing-library/dom). Unit: UserMenu keyboard (Escape/Arrow/focus-restore), status pill mapping, AccountLayout active-state/hash, auth validate blur. tsc --noEmit mỗi task. Browser (Rule 0): sau T1, T3, T6, T11 (walkthrough 3 tầng login→side-nav→mọi trang→logout). E2e subset (auth-cookie, password-reset, engagement) tại T11 — live stack `make dev` hoặc isolate port-base +200 nếu port war.

## 6. Risks & unknowns
- **Must verify:** side-nav active + collapse <600px (browser T1/T11); keyboard menu thật qua browser (T3); modal focus-trap/ESC trong OrderDetail (T6); locale en không còn hard-code (T10/T11 — sweep grep + walkthrough đổi locale); e2e subset xanh trên stack thật (T11).
- **Unverified assumptions (đã giảm thiểu):** hash `#loyalty` không vỡ shell route (verify router.tsx đọc pathname — nhưng scrollIntoView cần effect tự viết, T9 làm); vitest catalog deps không đổi version lockfile (chỉ importer mới — pattern mfe-checkout/mfe-admin); Icon `ticket/external/package` đủ dùng cho nav (chốt T1, demo bằng screenshot).

---

## Tasks

### Task 1: AccountLayout side-nav + routes wrap + test infra

**Files:**
- Create: `frontend/apps/mfe-account/src/AccountLayout.tsx`, `frontend/apps/mfe-account/vitest.config.ts`
- Modify: `frontend/apps/mfe-account/package.json`, `frontend/apps/mfe-account/src/page.css`, 6 pages đã đăng nhập: `AccountPage.tsx`, `pages/orders/OrdersPage.tsx`, `pages/orders/OrderDetailPage.tsx`, `pages/wishlist/WishlistPage.tsx`, `pages/my-reviews/MyReviewsPage.tsx`, `pages/affiliate/AffiliatePage.tsx`, `packages/i18n/src/catalogs/vi.ts`, `packages/i18n/src/catalogs/en.ts`
- Create test: `frontend/apps/mfe-account/src/__tests__/accountLayout.test.tsx`

- [x] **Step 0: Pre-flight** — `cd frontend && pnpm install` (nếu chưa); `pnpm -C apps/mfe-account exec tsc --noEmit` sạch TRƯỚC khi sửa.
- [x] **Step 1: vitest infra** — package.json thêm `"test": "vitest run"` + devDeps catalog-pinning: `"vitest": "catalog:"`, `"jsdom": "catalog:"`, `"@testing-library/react": "catalog:"`, `"@testing-library/dom": "catalog:"` (đúng pattern mfe-checkout devDeps). SAU đó `pnpm -C frontend install` và assert `git diff frontend/pnpm-lock.yaml` CHỈ thêm importer block mfe-account (0 version đổi) — plan-critic P0. `vitest.config.ts` copy pattern mfe-checkout (`mergeConfig` từ `./vite.config`, environment jsdom, include `src/**/*.test.ts(x)`, globals false). `pnpm -C frontend/apps/mfe-account exec vitest run` chạy được (0 test = ok, exit 0 với `--passWithNoTests` chỉ lần này).
- [x] **Step 2: AccountLayout component** — API:
```tsx
export interface AccountNavItem { key: string; to: string; icon: IconName; labelKey: string }
export function AccountLayout({ active, children }: { active: string; children: ReactElement }): ReactElement
```
Markup: `<div className="acc-shell"><nav className="acc-nav" aria-label={t('account.nav.label')}><a className="acc-nav__link" aria-current={…}>` — 6 item: Tài khoản `/account` user · Đơn hàng `/account/orders` package · Wishlist `/account/wishlist` heart · Đánh giá của tôi `/account/reviews` star · Affiliate `/account/affiliate` external · Điểm thưởng `/account/affiliate#loyalty` ticket. `active` prop: `'account'|'orders'|'wishlist'|'reviews'|'affiliate'|'loyalty'` (page tự truyền — KHÔNG đoán từ path trong layout, tránh double-source; hash `#loyalty` quyết định loyalty vs affiliate qua `usePath`-like check trong từng page: OrdersPage KHÔNG cần, AffiliatePage nhận prop từ hash). Icon 18, `aria-hidden`. Click `<a href>` + preventDefault + `appNavigate(to)` (giữ pattern mọi page — modifier-click cho qua mặc định). Mobile <600px: `.acc-nav` chuyển flex ngang scroll-x (overflow-x auto, -webkit-overflow-scrolling touch), link nowrap; heading trang nằm trong content (KHÔNG trong nav). CSS `/* ── SF-4 (FI-394) account side-nav ── */` CUỐI page.css: `.acc-shell { display:grid; grid-template-columns: 240px 1fr; gap: var(--space-5,24px); align-items:start; }`, `.acc-nav { background: var(--c-surface); border:1px solid var(--c-border); border-radius: var(--radius-lg,8px); padding: var(--space-2,8px); box-shadow: var(--shadow-1); position: sticky; top: 16px; }`, link: display flex gap 10 padding `10px 12px` radius-md font `var(--text-md)` 600 màu `--c-text`, icon màu `--c-text-muted`; hover nền `--wash-hover` `--dur-fast`; **active: màu `--c-link`, nền `--tint-primary-bg`, border-left 3px `--c-primary`** (direction §2.5/§4 Account); `@media (max-width: 600px)` grid 1 cột + nav ngang scroll-x, border-left active → border-bottom 2px. Dark mode: toàn var(--*).
- [x] **Step 3: Wrap 6 pages** — mỗi page trả `<AccountLayout active="…">…nội dung cũ…</AccountLayout>` với active TĨNH per page: AccountPage=`account`, OrdersPage+OrderDetailPage=`orders`, WishlistPage=`wishlist`, MyReviewsPage=`reviews`, AffiliatePage=`affiliate` (T9 nâng cấp affiliate→hash-aware: `#loyalty` → `loyalty`). THAY wrapper `auth-page` nếu có ở các trang account: AffiliatePage đang dùng `auth-page` → đổi `acc-content`; AccountPage giữ `account-grid` bên trong content. KHÔNG đụng logic fetch/authReady/guard. Auth pages (Login/Register/Forgot/Reset/2FA/OAuthCallback) KHÔNG wrap. OrdersPage h1 inline style → class `.acc-page-title` (margin 0 0 16, font 21/700).
- [x] **Step 4: i18n catalogs** — vi.ts: chèn block `account:` NGAY SAU block `nav:` (trước `auth:`), en.ts đồng bộ CẤU TRÚC (parity). Keys T1: `account.nav.label, account.nav.account, account.nav.orders, account.nav.wishlist, account.nav.reviews, account.nav.affiliate, account.nav.loyalty` (vi: 'Tài khoản', 'Đơn hàng', 'Sản phẩm yêu thích', 'Đánh giá của tôi', 'Affiliate', 'Điểm thưởng'; label 'Điều hướng tài khoản'). Comment `// ── SF-4 FI-394 — account surface (anchor: sau nav — merge sạch với SF-3/SF-5) ──`.
- [x] **Step 5: Unit test** — `accountLayout.test.tsx`: render 6 link + href đúng; active='orders' → link orders có `aria-current="page"` + class active; ảnh decorator `aria-hidden`; (jsdom) click link thường → appNavigate được gọi (mock module bootstrap).
- [x] **Step 6: Run** — `pnpm -C apps/mfe-account exec vitest run` + `exec tsc --noEmit` + `pnpm -C packages/i18n exec vitest run` (parity) → PASS. Commit:
```bash
git add frontend/apps/mfe-account/package.json frontend/apps/mfe-account/vitest.config.ts frontend/apps/mfe-account/src/AccountLayout.tsx frontend/apps/mfe-account/src/__tests__/accountLayout.test.tsx frontend/apps/mfe-account/src/page.css frontend/apps/mfe-account/src/pages frontend/apps/mfe-account/src/pages/orders frontend/apps/mfe-account/src/pages/wishlist frontend/apps/mfe-account/src/pages/my-reviews frontend/apps/mfe-account/src/pages/affiliate frontend/packages/i18n/src/catalogs/vi.ts frontend/packages/i18n/src/catalogs/en.ts frontend/pnpm-lock.yaml
git commit -m "feat(account): AccountLayout side-nav 6 mục + active + collapse <600px; vitest infra (FI-394 T1)"
```
- [x] **Step 7: BROWSER VERIFY (Rule 0)** — mở account trong browser (shell hoặc standalone :5176), chụp screenshot side-nav light + <600px collapse + active state. FAIL → fix trước T2.

### Task 2: Auth flows polish — validate realtime + password toggle + tokenize

**Files:**
- Modify: `pages/LoginPage.tsx`, `pages/RegisterPage.tsx`, `pages/ForgotPasswordPage.tsx`, `pages/ResetPasswordPage.tsx`, `pages/TwoFactorPage.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`
- Create: `src/components/EyeIcon.tsx`
- Create test: `src/__tests__/authValidation.test.tsx`

- [x] **Step 1: EyeIcon** — inline SVG stroke 1.8 (eye + eye-off path tự vẽ Feather-geometry), `size` prop, `aria-hidden` mặc định, server-safe. KHÔNG sửa ui-kit.
- [x] **Step 2: Validate realtime on-blur** — pattern dùng chung MỖI page (không abstract shared hook — 3 field khác nhau, P2 no-premature-abstraction): validate field khi `onBlur` (email regex, password ≥8, fullName ≥1, mã 6 số), clear error khi onChange sau khi field đã chạm (touched semantics: blur set touched, error hiện khi touched && invalid, submit validate tất cả + set touched tất cả). GIỮ nguyên mọi logic submit/2FA-challenge/next-path/duck-type ApiErrorClient.
- [x] **Step 3: Password toggle** — PRE-FLIGHT: grep `packages/ui-kit/src/components/Input.tsx` + styles xác nhận class root input là `.uk-input` (nếu khác → dùng class thật). LoginPage + RegisterPage + ResetPasswordPage: wrap Input trong `.pw-field` (position relative) + IconButton ghost sm type=button absolute phải, aria-label `t('account.auth.showPassword'/'hidePassword')`, aria-pressed, swap EyeIcon/eye-off, đổi input type text/password. KHÔNG đụng Input primitive (toggle NẰM NGOÀI input — absolute đè padding-right qua `.pw-field .uk-input { padding-right: 44px; }`). Browser check nhanh toggle sau Step 4 (không đợi T11).
- [x] **Step 4: Tokenize hex + polish** — **GIỮ NGUYÊN mọi data-testid: `forgot-email`, `forgot-submit`, `forgot-sent`, `reset-password-input`, `reset-submit`, `reset-success`, `reset-missing-token`** (e2e password-reset.spec gate cứng T11). Forgot sent banner + Reset done banner: hex inline `#eefcf0/#1b7a34` → class `.auth-ok` (nền `--tint-success-bg`, màu `--tint-success-text`, radius-md, padding như .auth-error) + Icon check. `.auth-error` giữ 2 hex pin (context pack). Card auth: giữ center max-400; title 24/800; spacing `--space-4`; OAuth buttons giữ env-gated (KHÔNG đụng logic); OAuthCallbackPage ERROR map → keys `account.oauth.*`.
- [x] **Step 5: i18n** — keys `account.auth.*`: title login/register/forgot/reset/2fa, field labels (email/password/fullName/newPassword/phone/code), placeholders GIỮ placeholder vi hoặc key hóa, errors (invalidEmail, passwordMin8, fullNameRequired, codeInvalid), submit (login/register/sendResetLink/resetPassword/confirm), switch (noAccount→register, haveAccount→login, backToLogin, loginWithNewPassword), banner (forgotSent, resetSuccess, resetMissingToken), toggle (showPassword/hidePassword), oauth ('Đăng nhập với Google/Facebook', 'hoặc'). vi/en song song. **GIỮ NGUYÊN CHUỖI vi đang có cho text đã tồn tại** (đặc biệt submit login = 'Đăng nhập' — e2e locate theo text).
- [x] **Step 6: Unit test** — authValidation.test.tsx: blur email rỗng → error hiện; nhập email hợp lệ + blur → error biến mất; toggle click → input type đổi text↔password + aria-pressed; submit form rỗng → 2 error inline (không gọi API — mock fetch assert 0 call).
- [x] **Step 7: Run** vitest + tsc + i18n parity → PASS. Commit: `feat(account): auth flows validate realtime on-blur + password toggle + tokenize banner (FI-394 T2)`.

### Task 3: UserMenu keyboard + role=menuitem + Icon

**Files:**
- Modify: `src/AuthWidget.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`
- Create test: `src/__tests__/userMenu.test.tsx`

- [ ] **Step 1: Menu semantics** — UserMenu: trigger button giữ `aria-haspopup="menu"` + `aria-expanded`; menu `<span role="menu">` → items `<a role="menuitem" href tabIndex={-1}>`; mở bằng click HOẶC ArrowDown/Enter/Space trên trigger (ArrowDown mở + focus item đầu); Escape đóng + restore focus về trigger; ArrowDown/ArrowUp di chuyển focus giữa items (wrap); Home/End đầu/cuối; Tab ngoài → đóng (focusout handler hoặc keydown Tab); outside-click đóng GIỮ + focus không bị nuốt. Đóng sau khi chọn item (giữ logic logout/appNavigate hiện có). KHÔNG đổi AuthProvider API / slot registration.
- [ ] **Step 2: Icon + decss** — **GIỮ data-testid `auth-guest` (GuestLinks) + `auth-user` (UserMenu)**. ▲/▼ text → `<Icon name="chevron-down" size={14} className={open ? 'um-caret--open' : undefined}>` (rotate 180 transition `--dur-fast`); TOÀN BỘ inline style (GuestLinks span/a + item hover JS onMouseEnter/Leave + menu panel) → classes `.um-*` trong page.css (panel: surface border radius-md shadow-3 min-width 200 z `--z-dropdown`; item padding 9 16 hover `--wash-hover` màu `--c-link` `--dur-fast`; GuestLinks: link Đăng nhập + nút Đăng ký outline — dùng class riêng `.um-guest__login/register`). Menu mở animation: fade+translateY(6px→0) `--dur-fast` `--ease-out` (không phải motion điểm nhấn — cho phép; keyframes trong page.css là surface-specific — direction §5.6 cho phép, gate reduced-motion: page.css thêm `@media (prefers-reduced-motion: reduce)` tắt animation này).
- [ ] **Step 3: i18n** — `account.menu.*`: account, orders (menu item 'Đơn hàng của tôi'), logout, displayNameFallback. REUSE `nav.login`/`nav.register` cho GuestLinks — ĐÃ VERIFY tồn tại (vi.ts nav block: login 'Đăng nhập', register 'Đăng ký'); fallback nếu thiếu: `account.menu.login/register` (hợp namespace — không tạo key ngoài account.*).
- [ ] **Step 4: Unit test (jsdom)** — mở menu → 3 menuitem role; ArrowDown từ trigger → focus item 1; ArrowDown/ArrowUp wrap; Escape → menu đóng + activeElement = trigger; click item → callback + đóng. AuthProvider mock qua wrapper (useAuth mock — KHÔNG render AuthProvider thật).
- [ ] **Step 5: Run** vitest + tsc + parity → PASS. Commit: `feat(account): UserMenu keyboard role=menuitem Escape arrow-key focus-restore + Icon caret (FI-394 T3)`.

### Task 4: AccountPage profile + 2FA polish

**Files:**
- Modify: `pages/AccountPage.tsx`, `pages/twofa/TwoFactorSection.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`
- Create test: `src/__tests__/profileValidation.test.tsx`

- [ ] **Step 1: Profile form** — fullName validate on-blur (T2 pattern), phone `inputMode="tel"` + validate khi CÓ nhập: ` /^(0|\+84)\d{8,10}$/ ` (vi format — error inline; rỗng = hợp lệ vì optional); banner/saved giữ role alert/status; KHÔNG đụng onSubmit API shape.
- [ ] **Step 2: Email/role read-only** — giữ dl `account-rows`; role Badge → tint đúng (CUSTOMER → neutral, ADMIN → primary — map nhỏ, không hard-code vi ngoài keys).
- [ ] **Step 3: TwoFactorSection polish** — badge 'Đang bật/Đang tắt' → keys; note texts → keys; spacing/nhịp theo direction (giữ mọi logic setup/confirm/disable/QR/recovery-codes nguyên văn — CHỈ text + class). `twofa-codes` grid 2 cột giữ.
- [ ] **Step 4: i18n** — `account.profile.*` (title, personalInfo, email, role, fullName, phone, phoneInvalid, save, saved, roleCustomer, roleAdmin, errorGeneric) + `account.twofa.*` (title, enabled, disabled, enable, disable, note*3, code, activationCode, backupCodes*2, confirmDisable, cancel, password, qrAlt).
- [ ] **Step 5: Unit test** — fullName blur rỗng → error; phone 'abc' blur → error; phone rỗng → OK; submit hợp lệ gọi updateProfile (mock api module).
- [ ] **Step 6: Run** vitest + tsc + parity → PASS. Commit: `feat(account): profile validate realtime inputMode tel + 2FA polish i18n (FI-394 T4)`.

### Task 5: OrdersPage — card polish + pill 6 màu + skeleton + empty

**Files:**
- Modify: `pages/orders/OrdersPage.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`
- Create test: `src/__tests__/ordersPage.test.tsx`

- [ ] **Step 1: Status pill 6 màu** — thay Badge variants bằng span `.pill .pill--<status>` map ĐÚNG token: pending→`--pill-pending-*`, paid→`--pill-paid-*`, confirmed→`--pill-confirmed-*`, shipped→`--pill-shipped-*`, delivered→`--pill-delivered-*`, cancelled→`--pill-cancelled-*`, **failed→cancelled family** (red). CSS `.pill { display:inline-flex; align-items:center; font-size:11px; font-weight:800; letter-spacing:.05em; padding:3px 9px; border-radius: var(--radius-full,999px); background: var(--pill-<s>-bg); color: var(--pill-<s>-text); }`. StatusBadge giữ export (OrderDetailPage import) + data giữ. Labels → keys `account.order.status.*` (7 statuses).
- [ ] **Step 2: Card polish** — decss list (inline styles → `.order-card*` classes): card shadow-1 radius-md; hover translateY(-2px) + shadow-2 `--dur-base` (order card KHÔNG lên shadow-3 — direction cascade: tile thường ≤2); order id `--c-link` 700 tabular-nums; meta 13 muted; total phải `--c-danger` 800. date/pay-method format GIỮ (vi-VN locale qua hàm formatDateTime — key hóa prefix text nếu có).
- [ ] **Step 3: Skeleton + empty** — loading → `<ListSkeleton count={4} />` thay `<p>Đang tải đơn hàng…`; empty → EmptyState icon `<Icon name="package" size={40} />` (thay 🛍️) + keys title/desc/cta; error giữ EmptyState alert icon Icon alert + keys.
- [ ] **Step 4: i18n** — `account.orders.*`: title ('Đơn hàng của tôi'), orderId, itemsCount ('{{count}} sản phẩm'), loading (giữ key dù UI skeleton — dùng cho aria), emptyTitle/emptyDesc/emptyCta, errorTitle, retry, paymentCod/paymentStripe.
- [ ] **Step 5: Unit test** — render với orders giả: pill class đúng theo status (7 map), formatVnd, link href `/account/orders/:id`; loading → ListSkeleton aria-busy; empty → EmptyState.
- [ ] **Step 6: Run** vitest + tsc + parity → PASS. Commit: `feat(account): orders card polish + status pill 6 token + ListSkeleton + empty Icon (FI-394 T5)`.

### Task 6: OrderDetailPage decss + Table + Textarea + timeline

**Files:**
- Modify: `pages/orders/OrderDetailPage.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`
- Create test: `src/__tests__/orderDetail.test.tsx`

- [ ] **Step 1: decss** — 42 khối inline style → classes `od-*` (head-row, banner, meta-card, items-card, totals, address, tracking, rma-row, timeline). GIỮ data-testid + mọi logic fetch/RMA/cancel/invoice. `←` nút back → IconButton ghost aria-label key + Icon chevron-left; invoice button + Icon external; nút "Trả hàng / hoàn tiền" + Icon package (chốt — Icon set 22 names, package khớp ngữ nghĩa hàng hóa). Cancel button danger giữ text-only.
- [ ] **Step 2: Items table** — `<table>` tay → ui-kit `Table` columns: Sản phẩm (left) / SL (center) / Thành tiền (right); rows = order.items; `.uk-table` style có sẵn. Totals block giữ div (không phải table data) + decss.
- [ ] **Step 3: RMA modal** — qty raw input → `QuantityStepper` (min 0 max item.qty — value 0 mặc định, KHÔNG forced min 1: cho phép bỏ chọn món); textarea raw → `Textarea` (label key `account.order.rma.reason`, placeholder giữ, hint = đếm ký tự realtime `{{count}}/500` — max 500 enforce maxLength + hint cập nhật; error prop cho rmaError khi lý do rỗng); footer buttons giữ. rmaError → error prop Textarea khi là lý do; lỗi chọn-số-lượng giữ role=alert block (Alert primitive? — dùng `.od-rma-error` class + role alert, đơn giản giữ).
- [ ] **Step 4: Timeline GHN** — tracking events + order timeline → `.od-timeline`: `<ol>` mỗi li = dot tròn 10px (mốc hoàn thành: nền `--c-success`; event tracking: `--c-primary`; chưa: `--c-border`) + đường nối 1px `--c-border` (li::before), nội dung: time 12 muted tabular + description; tracking header decss (mã vđ/tabular). GIỮ data-testid="tracking-block".
- [ ] **Step 5: i18n** — `account.order.*`: title, orderedAt, payment, shipping, shippingStd/express, trackingCode, invoice, rmaCreate, cancel, items, item/qty/lineTotal, subtotal, discount, pointsDiscount, shippingFee, total, address, shippingSection, trackingCarrier*3, noTracking, rmaSection, rmaModalTitle, rmaQtyLabel, rmaReason, rmaReasonPlaceholder, rmaCount, rmaErrorReason, rmaErrorEmpty, rmaSubmit, rmaSubmitting, close, cancelModalTitle, cancelModalBody, keepOrder, confirmCancel, cancelling, cancelSuccess, backToList, notFound, loading, rmaStatus.* (5), banner fields.
- [ ] **Step 6: Unit test** — render order giả: items Table rows đúng; pill trong head; RMA modal mở (click testid rma-create) → Textarea label + QuantityStepper max clamp; cancel modal mở → ESC đóng (jsdom fireEvent keyDown Escape). Mock ordersApi module.
- [ ] **Step 7: Run 2 MỐC (fault-isolation — task nặng nhất chuỗi):** Run A sau Step 2 (decss + Table) → vitest+tsc PASS mới sang Step 3; Run B sau Step 5 (modal/textarea/timeline + i18n) → vitest+tsc+parity PASS. FAIL ở mốc nào fix đúng mốc đó, không gộp debug. Commit sau Run B: `feat(account): OrderDetail decss 42 inline → od-* classes + ui-kit Table/Textarea/QuantityStepper + timeline GHN (FI-394 T6)`.

### Task 7: WishlistPage — grid ProductCard anatomy + confirm delete

**Files:**
- Modify: `pages/wishlist/WishlistPage.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`
- Create test: `src/__tests__/wishlistPage.test.tsx`

- [ ] **Step 1: Grid anatomy** — wl-card elevation theo product-card direction §2.2 (shadow-1 radius-md border, hover translateY(-3px) + shadow-3 `--dur-base` — wishlist card là product card = điểm nhấn thương mại được lên 3); thumb 190 cao fallback gradient `--c-bg` + emoji→`<Icon name="package" size={44}>` muted; tên clamp 2 13/600 hover `--c-link`; giá 17/800 `--c-danger` (GIỮ formatVnd local — no import chéo app); sao `--c-warning` / track `--star-track` (StarRating primitive? — ratingAvg hiển thị tĩnh: dùng text ★ hiện có key hóa aria, hoặc StarRating — chốt: StarRating primitive read-only value + count, khớp storefront anatomy); nút Xóa → IconButton outline sm aria-label + Icon trash, hover `--c-danger`.
- [ ] **Step 2: Confirm delete** — click Xóa → ui-kit Modal confirm (title/desc key + tên SP, footer: Hủy secondary + Xóa danger loading) → mới gọi removeWishlistItem. GIỮ removingId state + error path.
- [ ] **Step 3: Skeleton + empty** — loading → grid 4 ProductCardSkeleton (`.wl-grid` skeleton variant); empty → EmptyState icon heart + eyebrow key (direction §4 Wishlist: empty card border dashed + 'Chưa có sản phẩm yêu thích'); error giữ.
- [ ] **Step 4: i18n** — `account.wishlist.*`: title, emptyTitle/emptyDesc, delete, deleteConfirmTitle/Desc, cancel, deleting, errorLoad, errorRemove.
- [ ] **Step 5: Unit test** — render items → link PDP đúng slug; click Xóa → modal mở, KHÔNG gọi remove ngay (mock contracts client); confirm → remove gọi; empty → EmptyState; loading → skeletons.
- [ ] **Step 6: Run** vitest + tsc + parity → PASS. Commit: `feat(account): wishlist grid product-card anatomy + confirm delete + skeleton (FI-394 T7)`.

### Task 8: MyReviewsPage — badges + polish

**Files:**
- Modify: `pages/my-reviews/MyReviewsPage.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`

- [ ] **Step 1: Badge tints** — STATUS_BADGE giữ Badge primitive variant tints (PENDING warning/APPROVED success/REJECTED danger — đã đúng) + labels → keys; verified '✓ Mua đã xác nhận' → class + Icon check 14 + key; stars color giữ `--c-warning` letter-spacing 2 (không StarRating — tĩnh text đủ, list không cần interactive).
- [ ] **Step 2: Polish + skeleton** — card shadow-1 radius-md hover yên tĩnh (review list không cascade — không phải commerce card); loading → ListSkeleton thay 'Đang tải…'; empty → EmptyState icon star + keys; date format giữ.
- [ ] **Step 3: i18n** — `account.reviews.*`: title, statusPending/statusApproved/statusRejected, verified, emptyTitle/emptyDesc, loading, errorLoad, productFallback.
- [ ] **Step 4: Run** vitest + tsc + parity → PASS. Commit: `feat(account): my-reviews badge keys + skeleton + empty Icon (FI-394 T8)`.

### Task 9: Affiliate + Loyalty KPI polish + ledger Table + anchor

**Files:**
- Modify: `pages/affiliate/AffiliatePage.tsx`, `pages/affiliate/LoyaltyPointsSection.tsx`, `src/page.css`, `catalogs/{vi,en}.ts`
- Create test: `src/__tests__/affiliatePage.test.tsx`

- [ ] **Step 1: KPI stats cards** — decss 16 inline + KPI pattern direction §2.5/§4: label 11/700 uppercase tracking .08em muted + value 23/800 tabular-nums (Clicks/Conversions/Hoa hồng); card shadow-1 radius-md; GIỮ data-testid.
- [ ] **Step 2: Ledger → Table primitive** — table tay + thStyle/tdStyle → ui-kit `Table` columns (Đơn left tabular link-màu / Giá trị right / Tỷ lệ center / Hoa hồng right 700 / Trạng thái → pill tint map ĐÚNG enum `LedgerEntry.status` (affiliateApi.ts:32 — chỉ 'PENDING' | 'CONFIRMED'): PENDING→pill-pending, CONFIRMED→pill-confirmed, giá trị lạ → pill-cancelled); row hover wash `--dur-fast`; empty ledger giữ text key.
- [ ] **Step 3: Ref-link + code polish** — **GIỮ data-testid `affiliate-code` + `affiliate-link`**. Code 24/700 letter-spacing 4 tabular giữ + Badge rate tint-primary; copy button giữ logic + copied state; link `wordBreak` decss `.af-*`. LƯU Ý direction §4 nhắc "rút tiền CTA = --grad-cta" — page HIỆN KHÔNG có chức năng rút tiền (out of scope — không thêm tính năng mới); khi sau này có, áp CTA đó.
- [ ] **Step 4: Loyalty anchor + KPI** — `LoyaltyPointsSection` render `<section id="loyalty" className="af-loyalty">` + useEffect scrollIntoView({behavior:'smooth'|'auto' reduced-motion, block:'start'}) khi `window.location.hash === '#loyalty'`; stats theo KPI pattern (Điểm hiện có value 23/800 `--c-primary`? — direction §4: rank/tier tint-primary; điểm = value 23/800 tabular, color text chuẩn + pill '≈ VND' tint-primary); loading → ListSkeleton 1; GIỮ data-testid loyalty-section/loyalty-balance.
- [ ] **Step 5: i18n** — `account.affiliate.*` (title, register*4, pending*2, suspended*2, statsClicks/statsConversions/statsEarnings, refCode, rate, generateLink, linkLabel, copyLink, copied, ledger, ledgerEmpty, ledgerCol*5, status labels, errorLoad, errorSubmit) + `account.loyalty.*` (title, balance, totalEarned, convert, convertRate, loading, errorLoad).
- [ ] **Step 6: Unit test** — APPROVED profile mock → 3 KPI testid giá trị + code + link chứa ?ref=CODE; ledger rows render Table; PENDING → pending card. Mock affiliateApi module.
- [ ] **Step 7: Run** vitest + tsc + parity → PASS. Commit: `feat(account): affiliate KPI + ledger Table + loyalty anchor #loyalty (FI-394 T9)`.

### Task 10: i18n sweep residual + parity lock

**Files:**
- Modify: `catalogs/{vi,en}.ts` (residual keys nếu T2-T9 sót), các page còn hard-code sót

- [ ] **Step 1: Sweep** — residual hard-code tiếng Việt trong `apps/mfe-account/src` ngoài test (macOS: BSD grep KHÔNG có -P — dùng rg): `rg -n "[ơưạáàảãấầẩẫậắằẳẵặéèẻẽếềểễệíìỉĩịóòỏõốồổỗộớờởỡợúùủũứừửữựýỳỷỹỵđ]" frontend/apps/mfe-account/src -g '*.tsx' -g '!*test*'` + review từng hit: key hóa (vi+en cùng commit) hoặc ghi lý do giữ (vd formatVnd '₫', date locale, placeholder động).
- [ ] **Step 2: useT wiring audit** — mọi page đã đăng nhập + auth pages dùng `useT()` (initI18n chạy ở bootstrap/main + shell host — verify cả 2 biên đã init; standalone main.tsx có initI18n, shell host App dùng useT sẵn — OK).
- [ ] **Step 3: Parity + unit** — `pnpm -C packages/i18n exec vitest run` (parity structural vi/en TOÀN catalogs) + `pnpm -C apps/mfe-account exec vitest run` + tsc. Commit: `feat(i18n): account.* sweep residual + parity lock (FI-394 T10)`.

### Task 11: Responsive + walkthrough + unit consolidation + e2e subset

**Files:**
- Modify: `src/page.css` (responsive fixes nếu walkthrough thấy), unit tests consolidation

- [ ] **Step 1: Responsive audit <600px** — side-nav ngang scroll-x (T1); account-grid 1 cột (720px breakpoint có sẵn — giữ); auth-card full-width padding 16; OrderDetail tables scroll-x (`.od-items-wrap { overflow-x:auto }` nếu tràn); affiliate KPI auto-fit giữ; wishlist grid minmax 200 → 1 cột mượt.
- [ ] **Step 2: Unit consolidation** — `pnpm -C apps/mfe-account exec vitest run` toàn bộ xanh + tsc sạch + i18n parity xanh.
- [ ] **Step 3: BROWSER WALKTHROUGH (Rule 0 — 3 tầng)** — live stack (make dev / shell :5173): login → side-nav điều hướng TẤT CẢ 6 trang → OrderDetail (modal RMA + hủy focus/ESC) → wishlist xóa confirm → đổi locale en toàn account → UserMenu keyboard cả flow → logout; screenshot MỖI màn + dark mode sweep account; console sạch. FAIL → fix + re-chụp.
- [ ] **Step 4: e2e subset** — prerequisite: Mailpit :8025 sống (password-reset đọc mail qua Mailpit API) + identity + catalog + ordering. `auth-cookie.spec.ts`, `password-reset.spec.ts`, `engagement.spec.ts` XANH trên stack thật (port-base +200 nếu isolate; SHELL/GATEWAY_URL env override). KHÔNG sửa spec (read-only).
- [ ] **Step 5: Commit** fixes nếu có: `fix(account): responsive/walkthrough fixes (FI-394 T11)`.

---

## Acceptance ↔ Task mapping (Phase 5 verifier dùng)

| ACCEPTANCE (context pack) | Task cung cấp | Verify |
|---|---|---|
| 1. Side-nav 6 mục + active + mọi trang vào được từ side-nav | T1 (layout) + T9 (#loyalty) | browser: login → click từng item → đúng trang + active; <600px collapse |
| 2. Loading skeleton + pill màu chuẩn + wishlist nhất quán | T5 (orders pill/skeleton) + T7 (wishlist) + T8/T9 skeleton | browser: throttle loading thấy skeleton; pill so token |
| 3. OrderDetail table + modal focus/ESC + textarea label/đếm + timeline | T6 | browser: mở RMA modal → Tab chẹn trong + ESC đóng; textarea label + đếm; timeline dot |
| 4. UserMenu keyboard + form validate blur + password toggle | T3 + T2 (+T4 profile) | browser: Tab tới menu → ArrowDown → ESC focus về; blur email rỗng → lỗi đỏ; toggle hiện/ẩn |
| 5. Locale en toàn bộ account | T2-T10 keys + T10 sweep | browser: đổi en → mọi trang account + auth English; grep sweep 0 residual |
| 6. e2e subset + unit mfe-account xanh | T11 + mọi task | playwright 3 spec PASS + vitest run PASS |
