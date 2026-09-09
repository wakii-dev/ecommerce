# SF-5 convergence-qa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bằng chứng hợp nhất story FI-397 sau khi SF-1..4 merge về `story/fi397-unify-frontend` (`be9962c`): sync matrix 2 pages × 2 app (login/logout/2FA/OAuth + 20-run rotate-race), one-origin golden path qua entry dev kèm /admin layout riêng, 127-redirect matrix, e2e FULL (14 specs + sync-matrix mới), docker full regression isolated +400 (`fi397sf5`), gateway-routes regression, chrome cross-host visual consistency + theme legacy-key check, unit tests monorepo, perf sanity double-inclusion gate, walkthrough record + ADR roadmap migration (b). QA ĐỘC LẬP: sweep fail → fix-task về SF sở hữu, re-run cap 2 vòng — KHÔNG tự sửa code surface (trừ e2e specs + scripts QA + docs QA/ADR).

**Architecture:** 2 rig song song — **Rig A dev +400** (FE từ worktree này: Next entry :3400, shell :5573, remotes :5585/:5586/:5577/:5578; backend dùng chung gateway chính :8080 — hợp lệ vì diff backend fork→HEAD chỉ comment-only, sweep chứng minh) cho e2e suite + walkthrough; **Rig B docker full ISOLATED +400** (compose `fi397sf5` + override-sf2.yml có sẵn: gateway :8480, PG 5833, mailpit 8425 — prod-mode 1-origin nguyên trạng) cho sync-matrix proof + regression flow. Static sweeps (diff/unit) không cần rig.

**Tech Stack:** Playwright (browsers cached `chromium_headless_shell-1234`), node:crypto TOTP (không thêm dep), docker compose profile full, curl/lsof probes, vitest/turbo, grep/find+xargs (BSD grep multi `--include` false-negative — dùng find -print0 | xargs -0).

**Linear Issue:** FI-402 · **Worktree:** `wakii-dev/sf-5-convergence-qa` · **Đích merge:** `story/fi397-unify-frontend` (merge PARENT vào sf-branch trước → update-ref FULL refname + 2 ancestor guards; conflict improvements-log giữ CẢ HAI; no-ff; smoke golden-path sau merge).

**Nguồn sự thật:** context pack `docs/superpowers/contexts/fi397-sf-5.md` (master `56cd136`) · spec slice `docs/superpowers/specs/2026-09-09-fi397-sf5-convergence-qa-design.md` · bracket `docs/superpowers/brackets/fi397-unify-frontend.md` §SF-5 · epic spec `2026-09-08-frontend-unification-design.md` §7.

---

## 0. Root cause analysis (WHY)

### Root cause
4 SF (chrome / session-sync / 1-origin entry / wiring) phát triển trên rig riêng rồi merge tuần tự — merges cá nhân xanh ≠ hệ thống đồng bộ. Convergence gate là nơi duy nhất tất cả lớp verification (sync đa app, e2e full, docker prod-mode, visual 2 host) chạy TRÊN CÙNG code hợp nhất; history (FI-396, sf1-qa-suite-recipe) chứng minh vòng này mới lộ bug sống âm thầm (image build chết 5 SF, origin-allowlist 127.0.0.1, seed drift).

### Current state (đã verify 09-09)
- Worktree = story tip `be9962c`, tree sạch (trước spec commit `e854077`). SF-1 `304f266` / SF-2 `41e9083` / SF-4 `f5be01e` đã merge.
- Fork-point FI-390 = `a9a8fad`; diff backend/contracts = CHỈ gateway-routes.yml **comment-only** (`5e3d544`); pnpm-lock rỗng; nginx/compose sạch.
- Stack chính giữ :3000/:5173/:8080/:8025/:5433; toàn bộ +400 FREE. `.env` copy xong (3 Stripe gates thật). `infra/keys` sinh xong. Playwright browsers cached.
- auth-cookie.spec FI-399 đã có: login/logout/20-run sync trên SHELL (2 tab cùng app) — SF-5 bổ sung chiều × 2 app + 2FA + OAuth.

