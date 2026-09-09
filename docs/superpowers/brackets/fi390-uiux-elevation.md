# Story: FI-390 — UI/UX Elevation v2 — toàn hệ thống FE

Destination: story/fi390-uiux-elevation

## Merge sequence (tier-1 → SF-6, coordinator-owned)
SF-2/3/4/5 merge TUẦN TỰ SF-2 → SF-3 → SF-4 → SF-5 vào `story/fi390-uiux-elevation` (merge-playbook: merge PARENT vào sf-branch trước, update-ref FULL refname + 2 ancestor guards); smoke golden-path sau MỖI merge; SF-6 chỉ start sau merge cuối. i18n catalogs merge sạch nhờ anchor rule trong packs SF-3/4/5.

## SF-1 design-foundation-motion
Tier: 0
linear: FI-391
Design: none
What: 5 app dùng chung 1 design language elevation (input: hand-off doc từ designer pre-SF step — user đã chọn hướng trong brand lock #F53D2D); tokens v2 có motion/z-index/breakpoint; primitives mới dùng-thật (QuantityStepper, Pagination, Breadcrumbs, Alert, IconButton, form controls, Stepper); SVG Icon set; skeleton compositions; scroll-reveal utility; font Be Vietnam Pro load thật trên 4 app Vite (cả 2 biên MF — standalone main.tsx + host-context bootstrap); 'use client' resolution cho stateful primitives; prefers-reduced-motion hoạt động toàn hệ thống; primitive style đúng khi mount trong shell. Demo: mở storefront home + shell-mounted checkout thấy font everywhere + primitives mới trong /ui-kit demo + toast/pop có animation + reduced-motion tôn trọng.
Depends on: —
Tasks: tokens-v2-motion-zindex-breakpoint-update-regression-test-direction-doc / font-face-selfhost-vite-4apps-both-mf-boundaries / use-client-stateful-primitives-thu-hep-shim / ui-kit-css-both-boundaries-5-import-sites-barrel-exports / primitive-quantity-stepper / primitive-pagination-url-and-client / primitive-breadcrumbs-iconbutton-alert / primitive-form-controls-checkbox-radio-textarea / primitive-stepper-keyboard / icon-svg-set-component-catalog / skeleton-compositions-loading-pattern / motion-utilities-reduced-motion-global-scroll-reveal-hook / i18n-contract-primitive-keys-parity-test-testid-adr / unit-tests-primitives-tabs-keyboard-regression

## SF-2 storefront-web-elevation
Tier: 1
linear: FI-392
Design: none
What: shopper đi hết home→PLP→PDP→search→coupons không thấy reload trắng (next/link + prefetch thay 24 chỗ <a> thô), mọi route có skeleton + error page đẹp, PDP tabs/modal chuẩn a11y (thay :target hack), motion điểm nhấn (hero ken-burns, scroll-reveal section, gallery zoom) reduced-motion safe, mobile <600px dùng được trơn, i18n gom 12+ COPY object + aria-label hardcoded. Demo: bấm sort/filter/pagination không trắng trang; thu hẹp <600px vẫn mua được.
Depends on: SF-1
Tasks: next-link-migration-24-links-sortselect-router / loading-error-notfound-skeleton-compositions / header-search-mininav-polish-direction / hero-carousel-elevation-kenburns-pause-a11y / home-sections-flash-category-featured-scroll-reveal / productcard-price-primitive-consolidate-hover / plp-pagination-primitive-filter-a11y-real-checkbox / pdp-gallery-zoom-tabs-real-keyboard-buysticky-mobile / pdp-review-modal-uikit-focus-trap-esc / search-coupons-polish-empty-copybutton / footer-newsletter-tokenize-recentlyviewed-decss / i18n-consolidate-copy-objects-aria-labels / responsive-600-mobile-nav-sticky-atc-grid / breadcrumb-jsonld-sold-count-placeholder-fix / walkthrough-screenshots-e2e-golden-nav-green

## SF-3 shell-checkout-elevation
Tier: 1
linear: FI-393
Design: none
What: header shell ngang tầm storefront (logo + search + cart-badge + account menu + mini-nav — lắp components ĐÃ CÓ vào HeaderSlots, không logic mới); click giỏ → mini-cart drawer (nằm TRONG mfe-checkout khu vực CartBadge, đọc state cart hiện có qua cartApi/authStore, ZERO fetch path mới — không tạo nguồn cart state thứ 2); cart dùng QuantityStepper primitive + confirm delete; checkout 3 bước dùng Stepper primitive keyboard-OK, form validate realtime + inputMode, summary có ảnh sản phẩm; coupon áp được từ cart; .pay-warning + hex cứng tokenize (dark mode hết vỡ); confirmation CTA về trang chủ. Demo: guest vào cart → drawer preview → checkout 3 bước mượt → confirmation CTA về trang chủ.
Depends on: SF-1
Tasks: shell-header-slots-logo-search-cart-account-mininav / mini-cart-drawer-in-mfe-checkout-existing-cart-state / cartpage-quantitystepper-line-polish-confirm-delete / checkoutpage-stepper-primitive-keyboard / checkout-step1-form-ux-realtime-inputmode-no-addressbook / checkout-step23-shipping-cards-payment-summary-images / coupon-in-cart-carry-to-checkout / pay-warning-hex-tokenize-dark-fix / confirmation-hero-cta-home-timeline-polish / cartbadge-themetoggle-icon-swap / page-css-elevation-motion-tokens-skeleton-summary / i18n-checkout-hardcode-to-keys-checkout-namespace-only / walkthrough-tests-green

## SF-4 account-elevation
Tier: 1
linear: FI-394
Design: none
What: account có layout side-nav thống nhất (Tài khoản/Đơn hàng/Wishlist/Reviews/Affiliate/Loyalty); auth flows validate realtime + password visibility toggle; UserMenu dropdown keyboard-OK; mọi trang có skeleton (thay text "Đang tải…"); OrderDetail bỏ 42 khối inline-style → css + ui-kit Table/Modal/Textarea + timeline; wishlist grid nhất quán ProductCard; affiliate/loyalty stats polish; i18n hardcode → keys (namespace account.* additive-only). Demo: login → side-nav điều hướng mọi trang account mượt, loading có skeleton, keyboard đi hết menu.
Depends on: SF-1
Tasks: account-layout-sidenav-routes / auth-flows-polish-realtime-validation / usermenu-keyboard-role-menuitem-icon / accountpage-profile-2fa-polish / orders-page-card-skeleton-status-pill / orderdetail-decss-uikit-table-modal-textarea-timeline / wishlist-grid-consistent-skeleton-empty / myreviews-badges-polish / affiliate-loyalty-stats-ledger-polish / i18n-account-hardcode-to-keys-account-namespace-only / responsive-walkthrough-tests

## SF-5 admin-elevation
Tier: 1
linear: FI-395
Design: none
What: admin 14 màn nhất quán theo direction: sidebar icon + active state, dashboard KPI/cards polish, tables có client-side sort cột + page-size selector + sticky header + skeleton, pagination dùng primitive (thay "← Trước/Sau"), admin-badge-mock css dọn + hex tokenize, dark mode sạch. KHÔNG server-side sort/filter, KHÔNG bulk. Demo: login admin → 14 màn visual pass đồng bộ 4 trạng thái theme (storefront/admin × light/dark), sort/page-size chạy client-side.
Depends on: SF-1
Tasks: adminshell-sidebar-icons-active-groups / dashboard-kpi-charts-polish / tables-client-sort-pagesize-sticky-skeleton-rowhover / pagination-primitive-swap-4-pages / productslist-productform-polish-grid-upload-variants / orders-orderdetail-pill-timeline-actions / remaining-pages-visual-pass-8-man-hinh / admin-badge-mock-cleanup-hex-tokenize / forbidden-error-states / walkthrough-4-state-theme-tests / unit-tests-admin-fix-green

## SF-6 convergence-qa
Tier: 2
linear: FI-396
Design: none
What: cả hệ thống đồng bộ sau 4 surface SF merge: consistency sweep (tokens 1 nguồn), dark-mode 4-trạng-thái contrast sweep (scripted), prefers-reduced-motion sweep, mobile 375/768 sweep, keyboard-only flow login→cart→checkout, i18n parity vi/en (0 hardcoded P1), e2e FULL suite xanh (fix selector vỡ bằng data-testid fallback), unit tests toàn monorepo xanh, CLS đo trước/sau (target < 0.1 home+PDP), visual walkthrough record toàn surfaces. Sweep fail → fix task gán về SF sở hữu, re-run (cap 2 vòng) — SF-6 không tự sửa code surface. Demo: full suite xanh + walkthrough video, user sign-off.
Depends on: SF-2, SF-3, SF-4, SF-5
Tasks: cross-surface-consistency-sweep / dark-mode-4-state-contrast-sweep-scripted / reduced-motion-sweep / responsive-375-768-sweep / a11y-keyboard-only-flow-focus-order / i18n-parity-sweep-hardcoded-p1-zero / e2e-full-suite-selector-fix-testid / unit-tests-monorepo-token-regression / perf-cls-measure-font-skeleton / visual-walkthrough-record-signoff
