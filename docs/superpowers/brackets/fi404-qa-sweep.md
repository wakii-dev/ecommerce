# Story: FI-404 — QA Sweep — săn 5 lớp lỗi tích hợp toàn website + admin

Destination: story/fi404-qa-sweep

## Merge sequence + precondition (coordinator-owned)
Fork từ master (đã chứa FI-390 + FI-397 + demo fixes @846648d+). Merge TUẦN TỰ SF-1 → SF-2 → SF-3 → SF-4 vào `story/fi404-qa-sweep`; smoke sau mỗi merge; SF-3 chỉ start sau SF-2 merge (SF-1 merge transitive qua chuỗi — worker không cần hỏi); SF-4 sau SF-3 merge. **Fresh-boot gate (P0):** consent user lấy 1 LẦN ở story level (bracket này là record) — coordinator set `QA_FRESH_BOOT_CONFIRM=1` cho MỖI harness invoke + harness tự demo-idle check; KHÔNG chạy fresh-boot khi demo đang dùng; KHÔNG có flag `--force` vượt idle-check. Build CẤM khi stack up. e2e không dùng port base FI-390/397 (+0..+400) — harness tự quản :8080. **Makefile:** 2 SF cùng append — SF-1 thêm `qa-audit` CUỐI file, SF-2 đặt `qa-fresh-boot` CẠNH block `seed` (dòng ~105) — khác vùng tránh conflict; README QA section SF-2 viết, SF-1 chỉ tham chiếu.

## SF-1 qa-static-audit
Tier: 0
linear:
Design: none
What: 2 script non-destructive <5 phút chạy được mọi lúc: (1) config-audit 3 TRỤC — env var code đọc (application.yml + @Value + gateway-routes defaults) ↔ compose env; volume mounts drift (service đọc file ↔ compose volumes — pattern JWT keys); compose value/settings drift (command flags — pattern max_connections=100→300). Classify machine-checkable: container = có compose entry; DANGEROUS = default localhost|127.0.0.1 + compose entry + compose không set; whitelist FE-host. Exit semantics: 0 = 0 finding CHƯA fix; 1 = có finding chưa fix; 2 = script error. (2) s2s-auth-matrix STATIC expected-verdict (23 client pairs — path/token/role, KHÔNG HTTP call) + RBAC expected matrix guest/user/admin × admin endpoints (products/categories/coupons/inventory-admin/log-admin/partner/RMA — đóng). Report per-SF file docs/superpowers/qa/report-sf1.md (bug-register.md do SF-4 sở hữu). Demo: make qa-audit chạy + report chỉ ra finding thật (fixture thiếu env → DANGEROUS bắt được — KHÔNG tạm revert compose thật).
Depends on: —
Tasks: config-audit-extract-env-from-code / config-audit-volume-mounts-drift / config-audit-compose-value-drift-maxconnections / config-audit-classify-rule-machine-checkable / config-audit-exit-code-report-md-sf1 / s2s-inventory-enumerate-23-clients / s2s-expected-verdict-matrix-static / rbac-expected-matrix-guest-user-admin-endpoints-closed-list / config-audit-self-test-fixture-negative / makefile-target-qa-audit-append-end-file / probe-contracts-freshness-openapi-vs-code-report-sf1

