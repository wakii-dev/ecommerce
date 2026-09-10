# Report SF-2 — fresh-boot-harness dry-run (FI-406)

Ngày: 2026-09-10 · Worktree: `wakii-dev/sf-2-fresh-boot-harness` · Linear: FI-406
Log chính: `/tmp/qa-fresh-boot-20260910-084811.log` (run full từ zero) · `/tmp/qa-fresh-boot-20260910-094036.log` (resume sau keys fix) · `/tmp/qa-seed-manual-run.log` (SEED) · probes inline trong comment FI-406

## 1. Kết quả cơ chế harness (đã thấy chạy THẬT từng stage)

| Stage | Bằng chứng | Thời gian |
|---|---|---|
| GATE refuse không-flag | exit 3, "thiếu QA_FRESH_BOOT_CONFIRM=1", không đụng gì | 0s |
| GATE refuse stack sống | exit 3, liệt kê 23 containers + PID/port (log 084742) | 2s |
| GATE refuse TOCTOU/postgres test | exit 3 "compose ps trả về 1 container" (log 091120) | 0s |
| BACKUP 9 DB + RESTORE-TEST | 9 dumps `backups/qa-20260910-0848*/` (392B–14K) + 9/9 restore-test OK sanity row-count thật (log 084811) | ~35s |
| DOWN -v | 7 volumes removed, marker `.run/qa-fresh-boot-wiped`=20260910-084826, 0 containers còn | 0s |
| BUILD | compose build OK **390s** (nền + poll 30s, log 084811); cached 30s các run sau | 390s |
| UP TIER 1 infra | 7/7 healthy (postgres/redis/rabbitmq/mongo/es/minio/mailpit) có timestamp (log 092835: elapsed 82-83s) | 83s |
| UP TIER 2 JVM | **die 7 minh bạch** — identity actuator DOWN sau 431s + logs tail in rõ root cause (log 094036) | 431s |
| UP TIER 3 FE + gateway | gateway host `:8080/actuator/health` = **UP** (manual verify khi stack sống) | — |
| SEED | `make seed` rc=0 + marker `XONG — accounts: admin admin@demo.vn / user user@demo.vn` | — |
| PROBES (a) MinIO | **FINDING** — 0/46 product_images có url (fresh-seed) @10:02:14 | — |
| PROBES (b) login | admin@demo.vn 200 + accessToken (605 ký tự) | — |
| PROBES (c) guest cart | `POST /api/cart/items` **200** | — |
| PROBES (d) events API | `GET /api/log/admin/events` JWT admin **200** | — |
| PROBES (e) RBAC | guest PUT → **401** ✓ chặn; admin PUT round-trip GET→PUT → **400** `images[].url bắt buộc` (= finding #3 lộ); re-GET compare SAME (không mutate) | — |
| PROBES (f) port-owner | sạch — chỉ com.docker.backend giữ :8080 (docker passthrough) @10:02:36 | — |

Tổng thời gian run từ zero đến die-7 đầu tiên: **437s** (GATE 0s → BACKUP ~35s → DOWN 0s → BUILD 390s → UP die @431s poll).

## 2. FINDINGS — sản phẩm thật của dry-run (bàn giao SF-4 fix batch)

| # | Lớp lỗi | What | Root cause | Fix hướng |
|---|---|---|---|---|
| **QA-F2-01** | Config drift (compose) | identity + cart actuator **DOWN** vĩnh viễn container-mode | compose blocks identity/cart **thiếu** `RABBITMQ_HOST: rabbitmq` (8 service khác có) — indicator bắn `localhost:5672` trong container. Demo cũ không lộ vì chạy host-JVM (`make dev` — localhost đúng trên host) | thêm env 2 blocks (docker-compose.yml) |
| **QA-F2-02** | Config drift (Spring property) | catalog actuator DOWN vĩnh viễn ở component `elasticsearch` | health indicator = Spring Boot autoconfig client đọc default `localhost:9200`; custom property `elasticsearch.uri` KHÔNG map vào `spring.elasticsearch.uris` — business search vẫn OK (client riêng) | đặt `SPRING_ELASTICSEARCH_URIS` env hoặc `spring.elasticsearch.uris` trong yml |
| **QA-F2-03** | Data lifecycle (seed + MinIO-reseed) | 0 ảnh MinIO load được sau fresh-seed; admin PUT round-trip 400 `images[].url bắt buộc` | seed tạo 46/46 `product_images.url` = chuỗi rỗng; MinIO bucket không có ảnh seed (minio-init chỉ tạo bucket) | seed upload ảnh thật vào MinIO + ghi url `/media/...`; hoặc seed không tạo rows ảnh-rỗng |
| **QA-F2-04** | Operational (daemon) | `compose up -d` (bulk-create 23 containers sau wipe) giết Docker daemon 3/3 lần (`_ping` 500 → daemon chết); up **từng batch 2-4 containers** sống 9/9 batch; start-only (containers đã tồn tại) cũng OK | Docker Desktop wedge khi bulk-create đồng loạt — pattern "daemon wedge ×3" của máy này, giờ tái hiện có kiểm soát | runbook: khi exit 7 với daemon 500 → up từng batch nhỏ rồi `QA_FRESH_BOOT_RESUME=BUILD` |
| *(đã fix trong SF-2)* | Config drift (keys) | identity/catalog chết vì thiếu `/keys/jwt-private.pem` trên worktree mới | `infra/keys/` gitignored — harness giờ tự `make -s keys` trước up (@`d605bf1`) | DONE |

Đã xác minh KHÔNG phải harness bug: các 401/400/DOWN tái hiện bằng probe tay độc lập; sanity-map sai 2 bảng (payments/notifications) được R1 bắt + fix TRƯỚC dry-run.

## 3. Trạng thái stack sau dry-run (cho SF-3 ride)

- Infra 7/7 healthy · gateway :8080 UP · invoice healthy · 7/10 JVM actuator UP
- identity/cart indicator DOWN (QA-F2-01) nhưng **API serve bình thường** — login/cart/events 200 thật
- catalog indicator DOWN (QA-F2-02) — admin GET/PUT hoạt động (round-trip đã chạy)
- **Seeded**: seed XONG — admin/user demo, coupons, orders, 24 products, 31 stock variants
- Exit-7-fail-closed: harness die 7 TRƯỚC SEED là hành vi đúng contract; SEED+PROBES ở trên do coordinator chạy tay cùng lệnh để mở rộng chứng minh + giữ env sống cho SF-3. Sau SF-4 fix QA-F2-01/02 → harness run green toàn phần (SF-4 fresh-boot-run-1).

## 4. Ghi nhận đã biết (accepted debt)

- `RESUME=BUILD` skip-path chỉ code-inspect + sandbox (không exercised full vì marker cần run fail trước — đã có 4 resume thật giữa chừng daemon wedge: marker + skip BACKUP/DOWN chạy đúng).
- `UP_TOTAL_BUDGET=480` + TIER-3 `left=10` override — theo dõi khi run green.
- Log `/tmp` bị macOS dọn — báo cáo này inline các mốc then chốt.
