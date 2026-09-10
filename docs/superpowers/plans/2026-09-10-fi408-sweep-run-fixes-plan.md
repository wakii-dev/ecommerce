# Plan — SF-4 sweep-run-fixes (FI-408, story FI-404)

> Base: `story/fi404-qa-sweep` @21685ff · Worktree: `wakii-dev/sf-4-sweep-run-fixes` · Linear: FI-408
> Spec: epic `docs/superpowers/specs/2026-09-10-qa-sweep-design.md` · Context pack: `docs/superpowers/contexts/fi404-sf-4.md`
> Mục tiêu: chạy sweep thật (static audit + s2s/rbac triage + fresh-boot) → triage findings → fix pattern-đã-biết (5 lớp) → re-run tới green → bug-register chốt + merge + demo restore.
> **Plan-critic round 1: FIX-P0-FIRST — đã apply 4 P0 + P1/P2 (2026-09-10).** Thay đổi chính: QA-F2-02 thêm vào triage; fix known-blocker TRƯỚC run-1 (harness fail-closed tier-2 — SF-2 report cũng chỉ đạo vậy); batch-2 policy; live RBAC 50×3 + s2s live; tách T3a/T3b, T5 thành 4 sub-fix.
> Cap cứng: fresh-boot wipe-cycles ≤ 3 tổng (SF-2 dry-run 1 → SF-4 còn 2; run đang chạy trước-critic die tier-2 được tính riêng + ghi bug-register). Cap ĐẾM WIPE-CYCLES — seed/journey/e2e retry trên env sống không tốn cap (logged). Sweep fix-loop ≤ 2 vòng. KHÔNG ship red.

## Triage policy (chốt trước khi chạy — chống drift khi execute)

- **Pattern đã biết → fix trong SF-4** (5 lớp: config-drift compose↔code · s2s auth · data lifecycle · UI surfacing · stale env). Mỗi fix: 1 commit reference bug-register ID + bằng chứng TRƯỚC/SAU (Rule 0).
- **Pattern lạ / backend sâu / contracts cần quyết kiến trúc → escalate**: comment epic FI-404 (batch, 1 ý/câu) + đánh dấu ESCALATED trong bug-register. KHÔNG tự fix.
- **Cơ chế "đã fix" per detector** (không sửa logic detector):
  - config-audit: fix compose thật → detector thôi bắn; finding machine-rule false-positive có justification → registry `scripts/qa/config-audit-fixed.json` (schema {id,evidence,date}).
  - s2s-auth-matrix: fix thật (code/config) TRƯỚC, rồi sync curated row trong CÙNG commit (curated matrix = dữ liệu đối chiếu tay của script — maintenance path thiết kế, không phải sửa logic detector).
  - contracts-freshness: SF-1 report ghi rõ "không tự sửa contracts (fix = SF-4)" → contract-sync doc-only (yaml khớp hiện trạng đã deploy) thuộc SF-4; STALE-SPEC không có controller thật → xử theo reality-check từng case; case blind-spot script (invoice Python) → ignore-list segment `generate` (surgical, không `invoice` toàn phần) + comment.
- **Spec cũ đỏ vì fix** → cập nhật spec cũ trong CÙNG fix commit + ghi bug-register.
- **Batch-2 policy (P0-3):** nếu run-1/2 còn finding: (a) fix chỉ khi verify được bằng targeted live re-probe trên env ĐANG SỐNG (service-level rebuild/restart, KHÔNG wipe) + honesty note trong bug-register "env patched post-wipe" (precedent SF-3 §2.4); (b) finding không verify được theo cách đó → ESCALATE user, KHÔNG ship red. KHÔNG có run-3.

## Bảng findings triaged (verify lại bằng run thật — ID detector-exact)

