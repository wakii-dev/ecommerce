# FI-406 — SF-2 fresh-boot-harness — Spec

> Nguồn THỦ TỤC: epic-approved context pack `docs/superpowers/contexts/fi404-sf-2.md` +
> bracket `docs/superpowers/brackets/fi404-qa-sweep.md` (SF-2 section). Epic questions đã
> trả lời ở story level — spec này KHÔNG mở lại, chỉ đóng băng chi tiết đã verify trên
> stack sống (2026-09-10, 24 containers up 6h) + các quyết định chi tiết.
> Đích: `story/fi404-qa-sweep` · Linear: FI-406 · Design: none.

## 0. Root cause

Bug thật (config drift, data lifecycle) CHỈ nổ ở fresh volume + boot 100% container —
điều kiện không thể tái tạo an toàn bằng tay (down -v xóa pgdata/redis/mongo/minio +
demo :8080 đang chạy). Harness là cơ chế DUY NHẤT tái tạo điều kiện đó: backup → wipe →
build → up → seed → probes. Safety gates là phần CỨNG NHẤT — sai gate = mất demo + data
người dùng. Khi gặp việc ngoài spec: an toàn trước tiện nghi.

## 1. Problem

Không có cách chứng minh hệ chạy được từ zero-state; demo data 6h+ che bug seed/data.
Consent wipe đã có (story level, launch 2026-09-10) — dry-run chạy NGAY trong SF.

## 2. Scope

**In:** `scripts/qa/fresh-boot-harness.sh` (7 stages GATE→BACKUP→DOWN→BUILD→UP→SEED→PROBES,
log timestamp `/tmp/qa-fresh-boot-<ts>.log`, stage in `[stage] HH:MM:SS (elapsed)`) ·
Makefile target `qa-fresh-boot` CẠNH block `seed` (~105) · `.gitignore backups/` ·
README QA runbook (restore-từ-backup) · `docs/superpowers/qa/report-sf2.md` (dry-run đo
thời gian từng stage + tổng).

**Out:** config-audit/s2s/rbac scripts (SF-1) · journey specs (SF-3) · sweep-run (SF-4) ·
service code · compose config (chỉ đọc) · seed.sh (bug → finding, KHÔNG sửa) ·
scripts/qa/config-audit* (SF-1) · dependency mới · merge vào main.

## 3. Touch map

```
scripts/qa/fresh-boot-harness.sh   (mới — sở hữu)
backups/qa-<ts>/*.sql.gz           (runtime output — gitignored)
Makefile                           (sửa: .PHONY + target cạnh seed; SF-1 append cuối file — khác vùng)
.gitignore                         (sửa: + backups/)
README.md                          (sửa: QA section + runbook restore)
docs/superpowers/qa/report-sf2.md  (mới — sở hữu)
```

READ-ONLY: docker-compose.yml, service code, seed.sh, e2e specs, scripts/qa/config-audit*.

## 4. Design — 7 stages + safety (chi tiết đã đóng băng)

### Stage GATE (P0 — refuse KHÔNG phá gì)
1. Pidfile lock `.run/qa-fresh-boot.lock` (mkdir-based + trap cleanup) — run song song → die 3.
2. `QA_FRESH_BOOT_CONFIRM=1` env bắt buộc (coordinator set sau consent per-run); thiếu →
   log + **exit 3**. `QA_FRESH_BOOT_RESUME` nếu set phải ∈ {BUILD} — giá trị khác → die 3.
3. **Demo-idle check** — KHÔNG có `--force`, consent story-level không thay thế idle-check:
   - DERIVED (chính): `docker compose --profile full --profile stripe ps -q` non-empty →
     REFUSE exit 3 (phủ MỌI service compose định nghĩa — kể cả invoice-service
     default-profile không có `profiles:` key; không drift khi SF thêm service).
   - port-owner `lsof -nP -iTCP -sTCP:LISTEN` trên **8080, 3000, 5173, 5174, 5175, 5176,
     5177, 5178, 9099** → có listener = REFUSE exit 3 in PID/process.
4. **Blast-radius minh bạch TRƯỚC wipe** (in khi idle-check pass — sắp wipe): fate TỪNG
   volume trong 7 volume down -v xóa: `pgdata`=BACKED-UP · `redisdata`/`rabbitmqdata`/
   `mailpitdata`/`esdata`=regenerable · **`mongodata`=MẤT VĨNH VIỄN (event_log — KHÔNG
   có backup)** · **`miniodata`=MẤT VĨNH VIỄN (uploaded images — bucket re-init qua
   minio-init, ảnh KHÔNG re-upload; probe MinIO là detector)**. Consent
   (bracket/launch) đã liệt kê pgdata/redis/mongo/minio — gate in lại per-volume true
   cost trước khi wipe.
5. Disk: `df` free ≥ 20GB (host — Docker Desktop VM disk cùng pool); `docker system df`
   vào log. RAM VM: `docker info MemTotal` ≥ 6GB (máy này 7.7GB — verified). Thiếu →
   refuse exit 3.
6. Compose files tồn tại + docker daemon trả lời.

