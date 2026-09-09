# QA Sweep — Spec (epic)

> Story: FI-404 — Test toàn bộ website + admin: săn các lớp lỗi tích hợp (theo 5 lớp bug thật 9/9) · Ngày: 2026-09-10
> Quyết định user: **(a)** sweep tìm ra bug → fix ngay trong story (cap theo pattern); **fresh-boot harness on-demand** + backup `pg_dump` tự động + gate hỏi trước khi wipe.
> P0 verdict: **(iii) hybrid phân tầng** — tầng rẻ (static audit + matrix, chạy mọi lúc) + tầng nặng (fresh-boot runtime, on-demand gated).
> Precondition: demo stack :8080 ĐANG CHẠY — mọi thao tác destructive phải qua gate backup.

---

## 0. IDEA-BRIEF

- **Task**: sweep hệ thống theo 5 lớp lỗi đã biết (không test-random), phát hiện + fix bug cùng lớp.
- **5 lớp lỗi chuẩn (bug register 9/9 — mỗi lớp ≥1 detector, detector phải PHỦ đúng các bug đã nổ):**
  1. **Config drift compose↔code — 3 trục (P0: env var alone là không đủ):** (a) env var code đọc (`application.yml`, `@Value` defaults, gateway-routes defaults) mà compose thiếu; (b) **volume mounts drift** (service đọc file/path nào ↔ compose volumes — pattern JWT keys); (c) **compose value/settings drift** (command flags, healthcheck, resource — pattern max_connections=100→300). Classify nguy hiểm = "default `localhost|127.0.0.1` + consumer có compose entry + compose (mọi file dùng) không set" — machine-checkable, whitelist FE-host.
  2. **S2S auth gap**: mọi HTTP call service→service — path gọi có vượt quyền (ordering gọi path admin) / thiếu token / permitAll sai (ordering→catalog 401→502).
  3. **Data lifecycle**: data cũ/hỏng kẹt flow (variant-less product — checkout pass với default variant theo fix `CartService.java:127` guard + seed default variant; cart row variantId null; fresh volume lộ bug seed).
  4. **UI surfacing sai dữ liệu**: enumerate asserts — admin form stock hiển thị = inventory quantity thật; PDP không hiển thị "Đã bán" từ ratingCount (fix FI-390); giá variant = base + priceDelta.
  5. **Stale environment — detector đặt tên:** (a) harness stage-up kiểm port-owner (3000/5173/5175-78/9099 không có process lạ); (b) journey fresh-state assert: SW cache version + bundle hash đổi sau rebuild; (c) daemon health gate trước build (RAM/disk).
- **Output**: script audit + matrix + fresh-boot harness + 2 journey specs + bug-register + fixes.
- **Success**: xem §5.
- **Out-of-scope**: xem §6.

## 1. Kiến trúc — 4 SF, hybrid phân tầng

**Anti-duplicate phân định (chốt trước):** SF-1 sở hữu TẤT CẢ detector tĩnh (config-audit 3 trục + s2s expected-verdict matrix + RBAC expected matrix — KHÔNG HTTP call); SF-2 sở hữu harness runtime (backup/build/up/seed/probe — probe live RBAC + availability chạy ở stage 6); SF-3 sở hữu journey specs; SF-4 CHỈ chạy + triage + fix + re-run + merge bug-register. Không SF nào làm việc của SF khác.

### SF-1 qa-static-audit (Tier 0)
**What**: 2 script chạy <5 phút, non-destructive, chạy được bất cứ lúc nào (kể cả đang demo): (1) config-audit **3 trục** — (a) env var code đọc (`application.yml`, `@Value` defaults, gateway-routes defaults) ↔ compose env; (b) volume mounts: file/path service đọc ↔ compose volumes; (c) compose value/settings drift (command flags như max_connections, healthcheck). Classify machine-checkable: container = có compose entry; DANGEROUS = default match `localhost|127.0.0.1` + consumer có compose entry + compose không set; whitelist FE-host (storefront/shell dev chạy host là chủ đích). Report markdown per-SF file; exit-code: **0 = 0 finding chưa fix; 1 = có finding chưa fix; 2 = script error** (finding FIXED không ảnh hưởng exit). (2) s2s-auth-matrix — enumerate mọi HTTP client service→service (ordering 6, cart 2, catalog 1, notification 3, partner 3...), **STATIC expected-verdict** (path gọi cần auth gì / token từ đâu / role đủ — KHÔNG HTTP call); kèm RBAC expected matrix guest/user/admin × admin endpoints (products, categories, coupons, inventory admin, log admin, partner, RMA — đóng, không "..."). Report file riêng `docs/superpowers/qa/report-sf1.md`; **bug-register.md do SF-4 sở hữu + merge** (SF-1/2 chỉ xuất report riêng — chống commit-race).
**Tasks (11)**: config-audit-extract-env-from-code / config-audit-volume-mounts-drift / config-audit-compose-value-drift-maxconnections / config-audit-classify-rule-machine-checkable / config-audit-exit-code-report-md-sf1 / s2s-inventory-enumerate-23-clients / s2s-expected-verdict-matrix-static / rbac-expected-matrix-guest-user-admin-endpoints-closed-list / makefile-target-qa-audit / report-sf1-file-registry / probe-contracts-freshness-openapi-vs-code.

