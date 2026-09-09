# UI/UX Elevation v2 — Spec (epic)

> Story: FI-388 — UI/UX elevation toàn hệ thống FE · Ngày: 2026-09-08
> Nguồn: 3 Explore agents (storefront-web / shell+MFEs / ui-kit+i18n) + phase0-impact-analyst 10 chiều + 6 quyết định user (Q1–Q6, tất cả = A).
> User phàn nàn gốc: **"UI/UX vẫn còn rất thô sơ"** — sau FI-368 (polish diff-vs-direction-A).

---

## 0. IDEA-BRIEF (8 chiều)

- **Task**: nâng chất lượng cảm nhận UI/UX từ "thô sơ" → polished trên 6 surfaces (ui-kit foundation, storefront-web, shell chrome, checkout, account, admin). KHÔNG đụng logic nghiệp vụ.
- **Output**: FE elevation: motion system + states + client-nav + responsive mobile + icon SVG + i18n consolidation + shell header ngang tầm storefront + mini-cart drawer + primitives dùng-thật.
- **Users**: shopper (storefront), user đã đăng nhập (account), admin (backoffice).
- **Constraints**: không phá function GA v1.1 (Stripe, coupon, affiliate, reviews, saga, GA4 exactly-once); KHÔNG backend (zero contracts/API/DB — analyst confirmed); brand lock `#F53D2D`; tests xanh bắt buộc (27 FE unit files + token-regression + 14+ e2e specs); pnpm-lock dep freeze (không thêm dependency).
- **Input**: code hiện tại + direction FI-310 "Chợ Sôi Động" (docs/superpowers/designs/fi310-storefront-direction.md) + FI-368 polish pass.
- **Context**: GA v1.1 + Phase 7 no-fallback xong. Function hoàn chỉnh; thô ở cảm nhận.
- **Success criteria**: xem §7 (binary, đo được).
- **Out-of-scope**: xem §8.

## 1. Quyết định đã chốt (user, 2026-09-08)

| # | Quyết định | Chọn |
|---|---|---|
| Q1 | Brand lock | **A** — `#F53D2D` + họ tint hiện tại BẤT BIẾN; designer đổi layout/typography/depth/motion, không đổi màu chủ đạo |
| Q2 | Motion | **B** — subtle nền (hover/press/toast/skeleton shimmer, 120–250ms) + điểm nhấn rich: scroll-reveal section (home), hero ken-burns/parallax nhẹ, PDP gallery hover-zoom, drawer slide — TOÀN BỘ `prefers-reduced-motion` safe |
| Q3 | Sổ địa chỉ + cascading tỉnh/quận | **A** — out-of-scope (cần backend); chỉ polish form UX hiện tại (validate realtime, `inputMode`, inline error) |
| Q4 | Mini-cart drawer | **A** — LÀM (ui-kit Drawer có sẵn; FE thuần) |
| Q5 | Admin depth | **B** — visual + table UX client-side: sort cột (client-side), page-size selector, sticky header; KHÔNG server-side pagination/sort/filter, KHÔNG bulk action |
| Q6 | Shell header | **A** — xịn hoá ngang tầm storefront-web: logo + search + cart-badge + account menu + mini-nav (lắp components ĐÃ CÓ vào HeaderSlots; không viết logic auth/cart mới) |

**Auto-decisions (PM, theo conventions — đúng nguyên nhân "thô" số 1, không mất no-JS fallback):** 24 chỗ `<a href>` thô → `next/link` + prefetch (Link render `<a>` thật nên GET-form no-JS vẫn chạy; filter/sort URL-driven GIỮ NGUYÊN); bộ SVG Icon thay emoji; gom i18n 12+ file `Record<'vi'|'en'>` COPY + ~10 aria-label hardcoded; load font Be Vietnam Pro thật cho 4 app Vite (storefront-web ĐÃ có qua `next/font` — layout.tsx:2); Account layout side-nav; PDP tabs `:target` hack → tabs thật keyboard-accessible.

## 2. Problem framing — 8 trục "thô sơ" (bằng chứng verified)

