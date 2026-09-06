# Story: FI-310 — Ecommerce Platform — microservices + micro frontends (storefront + admin)

Destination: story/fi310-ecommerce-platform

Epic spec: docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md
Context packs: docs/superpowers/contexts/sf-<n>.md (mỗi SF đọc pack TRƯỚC khi code)

## SF-1 platform-foundation
Tier: 0
linear: FI-311
What: Nền móng chạy được — `docker compose up -d`healthy (PG 5 DB, Redis, RabbitMQ, Mailpit, stripe-cli) + `make dev svc=<tên>` boot được service từ template + gateway route smoke 200 với request-id + frontend pnpm/turbo workspace build xanh. demo: hệ khung sống, chưa có business.
Depends on: —
Tasks: monorepo-scaffold-makefile-readme-env / pnpm-turbo-frontend-workspace / maven-multimodule-parent-springboot3-java21 / compose-infra-stack-pg5db-redis-rabbitmq-mailpit-mongo-stripecli / service-template-module-health-actuator-dockerfile / template-springdoc-flyway-conventions / template-testcontainers-it-harness / gateway-skeleton-route-table-cors / gateway-requestid-filter / common-lib-event-envelope-outbox-base-error-model / contracts-dir-skeleton-openapi-lint / makefile-dev-targets-per-service / compose-healthchecks-wiring

## SF-2 contracts-design-foundation
Tier: 1
linear: FI-312
Design: mock-prototype
What: Contract-first foundation — 7 OpenAPI specs + JSON Schema events ĐÓNG BĂNG (§6.1 spec), TS clients generated, packages/auth + ui-kit v1 + i18n vi/en, federation harness chứng minh shell nạp 1 skeleton remote với shared singletons 1 instance. Designer 3 hướng Tiki-inspired → USER CHỌN (gate riêng, không chặn freeze) → hand-off docs/superpowers/designs/. demo: shell load được remote, specs lint xanh, UI kit demo page.
Depends on: SF-1
Tasks: openapi-identity-spec / openapi-catalog-spec / openapi-cart-spec / openapi-ordering-spec-statemachine-adminstats / openapi-inventory-spec / openapi-payment-spec / openapi-notification-spec / events-jsonschema-fat-payloads / ts-codegen-packages-contracts / packages-auth-rs256-refresh-rolesingleton / ui-kit-v1-tokens-primitives-2themes / i18n-vi-en / federation-harness-shell-skeleton-remote / designer-mockup-3huong-user-gate

