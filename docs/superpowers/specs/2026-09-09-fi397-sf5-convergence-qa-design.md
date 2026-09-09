# SF-5 convergence-qa — Spec slice (FI-402, story FI-397)

> Ngày: 2026-09-09 · Tier: 2 · Nhánh: `wakii-dev/sf-5-convergence-qa` → đích `story/fi397-unify-frontend`
> Nguồn: epic spec `2026-09-08-frontend-unification-design.md` (master `56cd136`) + context pack `fi397-sf-5.md` (master `56cd136`) + code hiện trạng hợp nhất `be9962c` (SF-1..4 đã merge) đọc 09-09.
> Design: none (FI-390 direction giữ nguyên — verify là chính). Vai: QA ĐỘC LẬP — không sửa code surface (trừ `frontend/e2e/**` + `scripts/qa/**` + docs QA/ADR).

## 0. Problem

SF-1 (chrome) + SF-2 (session-sync) + SF-3 (1-origin entry) + SF-4 (wiring) đã merge tuần tự về `story/fi397-unify-frontend` (`be9962c`) — mỗi SF xanh trên rig RIÊNG của nó. Chưa ai chạy đồng thời đủ lớp verification trên code HỢP NHẤT: sync matrix đa tab đa app, e2e FULL 14 specs, docker full regression, 1-origin golden path, chrome nhất quán 2 host. Epic FI-397 cần bằng chứng hợp nhất này trước khi story Done (verifier PASS từng dòng ACCEPTANCE pack).

Precondition ĐÃ verify 09-09: SF-1 `304f266`, SF-2 `41e9083`, SF-4 `f5be01e` merge xong; fork point với FI-390 story = `a9a8fad`.

## 1. Scope