### SF-2 fresh-boot-harness (Tier 0)
**What**: `scripts/qa/fresh-boot-harness.sh` — SAFE sequence: (0) gate kép: `QA_FRESH_BOOT_CONFIRM=1` (coordinator set — consent user lấy 1 LẦN ở story level, ghi bracket) + demo-idle check (port-owner :8080/3000/5173 + docker ps filter app nhẹ) + disk/RAM check; (1) `pg_dump` backup 9 DB vào `backups/` + **restore-test vào DB throwaway** (`createdb qa_restore_test` → restore → sanity query → drop — gunzip test KHÔNG đủ); (2) `compose --profile full down -v`; (3) build TẤT CẢ images KHI STACK ĐÃ TẮT (daemon wedge ×3); (4) up + health gates theo tầng (infra → JVMs → FE) với timeout; (5) `make seed`; (6) probes: ảnh MinIO load được + login admin/user + 1 add-to-cart + 1 events API + **live RBAC spot-check** (execute expected-matrix SF-1 trên env sống) + **port-owner check** (detector lớp 5); Makefile target `qa-fresh-boot`; appendix runbook restore-từ-backup (kịch bản sweep xong stack hỏng). Đo + log thời gian từng stage.
**Tasks (11)**: harness-skeleton-stages-timestamps / safety-gate-confirm-disk-ram-demo-idle / pg-dump-backup-restore-test-throwaway-db / stage-down-v / stage-build-serialized-stack-down / stage-up-health-gates-tiers / stage-seed / stage-probes-image-login-cart-events-live-rbac / stage-port-owner-check-stale-env / makefile-target-qa-fresh-boot-runbook-restore / dry-run-1-lần-đo-thời-gian-report-sf2.

### SF-3 journey-specs (Tier 1) — Depends on: SF-2
**What**: 2 spec Playwright mới theo pattern specs hiện có: (1) `admin-journey.spec.ts` — login admin → product CRUD đầy đủ field (name/desc/SEO/price/compare/flash/tags/images/variants+stock) → round-trip assert (chứng minh không còn field không-lưu); coupon CRUD round-trip; category CRUD; (2) `data-lifecycle.spec.ts` — guest add variant-less product → login (merge) → checkout pass (bắt lớp 3); asserts surfacing enumerate: admin form stock = inventory quantity thật; PDP không "Đã bán" từ ratingCount; giá hiển thị = base + priceDelta (lớp 4); fresh-state: SW cache version + bundle hash đổi sau rebuild + port-owner check (lớp 5). Dùng data-testid theo ADR; token re-login helper mỗi section (JWT 15').
**Tasks (9)**: spec-admin-journey-skeleton-login-helper / admin-product-crud-full-fields-roundtrip / admin-product-variant-stock-roundtrip / admin-coupon-crud-roundtrip / admin-category-crud-roundtrip / spec-data-lifecycle-guest-variantless-checkout / spec-data-lifecycle-stale-cart-merge / spec-surfacing-asserts-real-numbers / run-on-fresh-boot-green.

### SF-4 sweep-run-fixes (Tier 2) — Depends on: SF-1, SF-2, SF-3
**What**: CHẠY sweep thật: qa-audit (tầng rẻ) → findings; fresh-boot harness (on-demand, user-gate) → journeys → findings. Triage: mỗi finding sinh fix task — pattern đã biết (5 lớp) → fix trong SF-4; pattern lạ/đụng backend sâu → report + escalate user. Re-run tới xanh (cap 2 vòng). Bug-register chốt + đính epic.
**Tasks (10)**: run-static-audit-triage / run-s2s-matrix-triage / run-rbac-matrix-triage / fresh-boot-run-1-findings / fix-tasks-batch-1 / fresh-boot-run-2-green / fix-tasks-batch-2-cap / journey-specs-green-final / bug-register-finalize-epic-comment / demo-restore-seed-signoff.

**Tier map**: SF-1 (0) ∥ SF-2 (0) → SF-3 (1, dep SF-2) → SF-4 (2, dep SF-1+SF-2+SF-3). Dev-port: SF-3 chạy journey trên fresh-boot env do SF-2 quản lý — KHÔNG dùng port base FI-390/FI-397 (+0..+400) — harness tự quản :8080 origin duy nhất.

## 2. Second-order — ràng buộc cứng

1. **Destructive gate**: `down -v` xóa pgdata/redis/mongo/minio — bắt buộc: pg_dump backup trước + confirm flag (`QA_FRESH_BOOT_CONFIRM=1`) + không chạy khi demo đang dùng (hỏi user hoặc giờ hẹn).
2. **Build serialized**: CẤM build khi stack up (daemon wedge ×3 đêm 9/9) — harness tuần tự: stop → build → up; kiểm `docker system df` + RAM trước.
3. **Seed idempotency**: seed.sh guard OK nhưng đường volume-mới (initdb.d + Flyway fresh) khác volume-cũ — lần chạy đầu LÀ điều sweep kiểm chứng, finding thật không coi là flake.
4. **MinIO wipe**: `down -v` xóa ảnh — probe ảnh sau fresh boot; nếu seed không re-upload → thêm upload step vào harness (finding, không giấu).
5. **Token 15'**: journey specs re-login theo section (không giữ storageState xuyên 15').
6. **Config-audit false-positive**: default `localhost` là CỐ Ý cho host-dev — classify nguy hiểm = "default localhost + service chạy container + compose thiếu env override". Script phải reduce noise theo rule này.
7. **Contracts freshness**: API matrix đọc từ contracts/ — probe độ tươi trước (diff generated client vs controllers), stale → finding riêng.
8. **RBAC**: guest/user/admin × TẤT CẢ admin endpoints (products, categories, coupons, inventory admin, log admin, partner, RMA) — không chỉ 7 case hiện có.
9. **Dep freeze + zero backend trừ fix finding**: sweep phase chỉ viết scripts/specs; fixes theo finding (pattern đã biết) — đụng backend sâu phải escalate.
10. **FI ownership**: không đụng worktree/branch story khác; demo stack :8080 đang chạy — destructive chỉ qua harness gate.