### Expected outcome
5 dòng ACCEPTANCE pack PASS (sync demo video + evidence; 1-URL golden path recordings; e2e FULL + unit xanh; docker regression + diff sạch + 127-matrix + no-double-bundle; ADR roadmap + walkthrough record).

### Constraints & hardships
- `contracts/**` + `backend/**` READ-ONLY; dep freeze; KHÔNG đụng gateway/nginx/compose (diff-check thôi); KHÔNG merge main.
- Sweep-fail code surface → fix-task epic gán SF sở hữu; cap 2 vòng; sau đó STOP + tổng hợp.
- Orca screenshot flaky → Playwright rig cho evidence; Rule 0: coordinator TỰ nhìn.

### High-level strategy
Static-first (T6 diff / T8 unit / sweep lock-backend chạy ngay không rig) ∥ docker build nền (T0, longest pole) → dev-rig boot (T0) → browser layer (T3 redirect matrix / T7 visual / T2 walkthrough Rule 0) → e2e layer (T1 sync spec trên dev-rig same-origin → T4 full suite; T1 chạy lại trên isolated khi rig B sẵn) → isolated layer (T5 regression :8480) → T9 perf build gate (SAU CÙNG — `next build` phá `next dev`) → T10 record + ADR + reports → T11 review/merge/gate. Execution SERIAL trên rig chia sẻ (shared-worktree + port lessons) — chỉ static sweeps chạy đầu; không parallel-executor trùng file.

## 1. Problem
Epic claim "frontend hợp nhất: 1 chrome + session tức thì + 1-origin" chưa có bằng chứng hợp nhất. Không gate = story Done trên bằng chứng mảnh — đúng pattern FI-187/UAT (tests xanh ≠ user dùng được).

## 2. Scope
- **In:** 10 task bracket + T0 rig + T11 review/merge/gate. Artifacts: `frontend/e2e/tests/session-sync-matrix.spec.ts`, `docs/superpowers/qa/*.md` + `walkthrough/`, `docs/adr/0009-next-migration-roadmap.md`, `scripts/qa/*` (nếu cần), fix selector trong e2e specs, epic comments.
- **Out:** sửa app/package code; backend/contracts/gateway/nginx/compose; feature mới; merge main.
- **Success criteria:** TỪNG dòng ACCEPTANCE pack + epic §7 tương ứng — verify Phase 5 từng dòng, không tick khi chưa thấy.

## 3. Touch map
**Create:** `frontend/e2e/tests/session-sync-matrix.spec.ts` · `docs/superpowers/qa/{sync-matrix,e2e-full,docker-regression,gateway-regression,visual-consistency,unit-tests,perf-sanity,sweeps,walkthrough-record}.md` + `walkthrough/` · `docs/adr/0009-next-migration-roadmap.md`.
**Modify (duy nhất được phép):** `frontend/e2e/tests/*.spec.ts` (fix selector vỡ) · `frontend/e2e/helpers/env.ts` (+MAILPIT_API override — 1 dòng, `frontend/e2e/**` là ownership SF-5).
**READ-ONLY:** `frontend/apps/**`, `frontend/packages/**`, `contracts/**`, `backend/**`, `infra/**`, `docker-compose*`.
**Consumers/regression:** 14 specs hiện có, auth-cookie sync tests FI-399, golden-path/nav-honesty (SPA-race fix SF-4), WELCOME10/partner-key seed.