**In** (10 task bracket + rig + review/merge):
1. Sync matrix e2e spec MỚI `frontend/e2e/tests/session-sync-matrix.spec.ts` — 2 pages CÙNG Playwright context × 2 app (storefront Next + shell Vite cùng origin): login A→B, logout A→B, 2FA challenge (setup→enable→login→challenge KHÔNG broadcast→hoàn tất→broadcast), OAuth callback (error-path không corrupt state; success-path KHÔNG e2e được — cite unit tests SẴN CÓ của packages/auth, KHÔNG viết test mới ngoài ownership; coverage vắng → disclose trong report + dẫn seam code setToken call-site), 20-run rotate-race 0 spurious logout (cross-app). **Tiêu chí binary TỪNG leg** (network log): login A→B — B thấy user ≤1 POST refresh + KHÔNG reload (assert không navigate); logout A→B — B guest ngay + KHÔNG reload. Spec env-driven (dev-rig lẫn isolated :8480) + `recordVideo` — **sync demo VIDEO là deliverable bắt buộc** (ACCEPTANCE 1), screenshots chỉ bổ sung.
2. One-origin golden path walkthrough qua entry dev (rig của worktree này): home→PLP→PDP→cart→checkout (guest COD; Stripe nếu 3-gates sống)→confirmation→account + /admin (layout admin RIÊNG, không chrome) — Rule 0, coordinator tự nhìn. **HMR re-verify 1 lần** (pack item 2 — evidence SF-3 giữ nguyên trạng thái): remoteEntry 200 qua entry + ws `vite-hmr` mở clientPort remote (Next fast-refresh sống nếu test được) — 1 evidence capture.
3. 127-redirect matrix trên rig: `curl -I 127.0.0.1:{3400,5573}` → redirect localhost giữ path+query; `/_next/*` + `/@vite/*` + static KHÔNG redirect; localhost trực tiếp không loop. (Pack ghi {3000,5173} = port epic; rig này +400 — mechanism port-agnostic, evidence trên code nhánh đích.)
4. e2e FULL: cả 14 specs hiện có + sync-matrix mới, 1 lệnh, trên dev-rig +400 — xanh hoặc fix trong specs (SF-5 sở hữu) / fix-task về SF sở hữu nếu code surface đổi.
5. Docker full regression ISOLATED +400 (compose project `fi397sf5`, override `docker-compose.override-sf2.yml` có sẵn từ SF-2 — tái sử dụng; preflight `docker compose -p fi397sf5 down -v` trước `up` chống leftover collision): build + boot toàn stack, entry `:8480` **golden-path spec subset chạy với E2E_STOREFRONT_URL=E2E_SHELL_URL=http://localhost:8480** + /admin + health từng service + sync-matrix spec trên :8480 (prod-mode same-origin proof theo recipe pack SF-2). **Prod-red semantics:** dev-rig xanh nhưng :8480 đỏ (vd MF prod bundle vỡ — FI-401 lesson) = FAIL thật → fix-task SF sở hữu, KHÔNG ghi "documented limitation".
6. Gateway-routes regression: diff `gateway-routes.yml` + `infra/nginx/frontend-web.conf` fork-point→HEAD (KY thuật: routes/predicates/filters không đổi — comment-only diff SF-3 `5e3d544` được ghi nhận riêng) + functional curl matrix qua gateway isolated :8480.
7. Chrome cross-host visual consistency: Header/Footer/cart-badge/auth-menu 4 trạng thái (light/dark × guest/authed) × 2 host (Next storefront + shell Vite qua cùng entry) — screenshots cạnh nhau + DOM assert cùng nguồn chrome; single-instance evidence (badge đăng ký từ remote hiển thị trên host + count sync); theme legacy-key check: grep proof toàn monorepo chỉ có key `ecommerce.theme` (theme.ts:8-10 probe FI-398: FI-390 KHÔNG giới thiệu key khác → read-order migration N/A — assert toggle ghi canonical + boot script đọc canonical, ghi nhận N/A kèm evidence).
8. Unit tests monorepo: tất cả packages/apps test suites xanh trên nhánh đích (report counts per package).
9. Perf sanity (binary gate): build shell (vite build) + storefront (next build — chạy SAU khi dev-rig đã dừng, `next build` phá `next dev` đang sống) → grep bundle cho duplicate chrome module markers; chrome xuất hiện >1 bản độc lập trong 1 app = FAIL → fix-task SF-1. KHÔNG đo CLS/MS thừa.
10. Walkthrough record + ADR roadmap migration (b): screenshots/video sync demo + toàn surfaces lưu `docs/superpowers/qa/` + `docs/superpowers/qa/walkthrough/`; ADR `docs/adr/0009-next-migration-roadmap.md` — thứ tự account→checkout, 7 blockers (appNavigate injection, authReady timing, singleton instance per origin, page.css, gateway/nginx routing, e2e re-verify, GA/theme boot contracts), exit criteria từng giai đoạn.
11. Sweeps (P0-critic đã đo sẵn — gate định nghĩa theo HIỆN TRẠNG đúng, không theo pack-literal): (a) `git diff <fork>..HEAD -- frontend/pnpm-lock.yaml` **0 EXTERNAL dep mới** — diff CHỈ được chứa workspace-link entries của `packages/chrome` (từ merge SF-1) — mọi entry registry/external khác = FAIL; (b) `git diff <fork>..HEAD -- backend/ contracts/` = comment-only gateway-routes.yml (SF-3 `5e3d544` — routes/predicates/filters nguyên trạng; **deviation so pack-literal "diff rỗng" được ghi tường minh trong QA report + epic comment để epic ratify TRƯỚC verify** — revert comment là sửa backend, ngoài quyền SF-5); (c) provenance backend rig A: main checkout = master `a2aba92`, `git diff a9a8fad..master -- backend/ contracts/` rỗng → jars :8080 tree-identical backend nhánh đích (ghi vào report để claim "evidence trên code nhánh đích" auditable).

**Out (boundary — theo pack):**
- KHÔNG sửa code app/package (trừ `frontend/e2e/**`, `scripts/qa/**`, docs QA/ADR) — sweep fail → fix-task comment epic gán SF sở hữu; re-run cap 2 vòng.
- KHÔNG thêm feature; KHÔNG đụng gateway/nginx/compose (chỉ diff-check + dùng override-sf2 có sẵn); KHÔNG backend.
- KHÔNG re-design chrome; KHÔNG merge vào main (PR là quyền người).
- KHÔNG re-run Phase 0 analyst (đã chạy ở epic).

## 2. Rig architecture (2 rig — không đụng stack chính `orca/projects/ecommerce` đang giữ :3000/:5173/:8080)