### Stage BACKUP (chạy TRƯỚC wipe — fail = refuse wipe, exit 4)
- Đảm bảo postgres sống + **healthy** (`docker compose up -d postgres` nếu chưa — đợi
  `.State.Health.Status == healthy` trước dump, không dump-trên-starting).
- `pg_dump` TỪNG DB (9: db_affiliate, db_catalog, db_identity, db_inventory,
  db_notification, db_ordering, db_partner, db_payment, db_template) →
  `docker compose exec -T postgres pg_dump -U postgres -d <db>` | gzip →
  `backups/qa-<ts>/<db>.sql.gz` (`<ts>` format `YYYYMMDD-HHMMSS`). Dump rỗng/0-byte = fail.
- **RESTORE-TEST per-DB (gunzip không đủ):** `createdb qa_restore_test_<db>` trong cùng
  postgres → restore bằng psql → sanity query (map hardcoded: identity→users,
  catalog→products, inventory→stocks, ordering→orders, payment→payments,
  notification→notifications, partner→partners, affiliate→affiliates,
  **template→schema-only `SELECT 1`** — db_template hiện 0 bảng public, verified) →
  drop DB test. Bất kỳ fail → exit 4 TRƯỚC khi wipe + dọn DB test còn sót.
  (log-service data ở Mongo — ngoài 9 DB postgres; Mongo/minio KHÔNG có backup — xem
  blast-radius ở GATE.4.)

### Stage DOWN
- `docker compose --profile full --profile stripe down -v --remove-orphans` (wipe 7
  volumes — chỉ pgdata có backup; 2 volume MẤT VĨNH VIỄN đã in ở GATE.4).
- Ghi marker `.run/qa-fresh-boot-wiped` (timestamp) — bằng chứng wipe cho RESUME.
- Verify: containers ecommerce-* còn lại = 0.