| Nhóm | IDs | Pattern? | Fix hướng |
|---|---|---|---|
| compose env thiếu | CFG-A-cart-service-RABBITMQ_HOST, CFG-A-identity-service-RABBITMQ_HOST (= QA-F2-01) | 1 ✅ | compose thêm `RABBITMQ_HOST: rabbitmq` (8 service khác đã có) |
| compose env thiếu | CFG-A-catalog-service-INVENTORY_BASE_URL, CFG-A-notification-service-NOTIFY_STOCK_ALERT_CATALOG_BASE_URL, CFG-A-ordering-service-AFFILIATE_BASE_URL | 1 ✅ | compose env trỏ service-name:port (pattern copy) |
| compose env thiếu | CFG-A-identity-service-IDENTITY_OAUTH_PUBLIC_BASE_URL | 1 ✅ FP | registry FIXED: browser-facing callback (OAuthProperties.java:21 — browser theo redirect; FI-400 one-origin :8080; providers tắt — không key) |
| ES health | QA-F2-02 (config-audit không thấy — sai property) | 1 ✅ | compose catalog: `SPRING_ELASTICSEARCH_URIS: http://elasticsearch:9200` (indicator đọc spring.elasticsearch.uris) |
| volume mounts | CFG-B-affiliate-service-jwt-public.pem | 1 ✅ | compose affiliate: env JWT_PUBLIC_KEY_PATH=/keys/jwt-public.pem + volume ./infra/keys:/keys:ro |
| volume mounts | CFG-B-invoice-service-DejaVuSans.ttf | 1 ✅ FP | registry FIXED: font CÓ trong image (Dockerfile apt fonts-dejavu-core; evidence docker exec ls) — detector không thấy image-layer |
| healthcheck | CFG-C-*-healthcheck ×11 JVM | 1 ✅ | compose healthcheck `curl -sf localhost:PORT/actuator/health` (curl/wget có sẵn trong temurin-21-jre — probe live xác nhận; KHÔNG đụng Dockerfile); ports: gateway 8080 · identity 8081 · catalog 8082 · cart 8083 · inventory 8084 · ordering 8085 · payment 8086 · notification 8087 · log 8088 · partner 8091 · affiliate 8092 |
| s2s | S2S-01 ordering/HttpCatalogPricingClient → admin by-id | 2 ✅ | runtime ĐÃ OK qua compose ORDERING_PRICING_BYIDPATH (FI-397 @5a1b068; static stale) → fix default: application.yml + @Value default → path public; update comment FI-310 stale cùng commit; sync curated row (path mới + note) |
| s2s | S2S-02 partner/CatalogClient → admin by-id | 2 ✅ | PIN public by-id (token dead-end — JWT 15'): CatalogClient.productById → `/api/catalog/products/by-id/{id}` public (PUBLISHED-only — đúng semantics partner), bỏ adminToken branch + guard; update CatalogClientTest + PartnerProperties + yml; sync curated row. Behavior change: UUID-lookup sống lại + draft 404 — ghi bug-register |
| runtime seed | QA-F2-03: 0 ảnh MinIO + PUT 400 images[].url | 3 ✅ | seed.sh: generate PNG gradient-per-category (python3 zlib) → upload QUA API THẬT `POST /api/catalog/admin/uploads` (jpg/png/webp — SVG bị từ chối) → UPDATE product_images.url WHERE url='' (idempotent; SeedDataRunner không re-insert product đã có) |
| daemon wedge | QA-F2-04 | 5 (runbook) | KHÔNG fix code — runbook SF-2; gặp thì làm theo (batch-up + RESUME=BUILD) |
| coupon edit | SF-3 §4: PUT /admin/coupons/{code} 400 `code` | ✅ | BE merge: adminUpdate validate PATH code (authority) + cross-check body nếu có; bỏ test.fixme SF-3 cùng vòng |
| contracts | CT-01..19, 22, 24 STALE-CTRL | ✅ doc-sync | thêm op vào yaml đúng shape hiện trạng (theo module: affiliate 6 · catalog 6 · identity 5 · inventory 2 · ordering 1 · payment 1) |
| contracts | CT-20/21 notification STALE-SPEC | ✅ | reality-check: notification-service 0 controller (event-driven + SMTP) → bỏ 2 op chết + schema mồ côi khỏi yaml, sửa description |
| contracts | CT-23 invoice STALE-SPEC | ✅ blind-spot | ignore-list segment `generate` + comment (Python ngoài backend/; runtime cover bởi s2s row HttpInvoiceProvider) |

## Tasks (11 meta-steps — tick khi xong) — RE-SEQUENCED theo plan-critic

- [x] **T1. run-static-audit-triage** — `make qa-audit` → exit-table 1/1/0/1 tái hiện; triage từng finding theo bảng (verify code xong). Evidence: output make + bảng trên.
- [x] **T2. run-s2s-matrix-triage** — S2S-01/02 root-caused: S2S-01 static-stale (ORDERING_PRICING_BYIDPATH @5a1b068 — probe 401 admin vs 200 public + env container); S2S-02 dead-end token → pin public by-id.
- [x] **T3a. run-rbac-matrix-triage (static)** — rbac exit 0, 0 GAP, 50 endpoint × 3 EXPECTED — đối chiếu live ở T3b.
- [ ] **T3b. RBAC live matrix 50×3 + s2s live** — SAU run-1: script /tmp probe 50 endpoint × guest/user/admin (150 calls) trên env fresh → từng cell verdict ghi bug-register; s2s live: re-price qua checkout journey (data-lifecycle) + partner UUID-lookup open-api call.
- [ ] **T4. fresh-boot-run-1-findings** — SAU fix-batch-0 (known-blockers: compose batch + seed images + coupon + s2s — đều pattern-đã-biết bàn giao SF-2/3, không phải sweep-loop): demo-idle check → down → `QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot` → probes + journeys. Run trước-critic (die tier-2 = BEFORE evidence QA-F2-01/02 tái hiện) ghi bug-register. Evidence: log copy vào docs/superpowers/qa/ (T10 — /tmp bị macOS dọn).
- [ ] **T5. fix-tasks-batch-1** (4 sub-fix, commit + review riêng): (1) compose+registry [inline coordinator] — ✅ @5e3bf81 reviewer APPROVED; (2) seed images [task-executor] — ✅ code xong reviewer pending; (3) s2s+coupon BE [task-executor] — ✅ code xong, P0 saga-stub đã fix, re-verdict pending; (4) contracts doc-sync [task-executor] — ✅ code xong (exit 0, 24→0), reviewer pending.
- [ ] **T6. fresh-boot-run-2-green** — SKIP nếu run-1 green + batch-1 rỗng. Nếu chạy: green = `make qa-audit` exit 0 + harness green + journeys 13/13 + report-sf1.md regen commit.
- [ ] **T7. fix-tasks-batch-2-cap** — theo Batch-2 policy ở trên (live re-probe + honesty note, hoặc escalate).
- [ ] **T8. journey-specs-green-final** — batch-2 rỗng: cite kết quả journeys của run-1 (KHÔNG chạy lại — suite tự tiêu stock + bẩn data); batch-2 có fix: re-run trên env patched.
- [ ] **T9. legacy-e2e-regression-run-15-specs** — full `pnpm e2e` 15 cũ + 2 mới, serial, trên env fresh sau batch cuối (env run-1 nếu batch rỗng). Retry trên env sống không tốn wipe-cap.
- [ ] **T10. bug-register-finalize-epic-comment** — merge reports + bảng lớp→detector→finding→fix→re-run (ID detector-exact) + escalate list + coverage note (RBAC live matrix + s2s live) + evidence appendix (log copy từ /tmp).
- [ ] **T11. demo-restore-seed-signoff** — demo :8080 seeded-green: smoke login + cart + admin + PDP ảnh load (free-ride verify QA-F2-03) — browser thật.
- [x] **T0. Epic decision-record (P1 paper-trail)** — comment FI-404 trước khi fix: 4 exception được duyệt context (registry entries · curated-row sync · ignore-list `generate` · contracts doc-sync) + re-sequence fix-trước-run-1 + run-before-critic accounting.

## Sau khi 11 tasks xong (COMPLETE-RUN checklist 3→5)

- [ ] **M12. Merge** — merge dest vào sf-branch trước (no-ff guard) → merge sf-branch vào `story/fi404-qa-sweep` no-ff + update-ref FULL + ancestor guards — **qua temp worktree** (memory: git -C main-checkout merge rơi vào master) + guard `git diff --exit-code pnpm-lock.yaml` → comment merge-hash lên FI-408 (+ bug-register merge).
- [ ] **M13. Gate cứng** — `ORCA_BIN=/usr/local/bin/orca ~/.claude/bin/story-verify sf-4` — sạch mới qua M14.
- [ ] **M14. Done** — verifier + security-audit verdict → set FI-408 Done.

## Acceptance (từ context pack — verifier check từng dòng)

1. Sweep report: static audit exit 0 (0 UNFIXED) + s2s/RBAC matrix mọi cell có verdict khớp live (T3b).
2. Fresh-boot ×2 + journeys: admin-journey + data-lifecycle XANH cả 2 vòng (evidence log in-repo).
3. Fixes: mỗi finding có commit + bằng chứng trước/sau; không finding nào bị bỏ im lặng (FIXED/ESCALATED trong bug-register).
4. Sau sweep: demo :8080 seeded-green (login + cart + admin smoke pass).
5. bug-register.md chốt trên repo + epic comment tổng.

## Loop caps + rollback

- Mỗi task retry ≤ 3; verify-fail cùng root-cause ≤ 2 → STOP escalate. Sweep fix-loop ≤ 2 vòng (batch-0 known-blockers không tính — bàn giao SF-2/3).
- Fix diverge → rollback-fixer revert commit đó (prefer `git revert`).
- Fresh-boot wipe-cap: run-1 + run-2 (run-before-critic đã rơi, ghi riêng). Daemon wedge → runbook batch-up + RESUME=BUILD (resume không wipe).