**Rig A — dev +400 (code nhánh đích từ worktree này):**
- Storefront `next dev -p 3400` = ENTRY (rewrites shell-routes + /admin từ SF-3) · shell `vite :5573` · remotes checkout :5585 / account :5586 / admin :5577 / skeleton :5578 (base 5175-78 +400).
- Backend dùng chung gateway chính :8080 (jars main checkout) — HỢP LỆ vì diff backend fork→HEAD chỉ là comment gateway-routes (sweep item 11 chứng minh); GATEWAY_URL mặc định .env :8080. Mailpit chính :8025 (helpers/env.ts hardcode — dev-rig KHÔNG cần override).
- `.env` copy từ main checkout TRƯỚC boot (vite bake `VITE_*` lúc start — improvements-log ×2); export `VITE_STRIPE_PUBLISHABLE_KEY` + `GATEWAY_URL` khi boot remotes (SF-3 lesson: Vite remote KHÔNG đọc root .env).
- Shell PHẢI boot từ worktree này (provenance i18n/chrome đúng — FI-401 lesson: shell worktree khác làm label-demo bất khả).
- e2e env: `E2E_STOREFRONT_URL=http://localhost:3400 E2E_SHELL_URL=http://localhost:3400` (1-origin qua entry — helpers/env.ts default đã là :3000, override +400).

**Rig B — docker full ISOLATED +400 (prod-mode, recipe pack SF-2):**
- `COMPOSE_PROJECT_NAME=fi397sf5 docker compose -p fi397sf5 -f docker-compose.yml -f docker-compose.override-sf2.yml --profile full up -d --build` (override có sẵn: PG 5833, gateway 8480, mailpit 8425, minio 9400-9401, ES 9600, invoice 8490, mongo 27417…).
- Entry = gateway :8480 (prod 1-origin nguyên trạng). Sync-matrix spec chạy ở đây: `E2E_STOREFRONT_URL=E2E_SHELL_URL=http://localhost:8480 MAILPIT_API=http://localhost:8425 GATEWAY_URL=http://localhost:8480`.
- Xong: `docker compose -p fi397sf5 down -v` (dọn sạch, không đụng stack chính).
- ⚠ improvements-log: image build từng chết âm thầm (parent pom module append) — chính là điều regression này phải bắt; build fail → fix-task về SF sở hữu pom/Dockerfile tương ứng.
- helpers/env.ts: thêm env override `MAILPIT_API` (1 dòng — `frontend/e2e/**` là ownership SF-5; improvements-log FI-399 đã flag nhu cầu này).

## 3. Thiết kế test chính (quyết định chi tiết hóa từ pack)

- **Sync-matrix spec** (pattern từ auth-cookie.spec FI-399: `trackRefreshPosts` attach TRƯỚC navigation, đóng dấu `syncLoaded` chống reload): 2 tabs khác APP — A mở storefront `/`, B mở shell `/cart` (cùng origin). Login qua `/login` (shell route — A click auth-menu Đăng nhập → /login). 2FA: `POST /api/identity/2fa/setup` (authed) trả `{secret, otpauthUrl}` → TOTP tính trong spec bằng `node:crypto` HMAC-SHA1 (không thêm dep; **base32-decode secret tự viết ~20 dòng trong spec — không có stdlib**) → enable → logout → login → challenge `/login/2fa` → assert B VẪN guest + 0 POST refresh từ B → hoàn tất TOTP → B thấy user. OAuth: `/login/oauth/callback?error=...` error-path assert không crash + state guest; success-path broadcast KHÔNG e2e được (cần provider thật) → evidence = cite unit tests sẵn có packages/auth (không viết mới) + seam `setToken` như password login — disclose trung thực trong report.
- **20-run race cross-app**: BC ngoài app bắn `auth-changed` (pattern FI-399) → A(storefront) + B(shell) cùng refresh serialized → 0 logout, tổng POST ≤ 50.
- **Visual consistency**: Playwright screenshots (orca screenshot flaky — precedent FI-368/FI-395): header region + footer region, 2 host × light/dark × guest/authed, lưu `docs/superpowers/qa/walkthrough/`; DOM assert cùng cấu trúc chrome (data-testid/roles) 2 host; theme toggle 1 host → kiểm host kia đồng bộ (BC/storage cùng origin); grep theme keys toàn monorepo = chỉ `ecommerce.theme`.
- **Perf gate marker**: chọn literal duy nhất trong `packages/chrome` (xác định lúc chạy, vd tên class registry/const riêng tư) — đếm chunk chứa marker trong `apps/shell/dist` (vite build) và `.next/static/chunks` (next build): 1 app KHÔNG được có ≥2 bản chrome độc lập (MF SHARED_SINGLETONS → shared chunk duy nhất; Next transpilePackages → 1 client chunk).