## 4. Design
- **Sync-matrix spec** (`session-sync-matrix.spec.ts`, env-driven qua E2E_*): pattern FI-399 (`trackRefreshPosts` attach trước nav, đóng dấu `syncLoaded` chống reload). 2 tab KHÁC APP: A storefront `/`, B shell `/cart` (cùng origin qua entry). Login qua `/login` (shell route). Cases: (1) login A→B user ngay ≤1 POST, no reload; (2) logout A→B guest ngay; (3) 2FA: setup API trả secret → TOTP node:crypto (HMAC-SHA1, retry bước 30s kế nếu 401) → enable → logout → login → challenge `/login/2fa` → B vẫn guest + 0 POST → hoàn tất → B thấy user; (4) OAuth callback error-path không corrupt state (success-path: cần provider thật — evidence = cùng seam `setToken` + unit packages/auth, ghi trung thực); (5) 20-run rotate-race cross-app 0 spurious logout, tổng POST ≤ 50.
- **Chạy env:** dev-rig `E2E_STOREFRONT_URL=E2E_SHELL_URL=http://localhost:3400`; isolated `…=http://localhost:8480 MAILPIT_API=http://localhost:8425 GATEWAY_URL=http://localhost:8480` (helpers/env.ts thêm override MAILPIT_API).
- **Visual consistency:** Playwright screenshots header/footer region 2 host (storefront Next `/` + shell `/cart` — cùng origin entry) × light/dark × guest/authed (4 trạng thái); DOM assert cùng cấu trúc chrome (testid/role); theme toggle 1 host → host kia đồng bộ; badge single-instance: add-to-cart storefront → badge shell đếm đúng; grep theme keys toàn monorepo = chỉ `ecommerce.theme` (legacy-key migration N/A — theme.ts:8-10 probe FI-398, ghi evidence).
- **127-redirect matrix:** `curl -I http://127.0.0.1:3400/vi?x=1` → 308 localhost giữ path+query; `/_next/*`, `/@vite/client`, favicon KHÔNG redirect; localhost trực tiếp 200 không loop; shell :5573 tương tự (vite plugin).
- **Perf gate:** marker literal duy nhất chrome (chọn lúc chạy, vd tên class registry) — đếm chunk chứa marker trong `apps/shell/dist/assets/*.js` (vite build) + `.next/static/chunks/*.js` (next build): >1 bản độc lập trong 1 app = FAIL → fix-task SF-1. Chạy SAU CÙNG, dev-rig đã dừng.
- **Sweep-fix loop (cap 2 vòng):** fail không thuộc specs → comment epic format `[SF-5 sweep] <surface> — <file> — <hành vi sai> → gán SF-N sở hữu`; vòng re-run PHẢI merge fix về nhánh đích/cherry-pick vào sf-5 trước, chưa merge → BLOCKED-WAIT không đếm vòng; 2 vòng cùng fail → STOP + tổng hợp + hỏi coordinator.
- **Edge cases:** isolated PG riêng tự seed (không đụng DB chính); dev-rig dùng DB chính → restore WELCOME10 nếu off, KHÔNG make seed; TOTP biên 30s → retry window kế; docker build vỡ (improvements-log parent-pom lesson) = chính là điều regression bắt → fix-task SF sở hữu pom/Dockerfile.

## 5. Implementation outline

