# Story: FI-369 — Phase 7 — No-Fallback & Feature-Complete (post-GA v1.1)

Destination: story/fi369-nofallback-complete

Epic spec: docs/superpowers/specs/2026-09-07-nofallback-feature-complete-design.md
Base: master `9ac645b`+ (GA v1.1 + QA v1.1 spec) — 3 SF theo launch order CHỐT: T0 SF-1 ∥ SF-2 song song + SF-3 T1-T9; T1 = SF-3 T10-T11 (sau SF-2 merge + SF-1 keys).

## SF-1 stripe-live-e2e
Tier: 0
linear: FI-370
What: Stripe test account tự tạo qua Orca browser (hybrid N3 — automation ~70% + escape hatch user) → keys LIVE trong `.env` → E2E golden path chạy FULL THẬT lần đầu (un-skip, CONFIRMED + email + declined). demo: E2E 4242 PASS thật + webhook PAID + declined FAILED.
Depends on: —
Tasks: probe-webhook-flow-stripe-cli / stripe-signup-orca-browser-escape-hatch / env-3-biens-contract / makefile-stripe-listen-reuse-compose / golden-path-full-assert-hasstripe-hard / saga-fail-platform-commission-pass / regression-nokeys-fail-loud / evidence-screenshot-docs-verified-stripe / webhook-local-runbook-readme / gate-slice-payment-it-e2e-green

## SF-2 coupon-crud-a3
Tier: 0
linear: FI-371
What: Admin coupon CRUD qua UI thật (xoá read-only note) — BASELINE: AdminCouponController đã tồn tại (FI-366 SF-1 T11, commit 89adcd9: create/update/DELETE, AdminCouponDto 10 trường) → SF-2 = RECONCILE + BỔ SUNG GET list + toggle + FE form. demo: admin tạo coupon → dùng checkout → usedCount tăng → toggle off → validate fail.
Depends on: —
Tasks: gap-a3-proposal-baseline-shape / probe-gateway-reservation-policy / be-reconcile-controller-getlist-toggle / be-couponservice-deactivate-policy / be-it-contract-shape-toggle / fe-couponspage-form-crud / fe-types-regen-unit-test / e2e-admin-coupon-nokeys-reserved / seed-parity-list / gate-slice-java-fe-e2e-green

## SF-3 honesty-pass
Tier: 1
linear: FI-372
What: Honesty pass — xoá mọi fallback-nói-dối + dead link: header mini-nav probe slug, footer trim về routes thật, home "Xem thêm" + CategoryTiles route thật, AddToCart toastFail lỗi thật, xoá dead i18n reviewsSoon, tách orderRules + purge createStubApi + rename Stub* types, shell /ui-kit env gate, degraded-by-design registry ADR, grep sweep cuối zero. demo: mọi link điều hướng thật, zero dead link (Playwright nav asserts), registry ADR hoàn chỉnh.
Depends on: SF-1, SF-2
Tasks: header-mini-nav-probe-slug / categorytiles-home-route-that / footer-trim-routes-that / addtocart-toastfail-loi-that / xoa-dead-i18n-reviewssoon / tach-orderrules-purge-createstubapi / rename-stub-types-5-pages / shell-uikit-env-gate / degraded-by-design-registry-adr / grep-sweep-cuoi-whitelist-report / playwright-nav-asserts-binary