## 4. Touch map

**Create:** `frontend/e2e/tests/session-sync-matrix.spec.ts` · `docs/superpowers/qa/{sync-matrix,e2e-full,docker-regression,gateway-regression,visual-consistency,unit-tests,perf-sanity,sweeps,walkthrough-record}.md` (+ `walkthrough/` screenshots) · `docs/adr/0009-next-migration-roadmap.md` · `scripts/qa/*` nếu cần probe (sở hữu).
**Modify (duy nhất được phép):** `frontend/e2e/tests/*.spec.ts` (fix selector vỡ) · `frontend/e2e/helpers/env.ts` (MAILPIT_API override — 1 dòng).
**READ-ONLY:** `frontend/apps/**`, `frontend/packages/**`, `contracts/**`, `backend/**`, `infra/**`, `docker-compose*`.
**Regression candidates:** 14 specs hiện có (selector/seed-drift), auth-cookie sync tests FI-399, golden-path/nav-honesty (SF-4 đã fix SPA-race).

## 5. Risks

- **Docker build chết/long** (improvements-log): build-smoke chính là mục tiêu regression; nếu vỡ do parent pom → fix-task SF sở hữu (backend pom thuộc stories trước — escalate epic), cap 2 vòng rồi STOP.
- **Prod-mode khác dev-mode** trên :8480 (Vite MF prod bundles, Stripe keys bake lúc build image): flow chính dùng COD; Stripe-image-build chỉ ở mức "keys có vào image không" — nếu không, ghi nhận + gate golden-path Stripe ở dev-rig (đủ 3-gates).
- **next build phá next dev** (memory sf15): PT9 chạy SAU CÙNG, rig dev đã dừng.
- **Port/DB war**: mọi port +400 đã probe free (09-09); isolated PG riêng 5833; KHÔNG đụng stack chính; sweep-static không cần rig.
- **Seed drift** (WELCOME10/partner key — FI-396 lessons): isolated stack tự seed riêng (không đụng DB chính); dev-rig dùng DB chính → restore WELCOME10 nếu toggle-off, KHÔNG `make seed` wipe.
- **2FA flaky** (TOTP window 30s): sinh code ở biên thời gian → retry code bước tiếp theo nếu 401 lần 1.
- **Orca screenshot flaky** → Playwright rig (precedent ổn định); Rule 0 vẫn do coordinator TỰ nhìn screenshots.

## 6. Q&A tự trả (pack + code đã trả hết — không hỏi lại epic)

| Câu | Trả lời | Nguồn |
|---|---|---|
| 127-redirect test port nào? | Rig +3400/+5573 (code nhánh đích); {3000,5173} của pack = port epic — mechanism port-agnostic | pack item 3 + middleware/vite-plugin đọc |
| Legacy theme key có tồn tại? | KHÔNG — probe FI-398 (theme.ts:8-10): cả 3 vị trí đã dùng `ecommerce.theme` → migration N/A, check thành grep-proof + toggle-writes-canonical | theme.ts đọc 09-09 |
| OAuth success-path e2e? | Không thể (cần provider thật) → seam setToken + unit + error-path e2e; ghi nhận trung thực | OAuthCallbackPage.tsx + ADR 0005-sf15 |
| MAILPIT_API hardcode chặn isolated e2e? | Thêm override 1 dòng trong helpers/env.ts — `frontend/e2e/**` là ownership SF-5 (khác SF-3 trước đây) | pack touch map |
| e2e full chạy mode nào? | Dev-rig (suite design cho dev stack — precedent FI-396); prod-mode được cover bởi rig B (sync-matrix + regression flow) | pack item 4/5 |
| Backend dùng chung :8080 cho rig A có hợp lệ? | Có — 2 nửa: (1) story-branch backend ≈ fork (comment-only); (2) main checkout = master `a2aba92` và `git diff a9a8fad..master -- backend/ contracts/` rỗng → jars :8080 tree-identical backend nhánh đích (provenance spec-critic #10 verify 09-09) | sweep item 11 |
| pnpm-lock sweep gate là gì? | 0 EXTERNAL dep mới — diff chỉ chứa workspace-link `packages/chrome` từ SF-1 (diff KHÔNG rỗng — pack-literal "rỗng" sai hiện trạng, spec-critic P0 #1) | sweep item 11 |