### Stage BUILD (stack ĐÃ tắt — daemon wedge ×3)
- `docker compose --profile full --profile stripe build` — serialize, log thời gian.
- Chạy nền + poll log (build 10-15'): harness tự poll, in progress.
- Daemon chết giữa build (exit != 0 + log khớp `Cannot connect to the Docker daemon|
  error during connect|500`) → in hướng dẫn restart (`pkill -f com.docker.backend;
  open -a Docker`) + **exit 5** với hướng dẫn resume: `QA_FRESH_BOOT_RESUME=BUILD
  QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot`. RESUME=BUILD: skip BACKUP+DOWN — nhưng
  BẮT BUỘC marker `.run/qa-fresh-boot-wiped` tồn tại từ run trước (không marker → die 3 —
  chặn false-fresh: stack chỉ partially-down vẫn có data demo, không được label fresh);
  GATE vẫn chạy đầy đủ. Build fail KHÔNG-phải-daemon → die 5 kèm tail log.

### Stage UP + health gates theo tầng (timeout rõ — fail bất kỳ tầng → **exit 7**)
1. **Infra:** `docker compose --profile full --profile stripe up -d` → đợi
   `docker inspect .State.Health.Status == healthy` cho postgres/redis/rabbitmq/mongo/
   elasticsearch/minio/mailpit (timeout 2').
2. **JVMs (11 actuator + 1 compose-healthcheck):** identity, catalog, cart, inventory,
   ordering, payment, affiliate, notification, log, partner-api, gateway — probe
   `docker exec <ct> curl -sf localhost:<port>/actuator/health` khớp `"status":"UP"`
   (images có curl — verified trên catalog), timeout **4 phút/service** (pack).
   Port map: identity 8081, catalog 8082, cart 8083, inventory 8084, ordering 8085,
   payment 8086, notification 8087, log 8088, partner 8091, affiliate 8092; gateway
   qua host `:8080/actuator/health`. **invoice-service = FastAPI (KHÔNG actuator) —
   probe qua compose healthcheck `docker inspect .State.Health.Status`** (đã định nghĩa
   trong compose). Lưu ý template-service không chạy trong profile full — không probe.
3. **FE:** frontend-web (nginx :80) + storefront-web (:3000) Up; probe HTTP qua gateway:
   `GET :8080/` (storefront route) + `GET :8080/cart` (shell route) 200.
4. **Gateway public:** `curl :8080/actuator/health` → `"status":"UP"` (verified).

### Stage SEED
- `make seed` → assert **exit 0 AND** output khớp `XONG` (seed.sh:229).
- Creds probe đọc `.env` `ADMIN_EMAIL`/`ADMIN_PASSWORD` nếu có (fallback
  `admin@demo.vn`/`admin123` — defaults seed.sh:30-31; .env hiện không override).
- Fail → log + **exit 4**.

### Stage PROBES (collect-ALL-findings rồi mới exit 6 — không fail-fast; KHÔNG giấu)
- (a) **MinIO ảnh:** `SELECT url FROM product_images WHERE url <> '' LIMIT 1` →
  `GET :8080<url>` 200. Không có url nào / load fail = **finding MinIO-reseed** in rõ
  (data demo hiện tại: 46/46 url rỗng — verified 2026-09-10; sau fresh-seed verdict thật).
- (b) Login admin `POST :8080/api/identity/auth/login` {email/password từ GATE SEED-creds
  — .env hoặc default} → 200 + accessToken (demo creds — pack chỉ định).
- (c) Guest add-to-cart `POST :8080/api/cart/items {productId:<1 product từ DB>, qty:1}`
  → 200.
- (d) Events API admin `GET :8080/api/log/admin/events` (JWT từ (b)) → 200.
- (e) **RBAC spot-check HARDCODED** (độc lập SF-1): target product pin
  `name->>'vi' ILIKE 'Tai nghe%'` (precedent seed.sh:166); guest → `PUT
  /api/catalog/admin/products/<id>` (không token) → **401/403**; admin → PUT round-trip
  GET→PUT cùng body → **2xx** + re-GET so `nameI18n`/`price` unchanged (idempotent —
  không mutate demo). Round-trip 400 (`images[].url bắt buộc`) = bug data lộ — probe
  FAIL in rõ (đúng mục đích harness).
- (f) **Port-owner check:** `lsof` 8080/3000/5173-5178/9099 — không process lạ ngoài
  docker/gateway stack (process lạ = FINDING stale-env in PID + command).

### Exit codes
0 OK · 3 gate refuse (flag/idle/disk/ram/lock/RESUME-invalid) · 4 backup/seed fail ·
5 build fail (daemon wedge có hướng dẫn resume) · **7 UP health-gate fail (infra/JVM/FE
timeout — abort TRƯỚC SEED, không đi tiếp)** · 6 probe fail (harness sống, stack seeded —
collect-all findings minh bạch) · khác = lỗi script.

**Dry-run semantics (chống executor loop):** dry-run có thể kết thúc **exit 6 với
findings đã biết** (MinIO url rỗng + RBAC round-trip 400 nếu seed lại tạo url rỗng).
Với SF-2, exit-6-có-findings-được-báo-ĐÚNG = **ACCEPTANCE thỏa** (mechanism hoạt động,
finding minh bạch bàn giao SF-4). Exit 0 là kết quả mong đợi nếu seed tạo image url
hợp lệ — KHÔNG bẻ cong probe để đạt exit 0.

## 5. Impl outline — 11 tasks (bracket)

1. harness-skeleton-stages-timestamps — khung 7 stage + log + exit-code convention
2. safety-gate-confirm-disk-ram-demo-idle — GATE đầy đủ
3. pg-dump-backup-restore-test-throwaway-db — BACKUP + restore-test per-DB
4. stage-down-v
5. stage-build-serialized-stack-down + daemon-wedge detect/resume
6. stage-up-health-gates-tiers — infra → JVM → FE → gateway
7. stage-seed — assert XONG
8. stage-probes — image/login/cart/events/RBAC hardcoded
9. stage-port-owner-check-stale-env
10. makefile-target + gitignore backups/ + README runbook
11. dry-run 1 lần toàn bộ + đo thời gian → report-sf2.md

Tasks 1-9 = 1 file `fresh-boot-harness.sh` (song song KHÔNG có nghĩa — cùng file;
thực thi tuần tự inline theo stage). Task 10 = Makefile/gitignore/README. Task 11 =
chạy thật + report.

## 6. ACCEPTANCE (từ pack — khung cứng)

1. `QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot` chạy trọn 7 stages 1 lệnh, log timestamp
   từng stage, tổng thời gian ghi rõ.
2. Thiếu confirm flag → refuse exit 3 (không đụng gì); demo-idle detect stack đang chạy
   → refuse.
3. Backup 9 DB tồn tại + restore-test pass vào throwaway DB (không chỉ gunzip).
4. Sau harness: :8080 health UP, seed XONG (login + cart + admin API 200), 1 ảnh MinIO
   200 (fail = finding minh bạch), events API 200, RBAC spot-check đúng.
5. Port-owner check: không process lạ giữ :3000/:5173/:5175-78/:9099.

Chấp nhận exit-code: AC1-3 cần exit-path sạch; AC4/AC5 thỏa khi harness báo ĐÚNG verdict
từng probe (exit 0 hoặc exit 6 với findings minh bạch — xem Dry-run semantics).

## 7. Risks

- Disk 31GB free vs threshold 20GB — sát nhưng pass; build cache 13GB reclaimable nếu cần.
- Backup 9 DB trên demo 6h — kích thước nhỏ (dữ liệu demo), restore-test per-DB tốn phút.
- FE probe qua gateway route phụ thuộc gateway-routes.yml hiện tại (chỉ đọc — nếu route
  đổi giữa chừng probe fail minh bạch, không âm thầm).
- Build daemon wedge — đã có detect + resume path (marker-wiped bắt buộc).
- mongodata/miniodata MẤT VĨNH VIỄN khi wipe (không backup) — consent đã liệt kê;
  gate in blast-radius per-volume; runbook ghi rõ không recover được từ backup.
- Log `/tmp` bị macOS dọn định kỳ — report-sf2.md inline các đoạn log then chốt.
- Sau dry-run: stack fresh + seeded (SF-3 chạy trên env này — coordinator giữ sống).