## SF-2 fresh-boot-harness
Tier: 0
linear:
Design: none
What: scripts/qa/fresh-boot-harness.sh — SAFE sequence: gate kép (QA_FRESH_BOOT_CONFIRM=1 do coordinator set sau consent user 1 lần ở story level + demo-idle check port-owner :8080/3000/5173 + disk/RAM check — KHÔNG có --force vượt idle); pg_dump backup 9 DB vào backups/ (+ .gitignore) + RESTORE-TEST vào DB throwaway (createdb → restore → sanity query → drop — gunzip không đủ); compose down -v; build TẤT CẢ images KHI STACK TẮT (daemon wedge ×3); up + health gates theo tầng (infra → JVMs → FE) timeout rõ; make seed; probes: ảnh MinIO + login admin/user + 1 add-to-cart + 1 events API + live RBAC spot-check HARDCODED độc lập SF-1 (guest→admin-write→401/403; admin→product-PUT→2xx) + port-owner check stale-env; Makefile target qa-fresh-boot đặt CẠNH block seed + runbook restore-từ-backup; log timestamp từng stage; build dài → run_in_background + poll log. Demo: dry-run 1 lần toàn bộ + đo thời gian stage.
Depends on: —
Tasks: harness-skeleton-stages-timestamps / safety-gate-confirm-disk-ram-demo-idle / pg-dump-backup-restore-test-throwaway-db / stage-down-v / stage-build-serialized-stack-down / stage-up-health-gates-tiers / stage-seed / stage-probes-image-login-cart-events-live-rbac-hardcoded / stage-port-owner-check-stale-env / makefile-target-qa-fresh-boot-runbook-restore-gitignore-backups / dry-run-1-lần-đo-thời-gian-report-sf2

## SF-3 journey-specs
Tier: 1
linear:
Design: none
What: 2 spec Playwright mới theo pattern hiện có: admin-journey.spec.ts (login admin → product CRUD ĐẦY ĐỦ field name/desc/SEO/price/compare/flash/tags/images/variants+stock round-trip assert — không còn field không-lưu; coupon CRUD round-trip; category CRUD) + data-lifecycle.spec.ts (guest add variant-less product → login merge → checkout pass — CartService.java:127 guard + seed default variant; asserts surfacing: admin form stock = inventory quantity thật, PDP không "Đã bán" từ ratingCount, giá = base + priceDelta; fresh-state: SW cache version + bundle hash — harness ghi build-stamp sau build làm baseline + port-owner là detector chính SF-2). data-testid theo ADR; token re-login helper mỗi section (JWT 15'). Evidence run: RIDE trên env fresh-boot dry-run SF-2 để lại (coordinator giữ env sống tới SF-3 capture xong); env chết mới được invoke riêng với flag coordinator-set + amend cap thành 4. Demo: cả 2 spec green trên fresh-boot env.
Depends on: SF-2
Tasks: spec-admin-journey-skeleton-login-helper / admin-product-crud-full-fields-roundtrip / admin-product-variant-stock-roundtrip / admin-coupon-crud-roundtrip / admin-category-crud-roundtrip / spec-data-lifecycle-guest-variantless-checkout / spec-data-lifecycle-stale-cart-merge / spec-surfacing-asserts-real-numbers / run-on-fresh-boot-green

## SF-4 sweep-run-fixes
Tier: 2
linear:
Design: none
What: CHẠY sweep thật trên master: qa-audit → findings; s2s + rbac matrix triage; fresh-boot run-1 (coordinator set confirm flag) → journeys → findings. Triage: finding pattern đã biết (5 lớp) → fix trong SF-4; lạ/backend sâu → escalate user qua epic comment. fix-tasks-batch-1 → fresh-boot-run-2 green (SKIP nếu run-1 green và batch-1 rỗng — vô ích wipe) → batch-2 cap 2 vòng — hết cap escalate, KHÔNG ship red. legacy-e2e-regression-run: full `pnpm e2e` 15 specs cũ + 2 mới, serial, trên env fresh sau batch cuối (owner success §5.6). bug-register.md do SF-4 sở hữu + merge report SF-1/2/3; chốt + epic comment. Sau sweep: demo-restore (seed) + sign-off.
Depends on: SF-1, SF-2, SF-3
Tasks: run-static-audit-triage / run-s2s-matrix-triage / run-rbac-matrix-triage / fresh-boot-run-1-findings / fix-tasks-batch-1 / fresh-boot-run-2-green / fix-tasks-batch-2-cap / journey-specs-green-final / legacy-e2e-regression-run-15-specs / bug-register-finalize-epic-comment / demo-restore-seed-signoff
