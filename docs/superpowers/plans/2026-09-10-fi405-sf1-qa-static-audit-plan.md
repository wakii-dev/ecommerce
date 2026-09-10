# SF-1 qa-static-audit (FI-405) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / task-executor briefing. Steps dùng checkbox (`- [x]`) — tick + commit mỗi task xong. Meta-steps (review/merge/gate/Done) = numbered list KHÔNG checkbox (Task M cuối).

**Goal:** Xây detector TĨNH bắt 5 lớp bug tích hợp đêm 9/9 (LOG_URI gateway 500 · JWT keys mount crash · max_connections seed fail · ordering re-price 401→502 · variant-less kẹt checkout — 2 lớp cuối do SF-3 specs phủ) TRƯỚC khi nổ fresh-boot: `make qa-audit` <5 phút non-destructive chạy được mọi lúc — config-audit 3 trục (env var · volume mount · compose value) classify machine-checkable + s2s auth matrix path-granularity STATIC + RBAC expected matrix đóng + contracts freshness probe. Exit: 0 = 0 finding CHƯA fix · 1 = có finding chưa fix · 2 = script error.

**Architecture:** 4 script node-stdlib `.mjs` (dep freeze — không yaml lib, hand-rolled line-level parse; precedent 10+ scripts/qa/*.mjs) + fixture files + 1 report marker-based (`docs/superpowers/qa/report-sf1.md` — mỗi script regen marker block riêng, idempotent re-run) + Makefile append CUỐI + README section CUỐI (SF-2 viết section fresh-boot riêng — bracket phân vùng). Scripts KHÔNG đọc `.env`; mọi var name match `/PASS|SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE/i` in `«masked»` trong report (chỉ tên var + SET/UNSET/default-shape).

**Tech Stack:** node >= 18 stdlib (`node:fs`/`node:path`), regex extract `${VAR:default}` + `@Value`, line-level YAML subset parser (fail-loud → exit 2), make target. KHÔNG docker, KHÔNG HTTP, KHÔNG runtime — static file reads.

**Linear Issue:** FI-405 · **Worktree:** `wakii-dev/sf-1-qa-static-audit` · **Đích merge:** `story/fi404-qa-sweep` (merge dest vào sf-branch trước → no-ff + update-ref FULL refname + ancestor guards; smoke `make qa-audit` trên merged tree trước update-ref).

**Nguồn sự thật:** context pack `docs/superpowers/contexts/fi404-sf-1.md` **gồm Amendment 1 (A1–A12) @ `32859aa`** (spec-critic round 1 — WARN non-finding + alias-equivalence OK + pair := (client class, endpoint path) + closed lists) · bracket `docs/superpowers/brackets/fi404-qa-sweep.md` · epic spec `2026-09-10-qa-sweep-design.md` §0/§1-SF-1/§2/§6.

**Spec clarifications ĐÃ chốt (không mở lại):** Amendment 1 A1–A12 trong context pack là phần của spec slice. Epic FI-404 đã notify REQUIREMENT-GAP (2 ý + defaults) — non-blocking.

---

## 0. Root cause analysis (WHY)

### Root cause
5 lớp bug 9/9 chỉ lộ ở fresh-boot/env-drift vì không có detector tĩnh nào so code-read ↔ compose cung cấp: code đọc `${LOG_URI:http://localhost:8088}` (container không tới được localhost → gateway 500), service cần `/keys/jwt-public.pem` mà compose thiếu mount → boot crash, postgres default `max_connections=100` < 11 JVM pools → seed 53300. e2e trên env đã-cấu-đúng là mù với lớp lỗi này.

### Current state (đã verify 10-09)
- Compose hiện tại ĐÃ fix 3 pattern: `max_connections=300` (dòng 13), `./infra/keys:/keys:ro` × 5 services, `LOG_URI` set (dòng 473) → real-run phải ra OK cho 3 pattern này; finding mới (nếu có) = giá trị thật cho SF-4.
- 23 file backend chứa HTTP client code; SecurityConfig lambda-DSL chuẩn (`requestMatchers(...).permitAll()/hasRole("ADMIN")/authenticated()`) — parse tĩnh được; 12 admin controllers; 69 `@Value` sites; contracts/openapi/*.yaml × 10 services.
- scripts/qa/ precedent: node-stdlib `.mjs`, exit 0/1, tiếng Việt comment.

### Expected outcome
`make qa-audit` 1 lệnh: report classify 3 trục + 2 matrix đóng, exit-code đúng semantics, fixture-negative chứng minh detector BẮT ĐƯỢC class bug (không phải detector trang trí).

### Constraints & hardships
- Dep freeze; service code + compose READ-ONLY; không HTTP probe; không fresh-boot; Makefile/README chỉ append cuối (SF-2 chung vùng khác); bug-register.md = SF-4.
- Không yaml lib → parser tự viết, fail-loud.
- Secret masking bắt buộc (compose nhúng default password `NotifySvc#2026` + STRIPE từ .env).

### High-level strategy
3 executor SERIAL cùng worktree (tránh commit-race — shared-worktree lesson): A = config-audit (T1–T5, T9) → review round 1; B = 2 matrix (T6–T8); C = contracts probe + Makefile/README + real run (T10–T11) → review round 2 full-diff → verifier/security-audit → merge → gate. Bridge 3 task DAG SKIP: single-writer serial + Linear FI-405 + plan file này là task tracking (deviation khai báo — SF 11 tasks nhưng độc lập module, không cần DAG runtime).

## 1. Problem
Detector tầng rẻ thiếu: bug lớp 1 (config drift) + lớp 2 (s2s auth) chỉ phát hiện được khi chạy runtime tốn kém (fresh-boot gated, backup bắt buộc) — phải có static audit chạy mọi lúc kể cả đang demo.

## 2. Scope
- **In:** 11 task bracket + real-run evidence + review/merge/gate (Task M). Files: `scripts/qa/config-audit.mjs`, `scripts/qa/s2s-auth-matrix.mjs`, `scripts/qa/rbac-matrix.mjs`, `scripts/qa/contracts-freshness.mjs`, `scripts/qa/fixtures/**`, `scripts/qa/config-audit-fixed.json`, `docs/superpowers/qa/report-sf1.md`, Makefile (append cuối), README (append cuối).
- **Out:** sửa service code/compose/gateway (fix = SF-4); bug-register.md; harness runtime (SF-2); journey specs (SF-3); contracts/ sửa (chỉ finding); dep mới; merge main.
- **Success criteria:** từng dòng ACCEPTANCE pack fi404-sf-1 (5 dòng, đọc theo Amendment 1) — verify Phase 5 từng dòng, không tick khi chưa thấy.

## 3. Touch map
**Create:** 4 script + `scripts/qa/fixtures/` (mini backend tree + 3 compose fixture per trục) + `scripts/qa/config-audit-fixed.json` + `docs/superpowers/qa/report-sf1.md`.
**Modify:** `Makefile` (append CUỐI — target `qa-audit`), `README.md` (append CUỐI — section QA tham chiếu ngắn ≤ 6 dòng).
**READ-ONLY:** `backend/**` (application*.yml, @Value, SecurityConfig, controllers, client classes), `docker-compose.yml`, `backend/gateway/src/main/resources/routes/*.yml`, `contracts/openapi/*.yaml`.
**Consumers/regression:** SF-4 gọi `make qa-audit` + parse finding IDs; SF-2 README section kề bên; scripts/qa scripts cũ KHÔNG đụng.

## 4. Design

- **config-audit.mjs** — flags: `--compose <path>` `--backend <dir>` `--routes <dir>` `--report <path>` `--self-test` (default: repo thật). Trục (a): extract `${VAR:default}` từ `backend/services/*/src/main/resources/application*.yml` + `backend/gateway/src/main/resources/application*.yml` + **`backend/gateway/src/main/resources/gateway-routes.yml` (spring.config.import — chứa LOG_URI:133, CATALOG_URI:47/51, NOTIFICATION_URI:107)** + MỌI `routes/*.yml` (A4) + `@Value("${...}")` annotations; parse compose `environment:` map-style; classify A1: DANGEROUS = default `localhost|127.0.0.1` + service có compose entry + compose không set var; OK = compose set + (alias-equivalence: cùng port + host là compose service name | trùng default) ; WARN = set nhưng lệch port/path/host lạ (WARN non-finding). FE-host whitelist operationalized: default match `:3000|:5173` HOẶC var name match `VITE_|STOREFRONT|SHELL` → không flag. Trục (b): với mỗi service, env path (code default + compose env) phải prefix-match 1 volume container-target của chính nó; code cần path + không env + không volume → DANGEROUS; volume có nhưng path lệch target → DANGEROUS; host-relative default (`../infra/keys`) chuẩn hóa basename trước match. Trục (c): closed checklist — `max_connections ≥ 110`, healthcheckPresent per JVM service, flag ngoài bảng constant → WARN. FIXED registry `config-audit-fixed.json`: `{id, evidence, date}` — ID match → status FIXED (không ảnh hưởng exit).
- **s2s-auth-matrix.mjs** — enumerate client class + call sites (path granularity, A2): grep `RestClient|WebClient|RestTemplate` + URI template + base-url property (`${X_URI:...}` / `@Value` / yml property) resolve vào compose service (A3 loại infra/third-party); verdict data curated embedded (mỗi pair: destination guard từ SecurityConfig + token attach từ client code + evidence `file:line` cả 2 phía); drift check: call-site enumerate ↔ matrix rows lệch nhau → GAP; verdict A5: EXPECTED_OK / DANGEROUS (path cần auth, client không gắn token) / GAP (không resolve tĩnh — reason; GAP = finding). Bảng markdown ≥ 23 pair.
- **rbac-matrix.mjs** — closed list = static scan `hasRole("ADMIN")`/`hasAuthority` SecurityConfigs + `@PreAuthorize` + admin controllers mappings (A8); cells guest→expect 401, user→403, admin→2xx; rows ≈ 12 controllers ~40 endpoints × 3 roles; drift (controller mới scanner không map được) → GAP.
- **contracts-freshness.mjs** — `contracts/openapi/*.yaml` paths+methods vs `@*Mapping` per service; stale hai chiều → finding `CT-xx` (không tự sửa).
- **Exit semantics chung (cả 4 script):** 0 = 0 unfixed finding; 1 = ≥1 unfixed (GAP/DANGEROUS/CT); 2 = script error (parser fail-loud, throw → catch → stderr + exit 2). `make qa-audit`: chạy đủ 4 script (không stop sớm), exit = max, in legend.
- **Report marker-based:** `docs/superpowers/qa/report-sf1.md` có `<!-- sf1:<section> -->` blocks (summary, axis-a, axis-b, axis-c, s2s, rbac, contracts); mỗi script regen block riêng (read → replace → write, idempotent). **Ownership tách 2 tầng:** config-audit viết summary = counts riêng của nó + legend; **exit-table 4 script do recipe `make qa-audit` ghi vào summary block SAU KHI đủ 4 exit** (script standalone không biết exit của script khác — không fabricate). Secret masking mọi chỗ in giá trị.
- **--self-test (T9):** chạy detector trên `scripts/qa/fixtures/` (mini backend tree + compose fixtures THIẾU env / THIẾU keys mount / max_connections=100) — assert finding IDs kỳ vọng xuất hiện (≥1 DANGEROUS per trục), exit 0 pass / 1 fail; KHÔNG đụng compose thật.
- **Edge cases:** inline `#` comment trong compose env value → strip cẩn thận; block scalar compose (một chỗ) → parser skip an toàn; var set rỗng (`${STRIPE_SECRET_KEY:-}` compose value rỗng) = "set rỗng" riêng với UNSET; module→compose-name map constant (`ordering-service` ↔ compose `ordering-service`, URI var `ORDERING_URI`).

## 5. Implementation outline

### Task 1 — config-audit trục (a) extract env từ code (executor A)
- [x] Extract `${VAR:default}` từ `backend/services/*/src/main/resources/application*.yml` + `backend/gateway/src/main/resources/application*.yml` + **`backend/gateway/src/main/resources/gateway-routes.yml`** (LOG_URI:133 — spring.config.import) + MỌI `routes/*.yml` (A4) + `@Value("${VAR:default}")` annotations (regex, skip comment dòng) → model `{service, var, default, sourceFile:line}`
- [x] Compose env parse line-level (map-style; strip inline `#`; skip block scalar an toàn)
- [x] Chạy tay trên repo thật — cột service × var in ra hợp lý (spot-check LOG_URI, SPRING_DATASOURCE_URL, JWT_PUBLIC_KEY_PATH)

### Task 2 — trục (b) volume mounts drift (executor A)
- [x] Collect path service đọc lúc boot: env có value shape path (`/...`, `./...`, `*.pem`, `*keystore*`) + `@Value` path defaults
- [x] So compose `volumes:` container-target prefix-match (A6) — thiếu mount → DANGEROUS, path lệch target → DANGEROUS, host-relative normalize basename
- [x] Spot-check identity (`/keys/jwt-private.pem` ↔ `./infra/keys:/keys:ro`) = OK

### Task 3 — trục (c) compose value drift closed checklist (executor A)
- [x] Checklist A7: max_connections ≥ 110 · healthcheck per JVM service · bảng flag constant + rationale
- [x] Spot-check: postgres 300 = OK; flag ngoài bảng → WARN non-finding

### Task 4 — classify rule machine-checkable + FIXED registry (executor A)
- [x] Classify A1 trục (a): DANGEROUS/OK-alias-equivalence/WARN — WARN non-finding; FE-host whitelist
- [x] `scripts/qa/config-audit-fixed.json` schema `{findings:[{id, evidence, date}]}` + merge vào classify (status FIXED)
- [x] Finding IDs ổn định A11 (`CFG-A-01`… theo var; `CFG-B-xx`; `CFG-C-xx`) — deterministic ordering

### Task 5 — exit-code + report-sf1.md skeleton (executor A)
- [x] Exit semantics 0/1/2 chung; `--report` regen marker blocks (summary + axis-a/b/c)
- [x] Tạo `docs/superpowers/qa/report-sf1.md` skeleton + markers (s2s/rbac/contracts block để trống chờ script B/C)
- [x] Real-run lần 1: exit + summary đúng (LOG_URI/keys/max_connections = OK; DANGEROUS nếu có = finding thật)

### Task 6 — s2s inventory enumerate clients path-granularity (executor B)
- [ ] Grep client classes + call sites; resolve base-url → compose service; loại trừ A3; map module→compose name constant
- [ ] Đếm path-granularity — nếu < 23: report con số THẬT + flag epic (KHÔNG pad pair external)

### Task 7 — s2s expected-verdict matrix static (executor B)
- [ ] Curated verdict mỗi pair: destination guard (SecurityConfig matcher match path — Ant-pattern đơn giản) + token attach (client code) + evidence file:line 2 phía. **Destination KHÔNG có SecurityConfig + KHÔNG có spring-security starter (notification/payment/template — đã verify) → guard = permitAll (ghi note trong matrix), KHÔNG GAP** (gateway front door enforce)
- [ ] Verdict A5 EXPECTED_OK/DANGEROUS/GAP; drift check enumerate↔rows
- [ ] Bảng markdown regen marker block `s2s` trong report

### Task 8 — RBAC expected matrix closed list (executor B)
- [ ] Scan SecurityConfigs `hasRole`/`hasAuthority` + `@PreAuthorize` + 12 admin controllers mappings (A8)
- [ ] Matrix rows endpoint × guest/user/admin expected (401/403/2xx) — đóng, không "..."
- [ ] Regen marker block `rbac` + drift → GAP

### Task 9 — --self-test fixture negative (executor A, sau T4)
- [x] Fixtures: mini backend tree (2 service: 1 đọc `${LOG_URI:http://localhost:8088}`, 1 đọc `/keys/jwt-public.pem`) + 3 compose fixture (thiếu env / thiếu keys mount / max_connections=100) trong `scripts/qa/fixtures/`
- [x] `--self-test`: chạy cả 3 trục trên fixtures, assert IDs kỳ vọng (≥1 DANGEROUS per trục), exit 0/1; KHÔNG đụng compose thật
- [x] Chạy `--self-test` thật — output trong terminal evidence

### Task 10 — Makefile target + README ref (executor C)
- [ ] Append CUỐI Makefile: `qa-audit` chạy 4 script (không stop sớm, exit = max, in legend) + **ghi exit-table 4 script vào summary block report** (P1 plan-critic — script standalone không biết exit nhau); comment giải thích semantics; **KHÔNG đụng dòng `.PHONY` (dòng 9) — append-only constraint, ghi comment note chủ đích**
- [ ] Append CUỐI README: section QA ngắn ≤ 6 dòng (make qa-audit + report path + exit semantics — đây là "tham chiếu" theo bracket; SF-2 viết section fresh-boot RIÊNG sau này, không đụng section này)

### Task 11 — contracts freshness probe + real run (executor C)
- [ ] `scripts/qa/contracts-freshness.mjs`: openapi paths+methods vs controllers per service; **map constant yaml→module: `invoice.yaml` → ordering-service (invoice controllers sống trong ordering — không có dir invoice-service)**, còn lại 1:1 theo tên; stale → CT-xx finding; regen marker block
- [ ] `make qa-audit` REAL RUN — evidence raw output (exit code + counts + time < 5 phút); commit `report-sf1.md` kết quả thật

### Task M — Review + verify + merge + gate (coordinator — meta-steps, KHÔNG checkbox)
1. code-reviewer round 1 (diff executor A: T1–T5+T9) → fix nếu CHANGES-REQUESTED
2. code-reviewer round 2 (full diff SF: T6–T11 + Makefile/README) — verdict literal `VERDICT: APPROVED|CHANGES-REQUESTED|REJECT` post lên FI-405 (B3 story-verify cần literal)
3. security-audit trên full diff: secret leak từ compose/.env vào report/script output? → FINDINGS/NONE
4. verifier độc lập: từng dòng ACCEPTANCE pack (5 dòng, theo Amendment 1) → PASS/PARTIAL/FAIL
5. Coordinator Rule-0 re-run: `make qa-audit` + `--self-test` tự chạy thấy output (không tin report executor)
6. Merge: dest `story/fi404-qa-sweep` vào sf-branch trước (ancestor check) → temp-worktree merge no-ff → smoke `make qa-audit` trên merged tree → update-ref FULL refname CAS + ancestor guards → audit comment merge-hash FI-405
7. GATE CỨNG `ORCA_BIN=/usr/local/bin/orca ~/.claude/bin/story-verify sf-1` sạch → FI-405 Done (sau merge) + report tóm tắt lên epic FI-404

## 6. Risks & unknowns
- **Extraction-scope drift (plan-critic P0 round 1):** file-list grep của mỗi task phải là UNION của context-pack slice + Amendment A-refs — check trước real-run (vd T1 từng thiếu root `gateway-routes.yml` — file LOG_URI flagship; đã fix trong plan).
- **Parser YAML thủ công:** shape lạ → fail-loud exit 2 là ĐÚNG (không đoán) — fix parser, không nuốt lỗi.
- **s2s curated verdicts sai thực chất** (static ≠ runtime): matrix là EXPECTED — live execute là SF-2 harness + SF-4; sai → finding thật khi triage, không phải lỗi detector.
- **Path-granularity < 23:** không pad — report thật + epic flag (A2 đồng ý định nghĩa, không đồng ý bịa).
- **RBAC scan trật controller** (annotation lạ): drift → GAP liệt kê, không im lặng.
- **make qa-audit exit 1 trên main-state:** nếu finding thật tồn tại — ĐÚNG semantics (SF-4 triage); ACCEPTANCE chỉ require 3 pattern đã-fix = OK.
- **Commit race SF-2 worktree:** SF-2 không đụng scripts/qa/file này (bracket phân vùng); Makefile/README append cuối — merge tuần tự SF-1 trước SF-2 xử lý phần còn lại.
