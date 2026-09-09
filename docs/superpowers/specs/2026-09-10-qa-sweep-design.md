# QA Sweep — Spec (epic)

> Story: FI-403 — Test toàn bộ website + admin: săn các lớp lỗi tích hợp (theo 5 lớp bug thật 9/9) · Ngày: 2026-09-10
> Quyết định user: **(a)** sweep tìm ra bug → fix ngay trong story (cap theo pattern); **fresh-boot harness on-demand** + backup `pg_dump` tự động + gate hỏi trước khi wipe.
> P0 verdict: **(iii) hybrid phân tầng** — tầng rẻ (static audit + matrix, chạy mọi lúc) + tầng nặng (fresh-boot runtime, on-demand gated).
> Precondition: demo stack :8080 ĐANG CHẠY — mọi thao tác destructive phải qua gate backup.

---

## 0. IDEA-BRIEF

- **Task**: sweep hệ thống theo 5 lớp lỗi đã biết (không test-random), phát hiện + fix bug cùng lớp.
- **5 lớp lỗi chuẩn (bug register 9/9 — mỗi lớp 1 detector):**
  1. **Config drift** compose ↔ code: env var code đọc (`application.yml`, `@Value` defaults, gateway-routes defaults) mà compose thiếu — nguy hiểm nhất khi default chứa `localhost` + service chạy trong container (đúng pattern LOG_URI).
  2. **S2S auth gap**: mọi HTTP call service→service — path gọi có vượt quyền (vd ordering gọi path admin) / thiếu token / permitAll sai (đúng pattern ordering→catalog 401→502).
  3. **Data lifecycle**: data cũ/hỏng làm kẹt flow (variant-less product kẹt checkout; cart row variantId null; fresh volume lộ bug seed).
  4. **UI surfacing sai dữ liệu**: view/form hiển thị số không phải dữ liệu thật (view stock luôn 0; "Đã bán"=ratingCount đã fix FI-390).
  5. **Stale environment**: cache/SW bundle cũ; dev server mồ côi chiếm port; daemon wedge khi build+stack đồng thời.
- **Output**: script audit + matrix + fresh-boot harness + 2 journey specs + bug-register + fixes.
- **Success**: xem §7.
- **Out-of-scope**: xem §8.

## 1. Kiến trúc — 4 SF, hybrid phân tầng

**Anti-duplicate phân định (chốt trước):** SF-1 sở hữu TẤT CẢ detector tĩnh (config-audit + s2s matrix + RBAC matrix); SF-2 sở hữu harness runtime (backup/build/up/seed/probe); SF-3 sở hữu journey specs (admin CRUD + data-lifecycle); SF-4 CHỈ chạy + triage + fix + re-run. Không SF nào làm việc của SF khác.

### SF-1 qa-static-audit (Tier 0)
**What**: 2 script chạy <5 phút, non-destructive, chạy được bất cứ lúc nào (kể cả đang demo): (1) config-audit — diff mọi `${VAR:default}` code đọc ↔ compose env, classify nguy hiểm (default `localhost` + dùng trong container), report + exit-code binary; (2) s2s-auth-matrix — enumerate mọi HTTP client service→service (ordering 6, cart 2, catalog 1, notification 3, partner 3...), probe từng pair: path gọi có cần auth? token từ đâu? role đủ không? Kèm RBAC matrix guest/user/admin × admin endpoints. Kết quả vào `docs/superpowers/qa/bug-register.md` (living doc).
**Tasks (11)**: config-audit-script-extract-env-from-code / config-audit-diff-compose-classify-localhost-danger / config-audit-exit-code-report-md / s2s-inventory-enumerate-23-clients / s2s-probe-per-pair-auth-path-role / rbac-matrix-guest-user-admin-endpoints / log-findings-bug-register / makefile-target-qa-audit / unit-smoke-scripts / audit-comment-findings-p0 / probe-contracts-freshness-openapi-vs-code.

### SF-2 fresh-boot-harness (Tier 0)
**What**: `scripts/qa/fresh-boot-harness.sh` — SAFE sequence: (0) gate: confirm flag + kiểm không ai đang demo + disk/RAM check; (1) `pg_dump` backup 9 DB vào `backups/`; (2) `compose --profile full down -v`; (3) build TẤT CẢ images KHI STACK ĐÃ TẮT (bài học daemon wedge ×3); (4) up + health gates từng tầng (infra → JVMs → FE) với timeout; (5) `make seed`; (6) probe: 1 ảnh MinIO load được, login admin/user, 1 add-to-cart, 1 events API; Makefile target `qa-fresh-boot`. Đo + log thời gian từng stage.
**Tasks (10)**: harness-skeleton-stages-timestamps / safety-gate-confirm-disk-ram / pg-dump-backup-9-dbs / stage-down-v / stage-build-serialized-stack-down / stage-up-health-gates-tiers / stage-seed / stage-probes-image-login-cart-events / makefile-target-qa-fresh-boot + docs / dry-run-1-lần-đo-thời-gian-bug-register.

