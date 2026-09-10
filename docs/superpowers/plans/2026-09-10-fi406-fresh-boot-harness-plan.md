# Plan: SF-2 fresh-boot-harness (FI-406)

Date: 2026-09-10 | Linear: FI-406 | Worktree: `/Users/hoivu/orca/workspaces/ecommerce/sf-2-fresh-boot-harness` (nhánh `wakii-dev/sf-2-fresh-boot-harness` → đích `story/fi404-qa-sweep`)
Spec: `docs/superpowers/specs/2026-09-10-fi406-fresh-boot-harness-design.md` · Context pack: `docs/superpowers/contexts/fi404-sf-2.md` · Bracket: `docs/superpowers/brackets/fi404-qa-sweep.md`

## 0. Root cause analysis

**Root cause:** bug thật (config drift, data lifecycle) CHỈ nổ ở fresh volume + boot 100% container; không có cơ chế tái tạo an toàn — wipe tay = mất demo + data.
**Current state:** demo stack 24 containers up 6h+; 46/46 product_images.url rỗng (bug data đã hiện hữu) — không ai dám down -v để tái hiện từ zero.
**Expected outcome:** 1 lệnh `QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot`: backup → wipe → build → up → seed → probes, gates chặn mọi run nguy hiểm, evidence timestamp đầy đủ.
**Constraints:** DESTRUCTIVE — safety gates phần cứng nhất; consent user 1 lần story level (bracket là record), coordinator set confirm per-run; KHÔNG --force; KHÔNG đụng service code/compose/seed.sh/scripts/qa/config-audit*; dep freeze; build 10-15' → background + poll.
**High-level strategy:** 1 bash script staged (GATE→BACKUP→DOWN→BUILD→UP→SEED→PROBES), exit-code contract rõ, log timestamp `/tmp/qa-fresh-boot-<ts>.log`, fail minh bạch (finding không giấu).

## 1. Problem

Không chứng minh được hệ chạy từ zero-state; dry-run 1 lần toàn bộ là demo bắt buộc của SF (user đã consent wipe, launch 2026-09-10).

## 2. Scope

- **In:** `scripts/qa/fresh-boot-harness.sh` (mới) · Makefile target `qa-fresh-boot` cạnh seed (~105, khác vùng SF-1 append-cuối) · `.gitignore backups/` · README QA runbook · `docs/superpowers/qa/report-sf2.md` (dry-run đo stage).
- **Out:** service code, compose (chỉ đọc), seed.sh (bug → finding), scripts/qa/config-audit* (SF-1), journey specs (SF-3), sweep (SF-4), dep mới, merge main.
- **Success criteria (observable):** 5 ACCEPTANCE của pack — xem spec §6.

## 3. Touch map

Spec §3. READ-ONLY cứng: docker-compose.yml, gateway-routes.yml, service code, seed.sh, scripts/qa/config-audit*.

## 4. Design

Spec §4 — 7 stages + exit codes 0/3/4/5/6/7. Chi tiết đã verify live 2026-09-10: login/events/cart/actuator/curl-in-images/RAM 7.7GB/disk 31GB/9 DB/seed XONG @seed.sh:229. RBAC probe = round-trip GET→PUT idempotent (pin `Tai nghe%`). Gate: pidfile lock + confirm flag + compose-ps derived idle check + port-owner 9 port + blast-radius per-volume (mongodata/miniodata MẤT VĨNH VIỄN) + disk 20GB + RAM 6GB. BACKUP: per-DB dump + restore-test per-DB throwaway (template = schema-only). BUILD: daemon-wedge detect → exit 5 + resume `QA_FRESH_BOOT_RESUME=BUILD` (bắt buộc marker `.run/qa-fresh-boot-wiped`). Spec-critic: FIX-P0-FIRST → v2 → PROCEED (2 cycles).

## 5. Implementation outline — task DAG