## SF-3 identity + account
Tier: 2
linear: FI-313
Design: none
What: Đăng ký/đăng nhập được end-to-end — user tạo account, login nhận JWT RS256, refresh giữ phiên, header shell hiện auth state + account menu; /api/admin/** chặn customer 403 server-side. demo: register → login → thấy tên trên header → vào admin API bị chặn.
Depends on: SF-2
Tasks: identity-service-scaffold / flyway-users-roles-refreshtokens / register-api-validation / login-jwt-rs256-issue / refresh-rotation-cookie / rbac-preauthorize-roles / seed-admin-user / gateway-auth-wiring-admin-guard / mfe-account-remote-registration / login-register-pages / profile-page / shell-header-auth-state / identity-it-tests

## SF-4 catalog + browse
Tier: 2
linear: FI-314
Design: none
What: Khách duyệt được catalog Tiki-style — home (hero + flash deal countdown + featured), PLP (sidebar danh mục + filter giá/rating + sort + pagination), search FTS, PDP (gallery + variant + tồn kho + add-to-cart stub theo cart contract), seed ~24 sản phẩm Tiki-categories. demo: guest search "tên sản phẩm" → ra kết quả → vào PDP → đổi variant đổi giá.
Depends on: SF-2
Tasks: catalog-service-scaffold / flyway-products-categories-variants / product-category-apis / search-fts-unaccent-suggest / filters-sort-pagination / redis-cache-invalidate-productchanged / product-fields-compareprice-flash-rating / seed-data-tiki-categories / outbox-product-changed / mfe-storefront-remote-registration / home-tiki-hero-flashdeal-featured / plp-sidebar-filter-grid-card / pdp-gallery-variant-addtocart-stub / storefront-it-tests

## SF-5 inventory + payment services
Tier: 2
linear: FI-315
Design: none
What: Hai service nền cho saga — inventory giữ stock theo variant với reservation TTL 30' (POST /reservations all-or-nothing, commit/release qua events), payment-service chạy Stripe test thật (intent/void/refund/webhook verify, adapter SPI). demo: reserve đủ stock → OK, vượt stock → 409; tạo Stripe intent thật từ test key.
Depends on: SF-2
Tasks: inventory-service-scaffold / flyway-stocks-reservations-variantlevel / reservation-api-all-or-nothing / reservation-ttl-scheduler-release / commit-release-event-consumers / lowstock-admin-endpoint / inventory-outbox-events / payment-service-scaffold / stripe-adapter-intent-webhook-verify / adapter-spi-void-refund / payment-idempotency-outbox / degraded-mode-no-apikey / services-it-tests

## SF-6 cart + checkout UX
Tier: 3
linear: FI-316
Design: none
What: Giỏ hàng + checkout UX đầy đủ — guest cart (cart_token cookie), merge-on-login, cart page, checkout steps (địa chỉ/vận chuyển flat/coupon UI/review), Stripe.js confirm với payment thật (SF-5), confirmation page, cart badge trên shell header. Chạy trên ordering CONTRACT STUBS (mock local). demo: guest thêm hàng → đăng nhập → cart merge → đi hết checkout → trang confirmation (mock).
Depends on: SF-3, SF-4, SF-5
Tasks: cart-service-scaffold / redis-cart-guesttoken-user / cart-crud-apis / merge-on-login-endpoint / removed-product-filter / mfe-checkout-remote-registration / cart-page-ui / checkout-steps-address-shipping-review / coupon-apply-ui-contract-stub / stripejs-confirm-flow-real-payment / order-create-post-contract-stub / confirmation-page / shell-cart-badge-wire / checkout-it-tests

## SF-7 admin MFE
Tier: 3
linear: FI-317
Design: none
What: Admin quản trị được — /admin với RBAC guard UI, products/categories CRUD LIVE (tạo product thấy ngay trên storefront), coupons CRUD + reviews moderation queue + orders list/detail + revenue stats theo CONTRACT MOCKS, dashboard KPI + charts (low-stock live). demo: admin login → tạo product → mở storefront thấy product mới; dashboard vẽ được biểu đồ.
Depends on: SF-3, SF-4, SF-5
Tasks: mfe-admin-remote-registration-layout / rbac-route-guards-ui / products-list-table-live / product-form-variants-images-flashfields / categories-crud-ui-tree / coupons-crud-ui-mock / reviews-moderation-queue-mock / orders-list-detail-mock / dashboard-kpi-charts-revenue-top-lowstock / admin-theme-polish / admin-it-tests

## SF-8 reviews + wishlist
Tier: 3
linear: FI-318
Design: none
What: Review + wishlist hoạt động — mọi user đăng nhập viết được review (vào PENDING moderation), admin approve qua API → hiện PDP với badge "Mua đã xác nhận" (verified-purchase qua order.confirmed synthetic harness — KHÔNG cần ordering thật), rating_avg trên card cập nhật; wishlist heart trên PDP/PLP + trang wishlist + my-reviews trong mfe-account. demo: viết review → approve → thấy trên PDP với badge verified.
Depends on: SF-3, SF-4
Tasks: flyway-reviews-wishlist-tables / reviews-apis-submit-moderation-states / verified-purchase-orderconfirmed-consumer / rating-aggregate-denormalized-update / synthetic-event-harness-testcontainers / pdp-reviews-section-verified-badge / write-review-modal-flow / wishlist-apis-peruser / wishlist-heart-pdp-plp / wishlist-page-mfe-account-slice / my-reviews-page-mfe-account-slice / reviews-wishlist-it-tests

## SF-9 ordering saga + coupons
Tier: 3
linear: FI-319
Design: none
What: Checkout saga chạy thật (backend) — POST /orders: re-price catalog → reserve coupon nguyên tử → reserve inventory all-or-nothing → Stripe intent → trả clientSecret; webhook → PAID → CONFIRMED → order.confirmed fat payload; 4 compensation edges + late-payment refund + TTL cancel, fail-injection tests xanh; my-orders APIs + trang my-orders trong mfe-account. demo (API level): đặt đơn → webhook succeeded → đơn CONFIRMED; card declined → FAILED + stock được release.
Depends on: SF-5
Tasks: ordering-service-scaffold / flyway-orders-items-coupons-sagastate / coupon-crud-validate-apis / coupon-usage-reserve-finalize-release / checkout-saga-orchestrator-reprice-reserve-intent / payment-event-consumers-late-refund / reservation-commit-consumers / compensation-edges-fail-injection-tests / outbox-relay-polling / order-state-machine-guards / ttl-scheduler-cancel / my-orders-apis / my-orders-ui-mfe-account-slice / ordering-it-tests

## SF-10 convergence + ship
Tier: 4
linear: FI-320
Design: none
What: Toàn hệ thống sống như một — mfe-checkout wire ordering THẬT (bỏ mocks), notification-service gửi email Mailpit, gateway full route table + đủ 5 remotes mounted, profile `full` compose chạy toàn bộ containerized, deterministic seed (coupon WELCOME10, sản phẩm search được, Stripe test cards), Playwright E2E: golden path + admin CRUD → storefront + review flow + saga fail. demo: 1 lệnh chạy cả hệ, mua hàng end-to-end thấy email, admin thấy đơn.
Depends on: SF-6, SF-7, SF-8, SF-9
Tasks: checkout-live-wiring-real-ordering / notification-service-mailpit-emails / log-service-mongo-scaffold / events-fanin-consumer-mongo-eventlog / gateway-full-routetable-final-mounts / make-dev-fullstack-compose-profile-full / deterministic-seed-coupons-products-stripecards / e2e-golden-path / e2e-admin-crud-storefront-assert / e2e-review-flow / e2e-saga-fail-declined / sanity-checks-standalone-rbac-perf-security / docs-demo-readme-adr
