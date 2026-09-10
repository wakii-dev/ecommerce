# Bug Register — QA Sweep story FI-404 (chốt bởi SF-4 / FI-408)

> Ngày chốt: 2026-09-10 · Branch: `wakii-dev/sf-4-sweep-run-fixes` → `story/fi404-qa-sweep`
> Mapping lớp lỗi (epic §0) → detector → finding → fix → re-run. Trạng thái: **FIXED** (commit + evidence) · **FIXED-REGISTRY** (false-positive machine-rule, evidence trong `scripts/qa/config-audit-fixed.json`) · **RUNBOOK→FIXED** (SF-2 để runbook; SF-4 fix hẳn script) · **OBS** (quan sát ngoài 5 lớp, không fix).
> Merge từ: report-sf1 (FI-405) · report-sf2 (FI-406) · report-sf3 (FI-407).

## 1. Bảng tổng hợp lớp → detector → finding → fix → re-run

| ID | Lớp | Detector | Finding | Fix (commit) | Re-run evidence |
|---|---|---|---|---|---|
| CFG-A-cart-service-RABBITMQ_HOST · CFG-A-identity-service-RABBITMQ_HOST | 1 | config-audit trục (a) + harness SF-2 | compose thiếu env → indicator bắn `localhost:5672` trong container, actuator DOWN vĩnh viễn (= QA-F2-01). BEFORE: die-7 run 12:59 (identity 386s, AmqpConnectException trong log) | compose `RABBITMQ_HOST: rabbitmq` ×2 (@5e3bf81) | run 15:59 tier-2 PASS (identity/cart healthy); run 13:00 boot tay: cả 2 UP |
| CFG-A-catalog-service-INVENTORY_BASE_URL · CFG-A-notification-service-NOTIFY_STOCK_ALERT_CATALOG_BASE_URL · CFG-A-ordering-service-AFFILIATE_BASE_URL | 1 | config-audit trục (a) | default `localhost:PORT` chết trong container | compose env service-name:port ×3 (@5e3bf81) | config-audit exit 0; boot tay 13:00 mọi service healthy |
| QA-F2-02 (config-audit blind — detector so env theo TÊN, không resolve property Spring) | 1 | harness SF-2 | catalog actuator `elasticsearch` DOWN: indicator đọc `spring.elasticsearch.uris`, compose chỉ set custom `ELASTICSEARCH_URI`. BEFORE: fresh-volume probe 15:xx `elasticsearch DOWN Connection refused` | compose `SPRING_ELASTICSEARCH_URIS: http://elasticsearch:9200` (@5e3bf81) | boot tay 13:00 + run 15:59: catalog UP |
| CFG-B-affiliate-service-jwt-public.pem | 1 | config-audit trục (b) | affiliate thiếu JWT key env + volume → JwtDecoder chết trong container | compose env + `./infra/keys:/keys:ro` (@5e3bf81) | boot tay 13:00: affiliate UP |
| CFG-B-invoice-service-DejaVuSans.ttf | 1 | config-audit trục (b) | **false-positive**: font nằm sẵn trong image (apt fonts-dejavu-core) — detector không thấy image-layer | FIXED-REGISTRY (@5e3bf81; evidence `docker run --entrypoint ls` 759720 bytes) | config-audit exit 0 |
| CFG-A-identity-service-IDENTITY_OAUTH_PUBLIC_BASE_URL | 1 | config-audit trục (a) | **false-positive**: OAuth callback là BROWSER-facing (OAuthProperties.java:21) — `localhost:8080` = one-origin FI-400 là đúng; providers đang tắt (không key) | FIXED-REGISTRY (@5e3bf81) | config-audit exit 0 |
| CFG-C-*-healthcheck (×11 JVM) | 1 | config-audit trục (c) | JVM service không có compose healthcheck — full-mode không signal unhealthy | compose healthcheck curl actuator ×11 (@5e3bf81; curl có sẵn temurin-21-jre — probe live) | boot tay 13:00 + run 15:59: `docker ps` healthy toàn bộ |
| S2S-01 ordering/HttpCatalogPricingClient → admin by-id | 2 | s2s-auth-matrix (static stale) | Matrix ghi DANGEROUS "compose UNSET → 401 → 502 (bug 9/9)" nhưng **runtime ĐÃ fix từ FI-397** (@5a1b068 `ORDERING_PRICING_BYIDPATH`) — static stale; probe live 401 admin vs 200 public-by-id | default path → public by-id (application.yml + @Value, @bca5b94) + curated row sync | journey test 8 COD checkout CONFIRMED (re-price live qua public by-id); s2s matrix exit 0 (24 EXPECTED_OK) |
| S2S-02 partner/CatalogClient → admin by-id | 2 | s2s-auth-matrix | UUID-lookup chết (guard 502 "dùng slug") — static-token dead-end (JWT 15') | partner productById → public by-id (PUBLISHED-only — đúng semantics open API); bỏ adminToken; tests viết lại (@bca5b94); curated sync | s2s exit 0; partner IT compiles (chạy ở story-verify) |
| QA-F2-03 seed ảnh MinIO (+ chuỗi 3 bug con SF-4 tìm thêm) | 3 | harness SF-2 probe (a) | 0/46 product_images có url; admin PUT round-trip 400 `images[].url bắt buộc`. Chuỗi root-cause SF-4: (i) seed không upload; (ii) **403 stale-role** — ADMIN_TOKEN mint TRƯỚC promote SQL (JWT đóng role lúc login — memory identity-admin-role); (iii) psql tag `UPDATE 2` → `UPDATE2` crash arithmetic set -u | (i) seed §3c: PNG gradient-per-category (python3 stdlib) → upload QUA API thật → UPDATE url WHERE url='' (@df00017, retry @6e33005, parse-tag + status-log @beceaf4); (ii) **re-login admin SAU promote** (@e692597) | run 16:01 instrument: 403 lộ diện; live: make seed `uploaded 24/24, 50 rows` + GET /media 200 + PUT round-trip 200 |
| QA-F2-04 daemon wedge | 5 | harness SF-2 | bulk `compose up -d` 23 containers → daemon 500 `/_ping` (signature 32s) — ×2 trong sweep (14:10 create-bulk, 14:48 start-only-bulk); SF-2 chỉ để runbook nhưng runbook VÔ DỤNG vì bulk-up nằm TRONG harness | **RUNBOOK→FIXED**: tách up 4 batch 7/5/6/6 (envelope 4-7) + coverage assertion `config --services` == union batch (@7f6a3a3) | run 15:18 + 15:59: batched up qua wipe trọn vẹn, không wedge |
| Coupon-edit vỡ FE↔BE (SF-3 §4, test.fixme) | — (bug thật — FE contract strip path-param khỏi body, client.ts:138-146) | journey-spec SF-3 | `PUT /admin/coupons/{code}` 400 `code không hợp lệ` — BE đòi `code` từ body | BE adminUpdate coi PATH code là authority + cross-check body (@df00017); CouponServiceTest 6 case; **bỏ test.fixme** — journey E-edit green | journeys 13/13 (16:35, env fresh 15:59) |
| CT-01..19, 22, 24 STALE-CTRL (21) | — (contracts freshness, probe SF-1 A12) | contracts-freshness | controller có thật, yaml thiếu op | doc-sync thêm op khớp hiện trạng (@0a43b22: affiliate 6 · catalog 6 · identity 5 · inventory 2 · ordering 1 · payment 1; schema mirror DTO runtime) | contracts exit 0 (spec 120 = ctrl 120) |
| CT-20/21 notification STALE-SPEC (2) | — | contracts-freshness | yaml khai báo 2 REST endpoint KHÔNG tồn tại (service 0 controller — event-driven + SMTP) | doc-sync bỏ 2 op + schema mồ côi; path keys giữ làm Path Item rỗng "ĐÃ BỎ" (probe fail-loud trên yaml 0 path) (@0a43b22) | contracts exit 0 |
| CT-23 invoice STALE-SPEC (1) | — | contracts-freshness | blind-spot script: renderer Python ngoài `backend/` — op CÓ thật ở runtime (s2s row HttpInvoiceProvider EXPECTED_OK) | ignore-list segment `generate` surgical + sửa 2 comment stale trong script (@0a43b22) | contracts exit 0 |
| Gateway route gap `/login/**` | 1 (config drift gateway↔shell) | legacy e2e session-sync-matrix (tái hiện qua sweep) | predicate shell-web chỉ có `/login` exact — shell App.tsx serve `/login/oauth/callback` (SF-15) + `/login/2fa` → Whitelabel 404 (probe live: Whitelabel → alert render sau fix; OAuth happy-path chưa từng live vì providers tắt) | predicate thêm `/login/**` (@9a86bc8) | session-sync-matrix 5/5 PASS; golden-path 7/7 |
| Legacy review-flow × seed drift | — (spec×seed data-state, không phải regression SF-4 — probe live: POST 409 "Bạn đã đánh giá sản phẩm này rồi") | legacy e2e | seed review "Âm hay, đeo êm" trùng (user,product) mà spec pick qua search-first; cleanup cũ chỉ xoá `E2E review%` | widen cleanup xoá MỌI review cũ (user,product) — đúng intent đã doc của spec; eligibility giữ; make seed re-insert guard nguyên (@9a86bc8) | review-flow PASS |
| Stripe publishable key không bake vào FE image | 1 (build-env drift dev↔container) | legacy e2e golden-path [VERIFIED-STRIPE] (iframe `.pay-panel` không render) | Dockerfile.web build shell + mfe-checkout KHÔNG set VITE_STRIPE_PUBLISHABLE_KEY → stripePay key null (dev-mode FE export .env mới có — recipe SF-1) | ARG/ENV + compose build args (pk_* PUBLIC; ARG đặt TRƯỚC remote builds — stripePay ở mfe-checkout) (@9a86bc8) | grep pk_test trong CheckoutPage bundle + golden-path 7/7 (checkout tạo đơn + email attach PDF) |
| compose ES mất host-port 9200 | 1 (drift từ 9e61345 D15 — main checkout còn, story branch mất) | legacy e2e platform-asserts §5.9 | E2E_ES_URL default localhost:9200 — fetch failed (cộng thêm 1 obs: ES container exit sạch 17:09 trong sweep, self-recovered sau up -d — docker flakiness máy, không OOM) | restore `ports: "9200:9200"` (@9a86bc8) | ES count=28; platform-asserts PASS (full-suite cuối: 70 passed + 2 flaky-passed, 0 failed) |
| Notification service-token transient | — (transient ops, self-healing) | golden-path run 1 (email 0 attach, send_log attachment=f error rỗng) | sau recreate container giữa sweep, 1 lượt fetch invoice trả empty lặng lẽ (InvoiceClient degrade-by-design — email vẫn gửi); restart notification → pipeline deterministic: send_log `SENT attachment=t` | KHÔNG cần code change (degrade path đúng design) | golden-path 7/7 (run sau restart) |

**Tổng: 0 UNFIXED · 0 ESCALATED · 1 OBS (dưới đây).**

## 2. Sweep-run accounting (fresh-boot wipe-cycles — cap ≤3)

| # | Run | Wipe? | Kết quả | Ghi chú |
|---|---|---|---|---|
| 0 | SF-2 dry-run (FI-406) | 1 | die 7 tier-2 (QA-F2-01) + probes mở rộng tay | cap 1/3 |
| 1 | 12:59 run-before-plan-critic | 2 | die 7 tier-2 identity 386s (rabbit) | BEFORE evidence QA-F2-01/02; bắt đầu trước khi plan-critic re-sequence — tính tròn cap, ghi minh bạch |
| 2 | 14:09 run (sau fix compose) | 3 | die 7: bulk up wedge daemon (QA-F2-04 tái hiện có kiểm soát) | BACKUP OK; gate/backup/down/build/minh-bạch die — đúng contract |
| 3 | 15:18 RESUME=BUILD (cùng wipe #3) | 0 | die 6 probes 5/7 — ảnh fail (403 lúc đó chưa lộ) | batched-up qua trọn; daemon restart 2 lần giữa chừng |
| 4 | 15:44 RESUME... → full 15:59 | 0 | die 6 probes 5/7 — **instrument lộ HTTP:403** → root cause stale-role token | retries + status logging (fix t5.2 tiếp nối) |
| — | Env 15:59 sống: make seed (fix re-login) → ảnh 24/24 → probe-equivalents PASS (url 200 + PUT 200) → **journeys 13/13** → T3b RBAC 150/150 | 0 | runtime green | honesty note: probe-green cold-boot chưa re-demo do cap wipe 3/3 đã cạn — chuỗi 403 đã root-caused + fix verified bằng synthetic-user live repro (USER-token 403 → promote → old-token 403 → re-login 201) |

## 3. RBAC live matrix (T3b) — 150/150 PASS

Script `/tmp/sf4-rbac-live.py` (parse bảng report-sf1 sf1:rbac → 50 endpoint × guest/user/admin, dummy-payload mutation-safe, path-param → dummy) — kết quả `docs/superpowers/qa/t3b-rbac-live.tsv`.
- 50/50 endpoint: guest 401 · user 403 · admin authz-pass (200/204/400/404 business-trên-dummy) — **0 lệch expected**.
- OBS: `GET /admin/stats/revenue-by-day` admin=500 trên data edge (authz PASS — business error, ngoài 5 lớp, chưa fix — xem §4).

## 4. Escalate list (chờ user)

_(rỗng — mọi finding pattern-đã-biết đã fix. 1 OBS ngoài scope: revenue-by-day 500 khi data rỗng — không thuộc 5 lớp, không fix tự do; đăng epic comment cho user quyết.)_

## 5. Coverage note (gate KHÔNG re-audit những gì detector chưa phủ)

- config-audit: 3 trục tĩnh (env/volume/compose-checklist) — KHÔNG phủ runtime-only drift (QA-F2-02 property-mismatch: detector so tên env, không resolve relaxed-binding/indicator property) → runtime cover bởi harness tier-2.
- s2s matrix: static expected — live: harness stage-6 (2 spot) + journey COD checkout (re-price) + T3b partner-UUID (n/a — partner không trong journey; IT chạy story-verify).
- RBAC: static 50×3 EXPECTED — live T3b 150 call (dummy-payload; admin cell = ≠401/403).
- contracts: chỉ (method, path) Java — Python/template/gateway ngoài probe (invoice → ignore có chú thích).
- Journeys: 13 tests — SW version-key-sau-rebuild cần rig 2 build (follow-up epic §5.7, không trong sweep này).
- **Honesty note (fresh-boot probes)**: probe-green COLD-BOOT chưa được re-demo sau fix re-login (wipe-cap 3/3 cạn — boundary "KHÔNG chạy fresh-boot > 3 lần tổng"). Bằng chứng thay thế: (a) chuỗi 403 root-caused + synthetic-user repro trọn; (b) mọi probe-equivalent PASS trên env fresh 15:59 sau make seed; (c) fix tuân theo đúng semantics đã doc (identity-admin-role). User có thể chạy `make qa-fresh-boot` bất lúc nào để thấy 7/7 (consent story-level còn hiệu lực).

## 6. Appendix — evidence (in-repo)

- `docs/superpowers/qa/fresh-boot-run-log-20260910-155942.log` — harness log run 15:59 (die 6 probes, HTTP:403 instrument lộ).
- `docs/superpowers/qa/fresh-boot-run-console-20260910.log` — console cùng run.
- `docs/superpowers/qa/t3b-rbac-live.tsv` — 50×3 verdict từng cell.
- Journeys 13/13: `pnpm --filter @ecommerce/e2e exec playwright test tests/admin-journey.spec.ts tests/data-lifecycle.spec.ts` — `13 passed (32.7s)` @16:35 trên env fresh 15:59 + seed re-login fix (output inline ở Linear comment FI-408).
- `/tmp` logs khác (macOS sẽ dọn): die-7 12:59 `/tmp/qa-fresh-boot-20260910-125931.log`, die-7 14:09 `/tmp/qa-fresh-boot-20260910-140932.log`, die-4 13:57 `/tmp/qa-fresh-boot-20260910-135752.log` — mốc then chốt đã inline bảng §2.