## 3. Gate scope mỗi SF

- **SF-1**: `make qa-audit` chạy <5 phút + exit-code đúng semantics (0 = 0 finding CHƯA fix; 1 = có finding chưa fix; 2 = script error — finding FIXED ghi status FIXED, không ảnh hưởng exit) + report per-SF file có classify 3 trục + RBAC/S2S expected-matrix đóng (không "...").
- **SF-2**: harness dry-run 1 lần TOÀN BỘ (gate → backup+**restore-test throwaway DB** → down -v → build → up → seed → probes + live RBAC spot-check + port-owner check) + log timestamp từng stage.
- **SF-3**: 2 specs mới green TRÊN fresh-boot env (chạy qua harness) + selectors data-testid + asserts surfacing theo enum (stock view = inventory; giá = base + priceDelta).
- **SF-4**: full sweep green (audit 0 UNFIXED + journeys xanh ×2 vòng) + bug-register chốt (SF-4 merge report các SF) + demo state restore (seed) + sign-off; cap 2 vòng — hết cap → escalate user, KHÔNG ship red.

## 4. ACCEPTANCE từng SF

Context packs `docs/superpowers/contexts/fi404-sf-{1..4}.md` (Spec slice / Touch map / ACCEPTANCE / Boundary).

## 5. Success criteria (binary, epic)

1. `make qa-audit` chạy <5 phút; exit semantics §3 SF-1; report classify 3 trục (env / volume / value).
2. s2s expected-verdict matrix: mọi pair có verdict (OK/đã fix) — 0 pair UNKNOWN; live execute do harness stage-6 + SF-4 (chủ sở hữu run).
3. RBAC: expected matrix (SF-1, đóng list) khớp live results (harness stage-6 + SF-4) — 401/403/200 đúng vai; hole phân loại P0 (admin write lộ guest/user) / P1 (đọc lộ).
4. fresh-boot harness 1 lệnh chạy trọn (log timestamp từng stage) + backup tự tạo + restore-test pass (throwaway DB).
5. 2 journey specs mới xanh trên fresh-boot env.
6. e2e 15 specs cũ + mới xanh sau sweep.
7. Mỗi bug-lớp 1-5 có ≥1 detector đặt tên trong repo (bug-register mapping): lớp 1 = config-audit 3 trục; lớp 2 = s2s matrix; lớp 3 = data-lifecycle spec; lớp 4 = surfacing asserts (enum: admin stock view = inventory quantity; PDP không "Đã bán" từ ratingCount; giá variant = base + priceDelta); lớp 5 = port-owner check + SW/bundle-hash fresh-state assert.
8. Demo state sau sweep: seeded-green (:8080 login + cart + admin OK).
9. pnpm-lock + backend contracts không đổi ngoài fix finding được duyệt (authority = user, qua STORY-READY note hoặc epic comment).
10. bug-register `docs/superpowers/qa/bug-register.md` — SF-4 sở hữu + merge; mapping lớp→detector→finding→fix→re-run + escalate list.

## 6. Boundary (KHÔNG làm)

- KHÔNG thêm feature nghiệp vụ mới (endpoint chỉ sinh khi fix finding được user duyệt — precedent AdminStockController).
- KHÔNG chạy fresh-boot ngoài harness gate (confirm flag do coordinator set sau consent user 1 lần ở story level); KHÔNG down -v khi demo đang dùng; KHÔNG build khi stack up.
- KHÔNG đụng dev-stack.sh host-mode; KHÔNG sửa specs cũ — nếu fix finding làm đỏ expectation spec cũ → cập nhật spec cũ trong CÙNG fix commit + ghi bug-register; KHÔNG backend trừ fix finding pattern đã biết (vượt → escalate user).
- KHÔNG merge main (PR là quyền người); KHÔNG thêm dependency mới.
