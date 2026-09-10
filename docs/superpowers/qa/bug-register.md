# Bug Register — QA Sweep story FI-404 (chốt bởi SF-4 / FI-408)

> Ngày chốt: 2026-09-10 · Branch: `wakii-dev/sf-4-sweep-run-fixes` → `story/fi404-qa-sweep`
> Mapping lớp lỗi (epic §0) → detector → finding → fix → re-run. Trạng thái: **FIXED** (commit + evidence) · **FIXED-REGISTRY** (false-positive machine-rule, evidence trong `scripts/qa/config-audit-fixed.json`) · **ESCALATED** (chờ user) · **RUNBOOK** (không fix code — quy trình).
> Merge từ: report-sf1 (FI-405) · report-sf2 (FI-406) · report-sf3 (FI-407).

## 1. Bảng tổng hợp lớp → detector → finding → fix → re-run

| ID | Lớp | Detector | Finding | Fix | Re-run evidence |
|---|---|---|---|---|---|
| CFG-A-cart-service-RABBITMQ_HOST · CFG-A-identity-service-RABBITMQ_HOST | 1 | config-audit trục (a) + harness SF-2 | compose thiếu env → indicator bắn `localhost:5672` trong container, actuator DOWN vĩnh viễn (= QA-F2-01) | compose thêm `RABBITMQ_HOST: rabbitmq` ×2 | run-1 tier-2 |
| CFG-A-catalog-service-INVENTORY_BASE_URL | 1 | config-audit trục (a) | default `localhost:8084` chết trong container | compose env service-name | run-1 |
| CFG-A-notification-service-NOTIFY_STOCK_ALERT_CATALOG_BASE_URL | 1 | config-audit trục (a) | như trên | compose env service-name | run-1 |
| CFG-A-ordering-service-AFFILIATE_BASE_URL | 1 | config-audit trục (a) | như trên — LoyaltyClient chết trong container | compose env service-name | run-1 |
| QA-F2-02 (config-audit blind — detector đọc nhầm property) | 1 | harness SF-2 | catalog actuator `elasticsearch` DOWN: indicator đọc `spring.elasticsearch.uris`, compose chỉ set custom `ELASTICSEARCH_URI` | compose `SPRING_ELASTICSEARCH_URIS: http://elasticsearch:9200` | run-1 tier-2 |
| CFG-B-affiliate-service-jwt-public.pem | 1 | config-audit trục (b) | affiliate thiếu JWT key env + volume → JwtDecoder chết trong container | compose env + `./infra/keys:/keys:ro` | run-1 |
| CFG-B-invoice-service-DejaVuSans.ttf | 1 | config-audit trục (b) | **false-positive**: font nằm sẵn trong image (apt fonts-dejavu-core) — detector không thấy image-layer | FIXED-REGISTRY (evidence `docker run --entrypoint ls` 759720 bytes) | config-audit exit 0 |
| CFG-A-identity-service-IDENTITY_OAUTH_PUBLIC_BASE_URL | 1 | config-audit trục (a) | **false-positive**: OAuth callback là BROWSER-facing (OAuthProperties.java:21) — `localhost:8080` = one-origin FI-400 là đúng; providers đang tắt (không key) | FIXED-REGISTRY | config-audit exit 0 |
| CFG-C-*-healthcheck (×11 JVM: gateway/identity/catalog/cart/inventory/ordering/payment/notification/log/partner/affiliate) | 1 | config-audit trục (c) | JVM service không có compose healthcheck — full-mode không signal unhealthy | compose healthcheck `curl -sf localhost:PORT/actuator/health` ×11 (curl có sẵn trong temurin-21-jre — probe live) | run-1 (`docker compose ps` healthy) |
| S2S-01 ordering/HttpCatalogPricingClient → GET /api/catalog/admin/products/{id} | 2 | s2s-auth-matrix (static stale) | Matrix ghi DANGEROUS "compose UNSET → 401 → 502 (bug 9/9)" nhưng **runtime ĐÃ fix từ FI-397** (@5a1b068 `ORDERING_PRICING_BYIDPATH` → public by-id) — static stale, probe live: admin 401 vs public-by-id 200 | default path → `/api/catalog/products/by-id/` (application.yml + @Value) + curated row sync; comment FI-310 cập nhật | run-1 journey checkout + T3b |
| S2S-02 partner/CatalogClient → GET /api/catalog/admin/products/{id} | 2 | s2s-auth-matrix | UUID-lookup chết (guard 502 "dùng slug") — static-token dead-end (JWT 15') | partner `productById` → public by-id (PUBLISHED-only — đúng semantics open API); bỏ adminToken branch; CatalogClientTest viết lại; curated row sync | run-1 + T3b partner UUID probe |
| QA-F2-03 seed ảnh MinIO | 3 | harness SF-2 probe (a) | 0/46 product_images có url sau fresh-seed; admin PUT round-trip 400 `images[].url bắt buộc` (form echo url rỗng) | seed.sh: generate PNG gradient-per-category (python3 stdlib) → upload QUA API `POST /admin/uploads` → `UPDATE product_images SET url` WHERE url='' (idempotent) | run-1 probe minio-image + journey PDP |
| Coupon-edit vỡ FE↔BE (SF-3 §4, test.fixme) | — (bug thật ngoài 5 lớp — FE contract strip path-param khỏi body) | journey-spec SF-3 | `PUT /admin/coupons/{code}` 400 `code không hợp lệ` — BE đòi `code` từ body, FE contracts client không gửi (client.ts:138-146) | BE `adminUpdate` validate PATH code (authority) + cross-check body; test cũ cập nhật; bỏ `test.fixme` SF-3 | run-1 journeys 13/13 |
| CT-01..19, 22, 24 STALE-CTRL (21) | — (contracts freshness, probe SF-1 A12) | contracts-freshness | controller có thật, yaml thiếu op | doc-sync: thêm op khớp hiện trạng (affiliate 6 · catalog 6 · identity 5 · inventory 2 · ordering 1 · payment 1) | contracts exit 0 |
| CT-20/21 notification STALE-SPEC (2) | — | contracts-freshness | yaml khai báo 2 REST endpoint KHÔNG tồn tại (service 0 controller — event-driven + SMTP) | doc-sync: bỏ 2 op + schema mồ côi, sửa description | contracts exit 0 |
| CT-23 invoice STALE-SPEC (1) | — | contracts-freshness | blind-spot script: renderer Python ngoài `backend/` (probe chỉ scan Java) — op CÓ thật ở runtime (s2s row HttpInvoiceProvider EXPECTED_OK) | ignore-list segment `generate` (surgical) + comment | contracts exit 0 |
| QA-F2-04 daemon wedge | 5 | harness SF-2 | bulk-create 23 containers sau wipe giết Docker daemon ×3 | RUNBOOK (SF-2): batch-up + `RESUME=BUILD` | n/a |

## 2. Sweep-run accounting (fresh-boot wipe-cycles)

| # | Run | Kết quả | Ghi chú |
|---|---|---|---|
| 0 | SF-2 dry-run (FI-406) | die 7 tier-2 (QA-F2-01) + probes mở rộng tay | cap 1/3 |
| 1 | SF-4 run trước plan-critic | die 7 tier-2 identity 386s — rabbit Connection refused | BEFORE evidence QA-F2-01/02 tái hiện trên branch này; bắt đầu TRƯỚC khi plan-critic re-sequence → tính ngoài cap 2 wipe còn lại, ghi minh bạch |
| 2 | run-1 (sau fix-batch-0) | _(điền sau)_ | cap 2/3 |
| 3 | run-2 (chỉ nếu batch-1 có finding) | _(điền sau — SKIP nếu run-1 green)_ | cap 3/3 |

## 3. RBAC live matrix (T3b) — kết quả

_(điền sau run-1: 50 endpoint × 3 vai — script /tmp/sf4-rbac-live.py, kết quả /tmp/sf4-rbac-live-result.tsv coppy vào appendix)_

## 4. Escalate list (chờ user)

_(điền — hiện rỗng nếu mọi finding pattern-đã-biết fix xong)_

## 5. Coverage note (gate KHÔNG re-audit những gì detector chưa phủ)

- config-audit: 3 trục tĩnh (env/volume/compose-checklist) — KHÔNG phủ runtime-only drift (vd QA-F2-02 property-mismatch: detector so env tên, không resolve Spring relaxed-binding/indicator property) → runtime cover bởi harness tier-2 gate.
- s2s matrix: static expected — live execute: harness stage-6 (2 spot-check) + T3b (re-price qua journey + partner UUID probe).
- RBAC: static matrix (50×3 EXPECTED) — live: T3b 150 call (dummy-payload; admin cell = ≠401/403 — business 400/404 với dummy là authz-pass).
- contracts-freshness: chỉ soi (method, path) Java — Python/template/gateway ngoài probe (invoice → ignore-list có chú thích).
- Journeys: 13 tests SF-3 — SW version-key-sau-rebuild cần rig 2 build (follow-up epic §5.7).

## 6. Appendix — evidence logs

_(điền: log run-1/run-2 copy từ /tmp — macOS dọn /tmp, in-repo theo plan-critic P1)_