### Task 0 — Rig prep + boot (coordinator inline)
- [x] Copy `.env` từ main checkout (3 Stripe gates present)
- [x] `make keys` (infra/keys gitignored — isolated identity tự ký)
- [x] Probe +400 free: 3400/5573/5577/5578/5585/5586/8480/8425/5833
- [x] Sweeps EARLY (plan-critic P1#4 — trước rig, vì kiến trúc rig dựa trên nó): diff pnpm-lock (0 external dep — workspace-link chrome OK) + backend/contracts (comment-only) + provenance `a9a8fad..master` → viết `docs/superpowers/qa/sweeps.md` (Task 10 chỉ append raw evidence cuối)
- [x] Rig B: compose `fi397sf5` build + up — **STAGGER boot** (finding #2: 10 JVM đồng loạt vượt PG max_connections=100 → 53300 crash-loop) + **override keys** `scripts/qa/docker-override-sf5-keys.yml` (finding #1: cart/catalog/inventory/log thiếu mount JWT keys trong base compose — QA-only override, compose repo KHÔNG đụng, fix-task epic) + **override network** `scripts/qa/docker-override-sf5-net.yml` (finding #3 CRITICAL: base compose fix tên network `ecommerce-net` dùng chung mọi project → 2 PG cùng alias DNS `postgres` round-robin nhầm DB — tách network riêng fi397sf5-net) → health gateway :8480 + mailpit :8425 + storefront container + catalog API có data
- [x] Rig A: boot storefront `next dev -p 3400` · shell `vite :5573` (DEV_PORT + REMOTE_*_PORT) · remotes :5585/:5586/:5577/:5578 (export VITE_STRIPE_PUBLISHABLE_KEY + **GATEWAY_URL=http://localhost:8480** trước boot — pivot 09-09: main PG bão 160/100 conns từ main-stack JVMs, e2e qua :8080 flaky → FE trỏ gateway ISOLATED :8480, backend tree-identical theo provenance sweeps.md) — shell PHẢI từ worktree này
- [x] Health: preflight 4 URL xanh trên rig A (entry :3400) · WELCOME10 ACTIVE (restore nếu off) · seed user login OK

### Task 1 — sync-matrix spec × 2 app (executor, code; coordinator CHỈ dispatch khi rig B health xanh — plan-critic P2#7)
- [x] Thêm override `MAILPIT_API` vào `frontend/e2e/helpers/env.ts` (1 dòng — plan-critic P0#2, ownership SF-5)
- [x] Viết `frontend/e2e/tests/session-sync-matrix.spec.ts` — 5 cases §4 (2FA TOTP node:crypto + base32-decode tự viết; OAuth error-path; 20-run cross-app) + `recordVideo` context (sync demo VIDEO — ACCEPTANCE 1) + tiêu chí binary từng leg (≤1 POST + no-reload)
- [x] Chạy XANH trên rig A (same-origin :3400) — debug selector trong spec (ownership SF-5)
- [ ] Chạy lại trên rig B isolated :8480 (prod-mode same-origin proof) — evidence `.run/` + report *(đã chạy 09-09 — RED: shell prod :8480 không boot, gateway thiếu route `/remoteEntry.js` → fix-task ngoài boundary SF-5, chi tiết sync-matrix.md §Finding; tick lại sau khi fix merge + re-run)*
- [x] Report `docs/superpowers/qa/sync-matrix.md` (bảng case × kết quả × evidence; fail app-surface → fix-task epic cap 2 vòng)

### Task 2 — one-origin golden-path walkthrough (coordinator, Rule 0)
- [x] Đi flow trên rig A entry :3400: home→PLP→PDP→cart→checkout guest COD→confirmation→account (không đổi port) + /admin (layout admin RIÊNG full-bleed, KHÔNG chrome wrap) — coordinator TỰ nhìn
- [x] **Stripe quyết định tường minh (plan-critic P1#5): 3-gates sống → walkthrough đi variant Stripe 4242 đến PAID** (golden-path e2e T4 cũng chạy full PAID khi hasStripe); gates chết → COD + disclose trong report
- [x] Screenshot từng màn → `docs/superpowers/qa/walkthrough/`
- [x] HMR re-verify 1 lần (evidence SF-3 giữ nguyên trạng thái): remoteEntry 200 qua entry + ws `vite-hmr` clientPort mở
- [x] Ghi gap (nếu có) → fix-task epic; không tự sửa

### Task 3 — 127-redirect verify matrix
- [x] curl -I matrix §4 trên rig A (:3400 Next middleware + :5573 vite plugin) — path+query giữ, `/_next` + `/@vite` + static KHÔNG redirect, localhost không loop
- [x] Report `docs/superpowers/qa/gateway-regression.md` (phần redirect — artifact DUY NHẤT, plan-critic P2#8) — evidence raw curl

### Task 4 — e2e FULL suite (14 + sync-matrix)
- [x] 1 lệnh toàn suite trên rig A: `E2E_STOREFRONT_URL=http://localhost:3400 E2E_SHELL_URL=http://localhost:3400 pnpm exec playwright test` (cd frontend/e2e; serial workers=1, retries 1)
- [x] Fail thuộc specs → fix trong specs (SPA-race/seed-order/selector) — cap 2 vòng; fail code surface → fix-task epic
- [x] Evidence full output → `docs/superpowers/qa/e2e-full.md` (bảng 15 specs × counts, zero-skip note Stripe) — **file TỒN TẠI từ FI-396: APPEND section mới với header `## SF-5 FI-402 (2026-09-09)`, KHÔNG xóa audit trail story cũ** (plan-critic round-2 P2#2, dùngsame cho unit-tests.md + walkthrough-record.md)

### Task 5 — docker full regression isolated +400
- [x] Preflight `docker compose -p fi397sf5 down -v` (chống leftover collision) rồi build + up (STAGGER + keys override + **net override `scripts/qa/docker-override-sf5-net.yml`** — xem Task 0); nếu rig B từ Task 0 còn sống + sạch → reuse, không buộc rebuild (plan-critic round-2 P2#1)
- [x] Rig B health từng container (17 services) + curl matrix qua :8480 (storefront `/`, shell `/cart`, `/admin`, `/api/identity` login, mailpit API :8425)
- [x] Golden-path spec subset chạy với `E2E_STOREFRONT_URL=E2E_SHELL_URL=http://localhost:8480` (kèm /admin) — **prod-red = FAIL thật → fix-task SF sở hữu** (không phải documented limitation)
- [x] Sync-matrix spec chạy trên :8480 — tick cùng Task 1 evidence (không chạy 2 lần, plan-critic P2#6)
- [x] Report `docs/superpowers/qa/docker-regression.md` — gồm 2 finding (PG 53300 cold-boot race + keys mount thiếu 4 service) + override QA recipe + verdict nguyên trạng vs override; teardown KHÔNG ở đây (chuyển Task 6 cuối — plan-critic P1#3)

### Task 6 — gateway-routes regression check
- [x] Diff check: `git diff a9a8fad..HEAD -- backend/gateway/src/main/resources/gateway-routes.yml` comment-only (routes/predicates/filters identical — dùng `grep -vE '^\s*#'` so) + `infra/nginx/frontend-web.conf` rỗng + compose khác override-sf2 (thêm từ SF-2, không sửa base)
- [x] Functional: route matrix curl qua gateway isolated :8480 khớp bảng routes (storefront/shell/admin/api/media)
- [x] Report phần gateway trong `docs/superpowers/qa/gateway-regression.md`
- [ ] TEARDOWN rig B `docker compose -p fi397sf5 down -v` (SAU KHI Task 5+6 xong hẳn — plan-critic P1#3)

### Task 7 — chrome cross-host visual consistency + theme legacy-key
- [x] Playwright screenshots header/footer 2 host × 4 trạng thái (light/dark × guest/authed) qua entry — lưu `docs/superpowers/qa/walkthrough/chrome-consistency/`
- [x] DOM assert cùng cấu trúc chrome 2 host (testid/role) + theme toggle 1 host → host kia sync + badge single-instance (add storefront → badge shell đếm đúng)
- [x] Grep theme keys toàn monorepo = chỉ `ecommerce.theme` (legacy migration N/A evidence theme.ts:8-10) + toggle ghi canonical key 2 host
- [x] Report `docs/superpowers/qa/visual-consistency.md`; lệch visual → fix-task SF-1/SF-4 cap 2 vòng

### Task 8 — unit tests monorepo
- [x] vitest toàn packages/apps (chrome, auth, i18n, ui-kit, shell, mfe-*, storefront-web) — toàn XANH, đếm per package
- [x] Report `docs/superpowers/qa/unit-tests.md`; FAIL → fix-task SF sở hữu package đỏ (cap 2 vòng)

### Task 9 — perf sanity double-inclusion gate (SAU CÙNG — rig A dừng ở cb1 trước mọi build)
- [x] **Dừng toàn bộ rig A** (next dev :3400, shell :5573, remotes :5585/:5586/:5577/:5578) + probe ports free — plan-critic P0#1 (`next build` phá `next dev` đang sống)
- [x] `vite build` shell + `next build` storefront trong worktree
- [x] Scan chunks cho chrome marker: 1 app KHÔNG được ≥2 bản độc lập (FAIL → fix-task SF-1 singleton config)
- [x] Report `docs/superpowers/qa/perf-sanity.md` (marker dùng + số chunk + verdict binary)

### Task 10 — walkthrough record + ADR roadmap (b) + sweeps evidence
- [x] Record/screens sync demo (2 tab 2 app login/logout tức thì — video từ Task 1 recordVideo) + toàn surfaces → `docs/superpowers/qa/walkthrough/` + `walkthrough-record.md` (user xem được, chuẩn bị STORY-COMPLETE); dùng evidence đã capture ở Task 1/2/7 — nếu surface đổi sau khi capture (sweep-fix merge) → boot lại rig A trước khi record (plan-critic P2#9)
- [x] ADR `docs/adr/0009-next-migration-roadmap.md`: thứ tự account→checkout, 7 blockers (appNavigate injection, authReady timing, singleton instance per origin, page.css, gateway/nginx routing, e2e re-verify, GA/theme boot contracts), exit criteria từng giai đoạn
- [x] Sweeps FINAL (append raw evidence vào `docs/superpowers/qa/sweeps.md` đã viết ở Task 0): pnpm-lock diff fork→HEAD = **0 external dep mới** (chỉ workspace-link `packages/chrome` từ SF-1 — spec-critic P0); backend/contracts diff = comment-only gateway (deviation ghi tường minh + epic ratify trước verify); provenance `a9a8fad..master` backend rỗng (jars :8080 ≡ nhánh đích)

### Task 11 — Independent review + merge + gate (coordinator — meta-steps, không checkbox)
1. code-reviewer ĐỘC LẬP trên diff SF (specs + reports + ADR + env.ts) → APPROVED / CHANGES-REQUESTED (fix → re-review)
2. security-audit surface diff (secrets/XSS/env leak) → FINDINGS/NONE
3. verifier độc lập: TỪNG DÒNG ACCEPTANCE pack → PASS / PARTIAL / FAIL
4. Merge: parent `story/fi397-unify-frontend` vào sf-branch trước → merge no-ff về đích (update-ref FULL refname + 2 ancestor guards; conflict improvements-log giữ CẢ HAI) + smoke golden-path sau merge + audit comment merge-hash FI-402
5. GATE CỨNG `~/.claude/bin/story-verify sf-5` sạch (ORCA_BIN override) → FI-402 Done (sau merge, trước Done)

## 6. Risks
- Docker build vỡ/chậm (parent-pom lesson) → chính là mục tiêu regression; fix-task SF sở hữu; cap 2 vòng rồi STOP tổng hợp.
- Prod-mode :8480 khác dev (Stripe keys không bake image — Dockerfile.web không có ARG stripe) → flow chính COD; Stripe golden-path gate ở rig A (3-gates sống).
- next build phá next dev → T9 sau CÙNG sau khi rig dừng.
- Port/DB war → mọi port +400 probe free; isolated PG riêng; không đụng stack chính.
- TOTP flaky biên 30s → retry window kế.
- Seed drift dev-rig (DB chính) → restore WELCOME10, không make seed; isolated stack tự seed riêng.
- Orca screenshot flaky → Playwright rig; Rule 0 coordinator tự nhìn.