### SF-3 journey-specs (Tier 1) — Depends on: SF-1, SF-2
**What**: 2 spec Playwright mới theo pattern specs hiện có: (1) `admin-journey.spec.ts` — login admin → product CRUD đầy đủ field (name/desc/SEO/price/compare/flash/tags/images/variants+stock) → round-trip assert (chứng minh không còn field không-lưu); coupon CRUD round-trip; category CRUD; (2) `data-lifecycle.spec.ts` — guest add variant-less product → login (merge) → checkout pass (bắt lớp 3); assert view số = dữ liệu thật (lớp 4); fresh-state page assertions (lớp 5). Dùng data-testid theo ADR; token re-login helper mỗi section (JWT 15').
**Tasks (9)**: spec-admin-journey-skeleton-login-helper / admin-product-crud-full-fields-roundtrip / admin-product-variant-stock-roundtrip / admin-coupon-crud-roundtrip / admin-category-crud-roundtrip / spec-data-lifecycle-guest-variantless-checkout / spec-data-lifecycle-stale-cart-merge / spec-surfacing-asserts-real-numbers / run-on-fresh-boot-green.

### SF-4 sweep-run-fixes (Tier 2) — Depends on: SF-1, SF-2, SF-3
**What**: CHẠY sweep thật: qa-audit (tầng rẻ) → findings; fresh-boot harness (on-demand, user-gate) → journeys → findings. Triage: mỗi finding sinh fix task — pattern đã biết (5 lớp) → fix trong SF-4; pattern lạ/đụng backend sâu → report + escalate user. Re-run tới xanh (cap 2 vòng). Bug-register chốt + đính epic.
**Tasks (10)**: run-static-audit-triage / run-s2s-matrix-triage / run-rbac-matrix-triage / fresh-boot-run-1-findings / fix-tasks-batch-1 / fresh-boot-run-2-green / fix-tasks-batch-2-cap / journey-specs-green-final / bug-register-finalize-epic-comment / demo-restore-seed-signoff.

**Tier map**: SF-1 (0) ∥ SF-2 (0) → SF-3 (1, dep SF-1+SF-2) → SF-4 (2, dep cả 3). Dev-port: SF-3 chạy journey trên fresh-boot env do SF-2 quản lý — KHÔNG dùng port base FI-390/FI-397 (+0..+400) — harness tự quản :8080 origin duy nhất.

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

- **SF-1**: script chạy được (`make qa-audit`) exit-code đúng + report markdown có classify + ít nhất 1 finding thật (nếu 0 finding → script nghi vấn, review threshold).
- **SF-2**: harness dry-run 1 lần TOÀN BỘ (backup → down -v → build → up → seed → probes) + log thời gian từng stage + backup file tồn tại + restore-able (gunzip test).
- **SF-3**: 2 specs mới green TRÊN fresh-boot env (chạy qua harness) + selectors data-testid.
- **SF-4**: full sweep green (audit 0 P0 + journeys xanh ×2 vòng) + bug-register chốt + demo state restore (seed) + sign-off.

## 4. ACCEPTANCE từng SF

Context packs `docs/superpowers/contexts/fi403-sf-{1..4}.md` (Spec slice / Touch map / ACCEPTANCE / Boundary).

## 5. Success criteria (binary, epic)

1. `make qa-audit` chạy <5 phút, exit 0, report classify đủ (hoặc list findings đã fix).
2. s2s matrix: mọi pair có verdict auth (OK/đã fix) — 0 pair UNKNOWN.
3. RBAC matrix: guest/user/admin × admin endpoints — 401/403/200 đúng vai, 0 hole P0.
4. fresh-boot harness 1 lệnh chạy trọn (log timestamp từng stage), backup tự tạo trước wipe.
5. 2 journey specs mới xanh trên fresh-boot env.
6. e2e 15 specs cũ + mới xanh sau sweep.
7. Mỗi bug-lớp 1-5 có ≥1 detector trong repo (kiểm bug-register mapping).
8. Demo state sau sweep: seeded-green (:8080 login + cart + admin OK).
9. pnpm-lock + backend contracts không đổi ngoài fix finding được duyệt.
10. bug-register `docs/superpowers/qa/bug-register.md` — mapping lớp→detector→kết quả + escalate list.

## 6. Boundary (KHÔNG làm)

- KHÔNG thêm feature nghiệp vụ mới (endpoint chỉ sinh khi fix finding được duyệt — như AdminStockController precedent).
- KHÔNG chạy fresh-boot ngoài harness gate; KHÔNG down -v khi demo đang dùng; KHÔNG build khi stack up.
- KHÔNG đụng dev-stack.sh host-mode; KHÔNG sửa specs cũ (chỉ thêm); KHÔNG backend trừ fix finding pattern đã biết (vượt → escalate user).
- KHÔNG merge main (PR là quyền người); KHÔNG thêm dependency mới.