```
T1 skeleton ─→ T2 gate ─→ T3 backup ─→ T4 down ─→ T5 build ─┬→ R1 review nhóm A (T1-T5, 5 commits)
                                                            │        │ verdict+fix xong
                                     T10 makefile+gitignore+README ─┘        ↓
                                                            └────────→ T6 up ─→ T7 seed ─→ T8 probes+port-owner ─→ R2 review nhóm B ─→ V dry-run (coordinator) ─→ SEC audit ─→ VER verifier
```

Thực thi (anti-race — shared worktree, R1 có thể yêu cầu sửa GATE/BACKUP cùng file với
executor-2): T1-T5 = executor-1 → R1 ‖ T10 (T10 file khác — song song an toàn) → áp fix
R1 (nếu có) → executor-2 (T6-T8) → **R2 = review nhóm B: commits T6-T8 CỘNG T10** →
V (coordinator — destructive, consent đã có) → SEC → VER. KHÔNG dispatch executor-2
trước R1 verdict (commit-race cùng file — memory lesson shared-worktree). Tick `[x]`
khi xong.

### Task T1 — harness-skeleton-stages-timestamps
- [x] T1.1 Tạo `scripts/qa/fresh-boot-harness.sh`: shebang, `set -u -o pipefail` (KHÔNG `set -e` — stages tự kiểm exit), LOG=`/tmp/qa-fresh-boot-$(date +%Y%m%d-%H%M%S).log` (tee mọi output), hàm `stage <name>` in `[stage] HH:MM:SS (elapsed-since-start)`, hàm `die <code> <msg>`, exit-code convention 0/3/4/5/6 + bắt mọi exit → in tổng thời gian
- [x] T1.2 Khung 7 stage tuần tự GATE→BACKUP→DOWN→BUILD→UP→SEED→PROBES với thân TODO stub trả về 0 — `bash -n` pass
- [x] Commit `feat(qa): fresh-boot harness skeleton — 7 stages + timestamp log (FI-406)`

**Exit:** `bash -n` pass; chạy `bash scripts/qa/fresh-boot-harness.sh` (thân stub) → log file tạo, 7 stage header in, exit 0.

### Task T2 — safety-gate-confirm-disk-ram-demo-idle (P0 — phần cứng nhất)
- [x] T2.1 Pidfile lock `.run/qa-fresh-boot.lock` (mkdir + trap cleanup) — run song song die 3; confirm flag `QA_FRESH_BOOT_CONFIRM=1` thiếu → die 3 (trước MỌI hành động); `QA_FRESH_BOOT_RESUME` nếu set phải ∈ {BUILD} → khác die 3
- [x] T2.2 Demo-idle: (a) DERIVED chính `docker compose --profile full --profile stripe ps -q` non-empty → die 3 (phủ mọi service compose — kể cả invoice default-profile); (b) `lsof -nP -iTCP -sTCP:LISTEN` trên 8080,3000,5173,5174,5175,5176,5177,5178,9099 — có listener → die 3 in PID/process; KHÔNG có --force
- [x] T2.3 Blast-radius minh bạch khi idle pass (sắp wipe): in fate từng volume — pgdata=BACKED-UP · redis/rabbitmq/mailpit/es=regenerable · **mongodata=MẤT VĨNH VIỄN (event_log, không backup)** · **miniodata=MẤT VĨNH VIỄN (uploaded images không re-upload — probe MinIO là detector)**
- [x] T2.4 Disk `df -k <repo>` free ≥ 20GB + `docker system df` vào log; RAM `docker info --format {{.MemTotal}}` ≥ 6GB → thiếu die 3
- [x] T2.5 Preflight: docker daemon trả lời (`docker info`), compose file tồn tại → fail die 3
- [x] T2.6 Self-test gates sandbox: chạy KHÔNG flag → exit 3; chạy CÓ flag khi stack demo sống (case thật) → exit 3; `bash -n`; commit `feat(qa): fresh-boot safety gate — confirm+idle+blast-radius+disk+ram (FI-406)`

**Exit:** bằng chứng 2 refusal thật có trong log (thiếu flag; stack sống), không đụng gì trước refuse.

