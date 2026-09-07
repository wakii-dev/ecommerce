# Story: FI-366 — Phase 6 — QA & Polish v1.1 (stabilization post-GA)

Destination: story/fi366-qa-polish-v11

Epic spec: docs/superpowers/specs/2026-09-07-qa-polish-v11-design.md
Context packs: docs/superpowers/contexts/fi366-sf-1.md · fi366-sf-2.md (mỗi SF đọc pack TRƯỚC khi code)
Base: master GA `40d801f`+ (sau PR #7) — 2 SF song song từ đầu, merge về nhánh đích, Integration gate coordinator-owned cuối story.

## SF-1 backend-e2e-stabilize
Tier: 0
linear: FI-367
What: Chạy LẦN ĐẦU full-suite tổng (Java ×11 + FE 36 + pytest + E2E không-keys) → bug register living-doc → fix toàn bộ backend/platform/E2E: FI-337 residual (vite proxy Set-Cookie), RBAC inventory+catalog admin prefixes, AdminCouponController (amendment A2), GATEWAY_URL single-source 13 files, seed V12/UPSERT + stock repair, dev-stack TTL+guard → re-run xanh. demo: `make dev` sạch 1 session, full suite xanh, customer JWT bị chặn admin inventory.
Depends on: —
Tasks: suite-runner-scripts / run-batch-java-fe-pytest-register / preflight-devstack-seed-ttl-guard / e2e-inventory-pending-skips / walkthrough-storefront-diff / walkthrough-shell-admin-diff / audit-sweep-theme-a11y-i18n-secrets-rbac / fi337-vite-proxy-setcookie-fix / rbac-gateway-inventory-catalog-prefixes / admin-coupon-controller-amendment-a2 / gateway-url-single-source-13files / seed-v12-stock-repair-checksum / stripe-rerun-per-inventory / security-resweep-improvements-log

## SF-2 frontend-polish-theme
Tier: 0
linear: FI-368
What: Frontend polish toàn hệ thống so design direction A "Chợ Sôi Động" — tokens diff §1, dark mode contrast, storefront header/home/PLP/PDP §2.1-2.5, AdminApp shell/KPI/tables §2.6, behavior hover/focus/Price VND, i18n keys thiếu, UX guards (confirm deletes, numeric), responsive ≤900px — theo bug register SF-1 relay. KHÔNG chạy fullstack (consumer stack SF-1); KHÔNG chạy E2E (SF-1 own). demo: walkthrough 5 màn pass vs direction, dark contrast pass, i18n key missing = 0.
Depends on: —
Tasks: tokens-diff-direction-a / dark-mode-contrast-polish / storefront-header-home-diff / product-card-plp-pdp-diff / adminapp-shell-kpi-tables-pill / behavior-hover-focus-price-vnd / i18n-admin-keys-orderdetail-uset-scan / ux-guards-confirm-numeric-empty / responsive-900px-header-sidebar / fe-unit-tests-fix-token-regression / browser-walkthrough-day1-rig-screenshots
Notes: consumer stack SF-1 (E4) · KHÔNG đụng AdminApp.vue-style files của SF-1 (2 vite configs Set-Cookie + e2e thuộc SF-1) · pnpm-lock: cấm thêm dep không note coordinator