1. **Motion**: app.css 2.324 dòng có 5 transition, **0 `@keyframes`**; mfe-checkout/account page.css 0 keyframes; `prefers-reduced-motion` 0 hit toàn monorepo. ui-kit ĐÃ có `uk-toast-in/uk-pop-in/uk-fade-in/uk-skeleton-pulse` nhưng gần như không app dùng.
2. **Loading/error states**: storefront-web 0 `loading.tsx`/`error.tsx`/Suspense (trắng trang chờ SSR; lỗi lạ = crash Next mặc định); `Skeleton` có sẵn nhưng 0 import ở storefront; account orders/wishlist loading = text "Đang tải…".
3. **Navigation feel**: 24 chỗ `<a>` thô, SortSelect `window.location.assign` → reload trắng khi sort/filter/phân trang.
4. **Responsive**: 1 breakpoint duy nhất max-900px; không <600px; không hamburger; hero cố định 300px; không sticky AddToCart mobile.
5. **Consistency**: thiếu ~10 primitives cần-thật (QuantityStepper, Pagination, Breadcrumbs, Alert, IconButton, Checkbox/Radio/Textarea, Stepper, Icon) → hand-roll duplicate: qty stepper (CartPage.tsx:51-75), Pagination ×5 nơi, toast/modal ×6 nơi storefront, Drawer dùng 0 lần; emoji làm icon; hex cứng vỡ dark mode (`.pay-warning` checkout page.css:292-295, NewsletterForm #bbb/#7ed957/#222, admin-badge-mock css còn sót).
6. **A11y**: PDP tabs `:target` (jump-scroll, không arrow-key); stepper `role=button` không `onKeyDown`; UserMenu không keyboard; review modal thiếu focus-trap/ESC/restore-focus; hero autoplay không pause.
7. **i18n**: 12+ file storefront tự giữ COPY; checkout/account hard-code tiếng Việt trong JSX (admin thì 100% `t()`); parity vi/en risk khi thêm key.
8. **Font**: 4 app Vite khai báo `--font-sans: 'Be Vietnam Pro'` nhưng 0 @font-face → rơi system font (storefront-web đã có next/font).

## 3. Kiến trúc giải pháp — hybrid tier (analyst Direction C)

**Tier 0 foundation** (SF-1) sở hữu MỌI mechanism dùng chung → surface tiers (SF-2…5) chỉ TIÊU THỤ → convergence (SF-6) verify chéo. Lý do: tránh tái tạo hand-roll dup (đúng bệnh gây thô), surface SFs chạy song song sạch, blast radius từng SF chứa được.

**Phân định mechanism-vs-content (anti-duplicate, chốt trước khi viết SF):**
- **Tier 0 sở hữu**: motion tokens + `prefers-reduced-motion` global + scroll-reveal utility (IntersectionObserver, reduced-motion safe — dùng chung home/admin/account); skeleton compositions (ProductCardSkeleton/TableSkeleton/ListSkeleton); SVG Icon set + component; primitives mới (QuantityStepper, Pagination, Breadcrumbs, Alert, IconButton, Checkbox/Radio/Textarea, Stepper); client-side table sort/page-size mechanism (nếu làm table-ux package chung — nếu chỉ admin dùng thì SF-5 sở hữu); 'use client' resolution; @font-face; breakpoint tokens; z-index scale; i18n contract cho primitives (keys vi/en + parity test); data-testid convention; ui-kit.css import vào 4 main.tsx.
- **Surface SF chỉ làm content-level**: swap emoji→Icon (1 dòng/file), wire skeleton compositions, dùng primitive thay hand-roll, move string riêng của surface sang keys, responsive CSS riêng của surface. Không SF nào build lại mechanism.
- Kiểm tra gộp: không có 2 SF nào ≥50% tasks cùng loại — SF-2 storefront / SF-3 shell+checkout / SF-4 account / SF-5 admin là 4 tập file rời nhau hoàn toàn.

### SF-1 design-foundation-motion (Tier 0) — Design: none (hand-off từ designer pre-SF step, §5)
**What**: khi xong: 5 app dùng chung 1 design language mới (direction user đã chọn — input: hand-off doc §5); tokens v2 có motion/z-index/breakpoint; primitives mới dùng-thật; font thật trên mọi app (cả 2 biên MF); reduced-motion hoạt động; primitive style đúng khi mount trong shell. Demo: mở storefront home + shell-mounted checkout, thấy font Be Vietnam Pro everywhere + primitives mới trong /ui-kit demo + toast/pop có animation + reduced-motion tôn trọng.
**Tasks (14)**: tokens-v2-motion-zindex-breakpoint-update-regression-test-direction-doc / font-face-selfhost-vite-4apps-both-mf-boundaries / use-client-stateful-primitives-thu-hep-shim / ui-kit-css-both-boundaries-5-import-sites-barrel-exports / primitive-quantity-stepper / primitive-pagination-url-and-client / primitive-breadcrumbs-iconbutton-alert / primitive-form-controls-checkbox-radio-textarea / primitive-stepper-keyboard / icon-svg-set-component-catalog / skeleton-compositions-loading-pattern / motion-utilities-reduced-motion-global-scroll-reveal-hook / i18n-contract-primitive-keys-parity-test-testid-adr / unit-tests-primitives-tabs-keyboard-regression.

### SF-2 storefront-web elevation (Tier 1) — Design: none (inherit SF-1 hand-off)
**What**: shopper đi hết home→PLP→PDP→search→coupons không thấy reload trắng (client-nav + prefetch), mọi route có skeleton + error page đẹp, PDP tabs/modal chuẩn a11y, motion điểm nhấn (hero ken-burns, scroll-reveal section, gallery zoom) reduced-motion safe, mobile <600px dùng được trơn. Demo: bấm sort/filter/pagination không trắng trang; thu hẹp <600px vẫn mua được.
**Tasks (15)**: next-link-migration-24-links-sortselect-router / loading-error-notfound-skeleton-compositions / header-search-mininav-polish-direction / hero-carousel-elevation-kenburns-pause-a11y / home-sections-flash-category-featured-scroll-reveal / productcard-price-primitive-consolidate-hover / plp-pagination-primitive-filter-a11y-real-checkbox / pdp-gallery-zoom-tabs-real-keyboard-buysticky-mobile / pdp-review-modal-uikit-focus-trap-esc / search-coupons-polish-empty-copybutton / footer-newsletter-tokenize-recentlyviewed-decss / i18n-consolidate-copy-objects-aria-labels / responsive-600-mobile-nav-sticky-atc-grid / breadcrumb-jsonld-sold-count-placeholder-fix / walkthrough-screenshots-e2e-golden-nav-green.

### SF-3 shell + checkout elevation (Tier 1) — Design: none
**What**: header shell ngang tầm storefront (logo + search + cart + account + mini-nav); click giỏ → mini-cart drawer; checkout 3 bước dùng Stepper primitive keyboard-OK, form validate realtime, summary có ảnh; dark mode hết vỡ. Demo: guest vào cart → drawer preview → checkout 3 bước mượt → confirmation CTA về trang chủ.
**Drawer contract (P0):** mini-cart drawer nằm TRONG mfe-checkout (khu vực CartBadge widget), KHÔNG ở shell — đọc state cart HIỆN CÓ qua cartApi/authStore đã có, ZERO fetch path mới; guest preview dùng guest cart read hiện tại. Không tạo nguồn cart state song song thứ 2 (vùng cart-merge từng sinh bug thật).
**Tasks (12)**: shell-header-slots-logo-search-cart-account-mininav / mini-cart-drawer-in-mfe-checkout-existing-cart-state / cartpage-quantitystepper-line-polish-confirm-delete / checkoutpage-stepper-primitive-keyboard / checkout-step1-form-ux-realtime-inputmode-no-addressbook / checkout-step23-shipping-cards-payment-summary-images / pay-warning-hex-tokenize-dark-fix-coupon-in-cart / confirmation-hero-cta-home-timeline-polish / cartbadge-themetoggle-icon-swap / page-css-elevation-motion-tokens-skeleton-summary / i18n-checkout-hardcode-to-keys-checkout-namespace-only / walkthrough-tests-green.

### SF-4 account elevation (Tier 1) — Design: none
**What**: account có layout side-nav thống nhất (Tài khoản/Đơn hàng/Wishlist/Reviews/Affiliate/Loyalty); mọi trang có skeleton; OrderDetail hết 42 khối inline-style; modal dùng ui-kit; user menu keyboard-OK. Demo: login → side-nav điều hướng mọi trang account mượt, loading có skeleton, keyboard đi hết menu.
**Tasks (11)**: account-layout-sidenav-routes / auth-flows-polish-realtime-validation / usermenu-keyboard-role-menuitem-icon / accountpage-profile-2fa-polish / orders-page-card-skeleton-status-pill / orderdetail-decss-uikit-table-modal-textarea-timeline / wishlist-grid-consistent-skeleton-empty / myreviews-badges-polish / affiliate-loyalty-stats-ledger-polish / i18n-account-hardcode-to-keys-account-namespace-only / responsive-walkthrough-tests.

### SF-5 admin elevation (Tier 1) — Design: none
**What**: admin 14 màn nhìn nhất quán theo direction: sidebar có icon + active state, dashboard KPI/cards polish, tables có client-side sort cột + page-size selector + sticky header + skeleton, pagination dùng primitive, dark mode sạch hex. Demo: login admin → đi 14 màn thấy visual pass đồng bộ 4 trạng thái theme (storefront-admin × light/dark), sort/page-size chạy client-side.
**Tasks (11)**: adminshell-sidebar-icons-active-groups / dashboard-kpi-charts-polish / tables-client-sort-pagesize-sticky-skeleton-rowhover / pagination-primitive-swap-4-pages / productslist-productform-polish-grid-upload-variants / orders-orderdetail-pill-timeline-actions / remaining-pages-visual-pass-8-man-hinh / admin-badge-mock-cleanup-hex-tokenize / forbidden-error-states / walkthrough-3-theme-tests / unit-tests-admin-fix-green.

### SF-6 convergence QA (Tier 2) — Depends on: SF-2, SF-3, SF-4, SF-5
**What**: cả hệ thống đồng bộ: consistency sweep, dark-mode 4-trạng-thái sweep, reduced-motion sweep, mobile 375/768 sweep, keyboard-only flow, i18n parity, e2e FULL xanh, unit tests xanh, CLS đo. Demo: chạy full suite + walkthrough video toàn surfaces.
**Tasks (10)**: cross-surface-consistency-sweep / dark-mode-4-state-contrast-sweep-scripted / reduced-motion-sweep / responsive-375-768-sweep / a11y-keyboard-only-flow-focus-order / i18n-parity-sweep-hardcoded-p1-zero / e2e-full-suite-selector-fix-testid / unit-tests-monorepo-token-regression / perf-cls-measure-font-skeleton / visual-walkthrough-record-signoff.

**Tier map**: SF-1 (0) → SF-2/3/4/5 (1, song song) → SF-6 (2). Tier-gate: gate tier N chỉ test những gì tier N tự cung cấp — §7.8 (shell header đủ logo/search/cart-badge/account-menu) verify TOÀN BỘ ở SF-6 vì account menu là remote của SF-4; gate SF-3 chỉ assert shell-owned + cart-badge. **Sweep-fix loop (P1):** sweep SF-6 fail → sinh fix task gán về SF sở hữu surface đó → re-run sweep (cap 2 vòng) — SF-6 KHÔNG tự sửa code surface.

## 4. Second-order effects — ràng buộc cứng (từ P0 analyst, verified)

1. **e2e selectors**: ~30 selector classname trong 14+ spec (`frontend/e2e/tests/*.spec.ts`) — `.pdp-atc`, `.cat-tile--more`, `.pdp-swatch`, `.plp-breadcrumb`, `.site-footer`, `.coupon-error`… Quy ước BẮT BUỘC: giữ semantic classname hoặc thêm `data-testid` song song TRƯỚC khi rename; SF-6 chạy full suite.
2. **Token-regression test** (`packages/ui-kit/src/__tests__/tokens.test.ts`): THÊM token mới = an toàn; ĐỔI value hiện có = fail theo thiết kế. SF-1 cập nhật test + direction doc §1 CÙNG commit.
3. **RSC**: chỉ đánh dấu `'use client'` cho stateful primitives (Modal/Drawer/Tabs/Toast/Select + mới); StarRating/EmptyState giữ server-safe; shim `storefront-web/components/ui-kit.ts` thu hẹp dần — SF-2 sở hữu, per-primitive khi wire primitive đó, không xóa một lần.
4. **MF css distribution (P0 — bài học FI-368 T11)**: `main.tsx` KHÔNG chạy khi remote mount vào shell — css import ở main.tsx là dead code trong host context (bằng chứng: `mfe-checkout/src/bootstrap.tsx:6`). Quy tắc BẮT BUỘC: css ui-kit import ở CẢ HAI biên — main.tsx (standalone) + bootstrap.tsx/exposed entry (host context), đúng pattern page.css FI-368 T11. 5 import sites: 4 app Vite + storefront-web (`app/[locale]/layout.tsx:5-6`). SF-1 gate BẮT BUỘC verify ≥1 primitive mới được style khi mount TRONG shell, không chỉ standalone. Cấm copy keyframes primitive vào page.css (primitive keyframes CHỈ ở ui-kit.css; surface-specific keyframes được phép ở surface css).
5. **Perf**: `next/link` prefetch giới hạn ở links tham số dài (filter/sort); skeleton reserve đúng chiều cao (CLS); animation chỉ `transform/opacity`; font subset vietnamese+latin, `display: swap`; nguồn woff2 = Google Fonts (Be Vietnam Pro, OFL — self-host hợp lệ).
6. **SEO/SSR**: KHÔNG đẩy PLP filter/sort/pagination từ URL vào client state (mất no-JS + vỡ canonical/hreflang); JSON-LD/OG/sitemap/PWA không đụng; thêm BreadcrumbList JSON-LD là cộng mới.
7. **A11y**: mọi keyframes mới gate bởi `prefers-reduced-motion`; contrast AA theo method đo được (script tính contrast từ computed styles per theme trên các page định danh — không thuần mắt); focus-trap/ESC/restore cho Modal/Drawer primitives; arrow-key Tabs/Stepper/UserMenu. Tabs ui-kit ĐÃ có roving tabindex + arrow-key (Tabs.tsx:39-55) — SF-1 chỉ thêm unit test khóa hành vi. Terminology theme: 2 base theme (storefront/admin) + dark overlay = **4 trạng thái sweep**.
8. **i18n**: keys mới phải có vi + en ngay từ đầu (2 hệ: storefront Record + @ecommerce/i18n cho MFEs); không hardcode vi mới. **Namespace additive-only (P0):** SF-3 CHỈ thêm `checkout.*`, SF-4 CHỈ thêm `account.*` vào catalogs/vi.ts+en.ts — cấm sửa key của SF khác; additive + khác vùng file nên merge sạch.
9. **Contracts/API/DB**: ZERO thay đổi — story thuần presentation.
10. **Dep freeze**: không thêm dependency (animation CSS-only; focus-trap đã có trong useOverlay). Cần dep → hỏi user riêng.

## 5. DESIGN-FIRST (pre-SF-1 coordinator step)

Designer agent (huashu) xuất **3 hướng HTML** elevation trong brand lock `#F53D2D` (Q1) — mỗi hướng thể hiện 5 khung đại diện: header + home section + PDP buy-area + cart/checkout step + admin table. **Brief ràng buộc (P1-5):** Q1 brand hex bất biến; Q2 motion subtle 120–250ms + điểm nhấn chỉ ở home/hero/PDP gallery/drawer; Q5/Q6 không logic mới; §4.10 CSS-only no-dep; màu chỉ qua tokens. User chọn 1 qua gate bắt buộc (coordinator điều phối — KHÔNG nằm trong tasks SF-1, SF agent không hỏi user) → hand-off `docs/superpowers/designs/fi390-uiux-elevation-direction.md` (tokens/structure/behavior + **rule extrapolation cho surfaces không nằm trong 5 khung**: coupons, search, account, affiliate, wishlist…) → SF-1 nhận hand-off doc làm input, implement tokens v2 + primitives per hand-off; SF-2…5 inherit (Design: none).

## 6. Gate scope mỗi SF (P1-4)

- **SF-1**: unit ui-kit (mới + regression) + browser check standalone AND ≥1 primitive style đúng khi mount trong shell (P0 MF rule) + 4 trạng thái theme.
- **SF-2**: unit storefront-web + e2e subset: golden-path, nav-honesty, related-products, review-flow.
- **SF-3**: unit mfe-checkout + e2e subset: golden-path (đoạn checkout), cod-checkout, saga-fail.
- **SF-4**: unit mfe-account + e2e subset: auth-cookie, password-reset, engagement.
- **SF-5**: unit mfe-admin + e2e subset: admin-coupon, admin-crud, upload-image, rbac.
- **SF-6**: FULL (cả 14 specs) + unit toàn monorepo. Full-stack e2e cần gateway+seed — chạy alt-ports per worktree (pattern fe-e2e-isolated).

ACCEPTANCE chi tiết nằm ở context packs `docs/superpowers/contexts/fi390-sf-{1..6}.md` (Spec slice / Touch map / ACCEPTANCE user-visible / Boundary). ACCEPTANCE là thứ verifier Phase 5 kiểm — KHÔNG chỉ process-pass.

## 7. Success criteria (binary, epic level)

1. e2e full suite xanh (14 specs) trên nhánh đích sau SF-6.
2. FE unit tests toàn monorepo xanh (27 file + token-regression cập nhật).
3. `@keyframes` > 0 trong ĐÚNG 4 file: `apps/storefront-web/app/app.css`, `apps/mfe-checkout/src/page.css`, `apps/mfe-account/src/page.css`, `apps/mfe-admin/src/page.css`; primitive keyframes CHỈ trong `packages/ui-kit/src/styles/ui-kit.css`; `prefers-reduced-motion` ≥ 1 hit toàn monorepo.
4. storefront-web: grep pattern `<a href="/` (raw anchor internal) = 0 hit ngoài next/link-generated; SortSelect không còn `window.location.assign`.
5. `loading.tsx` + `error.tsx` tồn tại cho home/PLP/PDP/search; skeleton xuất hiện ở orders/wishlist/admin tables.
6. Emoji làm icon = 0 hit trong: CartBadge, ThemeToggle (shell + storefront), UserMenu, ConfirmationPage hero, WishlistPage — thay bằng SVG Icon.
7. Font Be Vietnam Pro load được trên cả 5 apps (walkthrough screenshot + computed font-family).
8. Shell header đủ logo + search + cart-badge + account menu — verify TOÀN BỘ ở SF-6 (account menu là remote của SF-4); gate SF-3 chỉ assert shell-owned: logo/search/mini-nav + cart-badge (checkout, cùng SF) + theme-toggle.
9. Dark mode 4 trạng thái sweep: 0 hex cứng còn sót ở `.pay-warning`/NewsletterForm/admin css đã liệt kê; contrast AA per method §4.7.
10. pnpm-lock không đổi (0 dependency mới).
11. Mini-cart drawer: click badge giỏ ở header → drawer hiện line items + tổng + CTA "Xem giỏ/Thanh toán"; guest + logged-in đều hoạt động.
12. CLS đo trước/sau (font + skeleton): ghi nhận số liệu; target CLS < 0.1 trên home + PDP.
13. Visual walkthrough record 5 surfaces — user sign-off sau SF-6.

## 8. Boundary (KHÔNG làm)

- KHÔNG backend/contracts/DB (zero API change); KHÔNG sổ địa chỉ + cascading divisions (story riêng, Q3).
- KHÔNG thêm feature nghiệp vụ mới (không recommend engine, không search nâng cao).
- KHÔNG đổi brand color/hex tokens hiện có (Q1). Motion điểm nhấn (Q2 B) chỉ ở nơi spec liệt kê: home sections, hero, PDP gallery, drawer — không rải reveal vào mọi trang.
- KHÔNG server-side pagination/sort/filter + bulk admin (Q5 — client-side sort/page-size CÓ); KHÔNG đổi routes/URLs locale pattern; KHÔNG đổi MF remote names/HeaderSlots contract.
- KHÔNG thêm dependency mới (dep freeze); KHÔNG đụng GA4 exactly-once, saga retry logic, server-authoritative pricing.
- KHÔNG merge vào main — nhánh đích `story/fi390-uiux-elevation`, PR là quyền người.