### Task T3 — pg-dump-backup-restore-test-throwaway-db
- [x] T3.1 Đảm bảo postgres sống + healthy: container `ecommerce-postgres` không running → `docker compose up -d postgres` + ĐỢI `.State.Health.Status == healthy` trước dump (không dump-trên-starting; timeout 2') — idempotent
- [x] T3.2 Backup 9 DB (danh sách hardcoded đúng spec; `<ts>`=YYYYMMDD-HHMMSS) → `backups/qa-<ts>/<db>.sql.gz` qua `docker compose exec -T postgres pg_dump -U postgres -d <db> | gzip`; dump < 200 bytes hoặc gzip fail → die 4 (trước wipe)
- [x] T3.3 RESTORE-TEST per-DB: `docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE qa_restore_test_<db sans db_>"` → `gunzip -c <dump> | docker compose exec -T postgres psql -U postgres -d qa_restore_test_<...>` → sanity `SELECT count(*) FROM <bảng-map hardcoded>` (identity→users, catalog→products, inventory→stocks, ordering→orders, payment→payments, notification→notifications, partner→partners, affiliate→affiliates, **template→schema-only `SELECT 1`** — db_template 0 bảng public, verified) → `DROP DATABASE`; bất kỳ fail → die 4 + dọn DB test còn sót
- [x] T3.4 ls -lh backups/ vào log (bằng chứng 9 file); commit `feat(qa): fresh-boot backup 9 DB + restore-test throwaway (FI-406)`

**Exit:** backup 9 file + 9 restore-test pass trong log (hoặc die 4 trước wipe nếu fail).

### Task T4 — stage-down-v
- [x] T4.1 `docker compose --profile full --profile stripe down -v --remove-orphans` + log thời gian; ghi marker `.run/qa-fresh-boot-wiped` (timestamp — bằng chứng wipe cho RESUME); verify `docker ps -a --format {{.Names}} | grep ^ecommerce-` = rỗng → còn sót die 4
- [x] Commit `feat(qa): fresh-boot down -v stage (FI-406)`

**Exit:** sau stage, không còn container ecommerce-*.

### Task T5 — stage-build-serialized-stack-down (daemon wedge)
- [x] T5.1 `docker compose --profile full --profile stripe build` chạy nền (log ra LOG), poll progress in % interval 30s
- [x] T5.2 Daemon-wedge detect: build exit != 0 + tail log khớp `Cannot connect to the Docker daemon|error during connect|Cannot connect.*docker` → in hướng dẫn restart daemon (`pkill -f com.docker.backend; open -a Docker`) + `QA_FRESH_BOOT_RESUME=BUILD QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot` + die 5; build fail khác → die 5 kèm tail log
- [x] T5.3 RESUME=BUILD: skip BACKUP+DOWN nhưng BẮT BUỘC marker `.run/qa-fresh-boot-wiped` tồn tại từ run trước → không marker die 3 (chặn false-fresh trên data demo còn nguyên); GATE vẫn chạy đầy đủ; `bash -n`; commit `feat(qa): fresh-boot build stage + daemon-wedge resume (FI-406)`

**Exit:** `bash -n` pass; logic resume verify bằng code-inspect + dry-run thật (T-V).

### Task T6 — stage-up-health-gates-tiers
- [ ] T6.1 `docker compose --profile full --profile stripe up -d` → tầng 1 infra: đợi `docker inspect -f {{.State.Health.Status}}` = healthy cho postgres,redis,rabbitmq,mongo,elasticsearch,minio,mailpit (timeout 2', poll 5s)
- [ ] T6.2 Tầng 2 JVMs (timeout 4'/service — poll 10s): **10 JVM actuator** `docker exec ecommerce-<svc> curl -sf localhost:<port>/actuator/health` khớp `"status":"UP"` — port map hardcoded (identity 8081, catalog 8082, cart 8083, inventory 8084, ordering 8085, payment 8086, notification 8087, log 8088, partner-api 8091, affiliate 8092). **Gateway probe QUA HOST `curl -sf :8080/actuator/health`** (không docker-exec nội bộ — gateway image chưa verify có curl; host probe + tier-3 FE đã cover — plan-critic P2). **invoice-service = FastAPI — KHÔNG actuator: probe qua compose healthcheck `docker inspect .State.Health.Status == healthy`** (compose đã định nghĩa healthcheck — plan-critic P0-2)
- [ ] T6.3 Tầng 3 FE + gateway public: frontend-web/storefront-web Up; `curl :8080/` 200 (storefront route) + `curl :8080/cart` 200 (shell route); timeout riêng; fail BẤT KỲ tầng → **die 7** kèm container logs tail — abort TRƯỚC SEED
- [ ] Commit `feat(qa): fresh-boot up + tiered health gates (FI-406)`

**Exit:** health gates pass từng tầng có timestamp trong log (verify thật ở T-V).

### Task T7 — stage-seed
- [ ] T7.1 **Poll seed-readiness:** catalog SeedDataRunner populate `products` ASYNC sau health UP — poll `SELECT count(*) FROM products` > 0 (timeout 2', poll 5s) trước khi seed (plan-critic P1-5: seed.sh:114 hard-fail "không tìm thấy product" nếu chạy sớm)
- [ ] T7.2 `make seed` → capture output; assert **exit 0 AND** khớp `XONG` (seed.sh:229); fail → tail log seed + die 4
- [ ] Commit `feat(qa): fresh-boot seed stage — readiness poll + assert XONG (FI-406)`

**Exit:** seed thật pass trong dry-run (T-V).

### Task T8 — stage-probes-image-login-cart-events-live-rbac-hardcoded + port-owner (gộp bracket T9 — plan-critic P1-6)
- [ ] T8.1 (a) MinIO: `SELECT url FROM product_images WHERE url <> '' LIMIT 1` → GET `:8080<url>` 200; không có url / non-200 → FINDING "MinIO-reseed" ghi vào danh sách (không giấu, không dừng)
- [ ] T8.2 (b) login admin (creds từ .env ADMIN_EMAIL/ADMIN_PASSWORD fallback admin@demo.vn/admin123) → 200 + accessToken; (c) guest `POST /api/cart/items {productId từ db, qty:1}` → 200; (d) events `GET /api/log/admin/events` JWT → 200
- [ ] T8.3 (e) RBAC HARDCODED: pin product `name->>'vi' ILIKE 'Tai nghe%'`; guest PUT `/api/catalog/admin/products/<id>` không token → expect 401/403; admin PUT round-trip GET→PUT cùng body → expect 2xx + re-GET so name/price unchanged (idempotent); 400 `images[].url` → FINDING bug data ghi rõ
- [ ] T8.4 (f) port-owner: `lsof` 8080,3000,5173-5178,9099 — process lạ (không phải docker) → FINDING stale-env in PID+command
- [ ] T8.5 Collect-ALL findings → in bảng verdict từng probe; có finding → die 6 (stack vẫn seeded); commit `feat(qa): fresh-boot probes — image/login/cart/events/rbac/port-owner (FI-406)`

**Exit:** 6 probe chạy thật trong dry-run, verdict từng cái có trong log.

### Task T10 — makefile-target-qa-fresh-boot-runbook-restore-gitignore-backups
- [x] T10.1 Makefile: `.PHONY` + target `qa-fresh-boot` đặt NGAY SAU block seed (cạnh — KHÔNG cuối file, khác vùng SF-1 qa-audit append-cuối); target = guard `test -f scripts/qa/fresh-boot-harness.sh` + `bash scripts/qa/fresh-boot-harness.sh` (env QA_FRESH_BOOT_CONFIRM pass-through)
- [x] T10.2 `.gitignore` + `backups/` (section riêng có comment)
- [x] T10.3 README: section QA — chạy harness, exit codes, **runbook restore-từ-backup** (docker compose up -d postgres → createdb → gunzip | psql per-DB → seed lại → up full), cảnh báo destructive + note mongo/minio không backup
- [x] Commit `feat(qa): qa-fresh-boot makefile target + runbook + gitignore backups (FI-406)` @2d66090

**Exit:** `make qa-fresh-boot` KHÔNG flag → exit 3 (bằng chứng — ĐÃ CHẠY: make in Error 3, refuse ở gate, log /tmp/qa-fresh-boot-20260910-074542.log); gitignore có backups/; README có runbook.

### Task T-V — dry-run 1 lần toàn bộ (coordinator — destructive, consent đã có)
- [ ] TV.0 Pre-clean stale-env: lsof-discover process lạ giữ port gate (tầm nhìn: next-server mồ côi :3000 từ main checkout — dev server không data) → kill + ghi vào report; PID tra tại thời điểm chạy, KHÔNG hardcode; vite rig cũ :5373/:5376 KHÔNG đụng (ngoài list gate)
- [ ] TV.1 Bằng chứng refuse: (1) không flag khi stack sống → exit 3; (2) CÓ flag khi stack sống → exit 3 idle-check
- [ ] TV.2 Coordinator down TOÀN BỘ stack KHÔNG -v (`docker compose --profile full --profile stripe down --remove-orphans` — compose-ps phải rỗng để GATE pass; KHÔNG down app-only: compose-ps vẫn non-empty → gate tự refuse dry-run — plan-critic P0-1; wipe -v là VIỆC CỦA HARNESS, postgres do T3.1 tự revive) → chạy `QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot` nền + poll `/tmp/qa-fresh-boot-*.log`
- [ ] TV.3 Verify từng dòng ACCEPTANCE pack (5 dòng) bằng log timestamp + file backup + RESTORE-TEST + health gates + SEED XONG + PROBES từng cái
- [ ] TV.4 Ghi `docs/superpowers/qa/report-sf2.md`: thời gian từng stage + tổng + verdict probe + findings (MinIO url rỗng nếu có) + evidence log path + **inline các đoạn log then chốt** (log /tmp bị macOS dọn định kỳ) + **ghi rõ RESUME=BUILD là untested-path** (chỉ code-inspect — không credit như đã exercised)

**Recovery nếu dry-run đỏ giữa chừng** (plan-critic P0-3 — wipe đã xảy ra, stack chết/half-dead):
- Exit 7 (health fail) hoặc seed-fail exit 4: stack đang up-lỡ → `docker compose --profile full --profile stripe down --remove-orphans` (KHÔNG -v) → fix nguyên nhân → re-run `QA_FRESH_BOOT_RESUME=BUILD QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot` (marker `.run/qa-fresh-boot-wiped` từ run trước hợp lệ — skip BACKUP/DOWN, BACKUP lại trên DB rỗng sẽ die 4 vô nghĩa) → BUILD (cached) → UP → SEED → PROBES.
- Không dùng resume / muốn sạch hoàn toàn: restore-from-backup theo runbook README (T10.3) HOẶC chấp nhận mất dữ liệu hiện có, chạy full lại từ đầu.
- ĐÁNH MẤT demo không thể khôi phục bằng backup: mongodata/miniodata (đã disclose ở GATE) — report ghi rõ.

**Exit:** 5 ACCEPTANCE từng dòng có bằng chứng; report có số liệu stage. **Dry-run semantics:** exit 6 với findings báo đúng = ACCEPTANCE thỏa (spec §Exit-codes) — KHÔNG bẻ cong probe để đạt exit 0.

## 6. Risks & unknowns

- Disk 31GB free (threshold 20GB) — sát; nếu build fail disk → finding, không tự tăng ngưỡng.
- Backup trên demo 6h — dump nhỏ; restore-test per-DB ~vài phút.
- Probe FE phụ thuộc gateway-routes hiện tại (chỉ đọc) — fail minh bạch.
- Build 10-15' — nền + poll; daemon wedge có resume path.
- Sau dry-run stack fresh+seeded — SF-3 dùng env này (coordinator giữ sống).
