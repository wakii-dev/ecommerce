# Plan: SF-3 dev-one-origin-entry (FI-400)

Date: 2026-09-09 | Linear: FI-400 | Worktree: `/Users/hoivu/orca/workspaces/ecommerce/sf-3-dev-entry` (nhánh `wakii-dev/sf-3-dev-entry` → đích `story/fi397-unify-frontend`)
Spec: `docs/superpowers/specs/2026-09-09-sf3-dev-one-origin-entry-design.md` (v2 — spec-critic PROCEED) · Context pack: `docs/superpowers/contexts/fi397-sf-3.md`

## 0. Root cause analysis

**Root cause:** dev topology 2 origin (Next :3000 storefront + shell Vite :5173) — BroadcastChannel cross-origin bất khả thi (chặn SF-2 session-sync tức thì), localStorage port-scoped (guest cart tách biệt), UX 2 URL.
**Current state:** `make dev` boot turbo --parallel 6 apps; user vào :3000 cho storefront, :5173 cho cart/checkout/account/admin; remotes load cross-origin trực tiếp (:5173→:5175-78).
**Expected outcome:** 1 URL `http://localhost:3000` (entry) — mọi route storefront + shell + admin; HMR 2 phía; remotes same-origin; prod KHÔNG đổi.
**Constraints:** dep freeze; zero backend/contracts; cookie /api/identity đóng băng; admin không chrome wrap; :3000 đang bị stack session khác chiếm → mọi verify trên rig offset +600 (Next :3600, shell :5773, remotes :5775-78, `DEV_PORT` env + `next dev -p` CLI).
**High-level strategy:** Next làm front-router (rewrites afterFiles) + Vite base-relative mirror prod Dockerfile.web (đã chứng minh cùng cơ chế ở prod) + HMR clientPort direct-WS.

## 1. Problem

Dev/demo/e2e phải dùng 2 URL khác port; session sync tức thì (SF-2) không thể hoạt động cross-origin.

## 2. Scope

- **In:** next.config.mjs (APPEND rewrites), shell + 4 remote vite.config.ts, scripts/dev-stack.sh + dev-stop.sh (verify), .env.example, lib/site.ts, e2e/helpers/env.ts, gateway-routes.yml (comment-only), docs/adr/0008 + README.
- **Out:** prod surfaces (nginx/predicate/compose/backend code), middleware.ts, packages/chrome|auth, apps/*/package.json, runtime app code, spec e2e files, dep mới.
- **Success criteria (observable):** 6 ACCEPTANCE của context pack — (1) golden path 1-URL; (2) /admin layout riêng full-bleed; (3) HMR 2 phía; (4) remoteEntry same-origin (URL không kèm port khác); (5) links shellUrl() → `/cart` không `//cart`; (6) e2e subset (golden-path, nav-honesty, auth-cookie) XANH qua entry.

## 3. Touch map

Xem spec §3 (SỞ HỮU vs READ-ONLY đầy đủ). Consumers regression-candidates: 9 e2e specs đọc `SHELL`; Header/Footer/AddToCart/WishlistHeart/WriteReviewModal dùng `shellUrl()`; mọi user `make dev`.

## 4. Design

Xem spec §4 D1-D6 (đã spec-critic 2 rounds — PROCEED). Tóm tắt: (D1) base `/remotes/<name>/` + prefix-preserving proxy; (D2) `DEV_PORT` env 1 nguồn cho port+hmr.clientPort+strictPort, boot từng app riêng; (D3) two-slot ENTRY relative/DESTINATION absolute; (D4) rewrites route-table đầy đủ App.tsx:156-289; (D5) shellUrl ''; (D6) dev-stack guard 2 chân ENTRY_URL+SHELL_ORIGIN, banner chế độ.

## 5. Implementation outline — task DAG

```
T0 probe ──→ T1 implement-config ──→ ┬─ T2 dev-stack/dev-stop
                                     └─ T3 env/site/e2e-helpers ──→ T4 docs/ADR
                                                                      │
                        T5 evidence + walkthrough + e2e subset ←──────┘
```

### Task T0 — probe HMR/remoteEntry/rewrites (rig +600) — evidence bắt buộc
- [x] T0.1 Viết config probe trên nhánh: 4 remote `base: '/remotes/<name>/'` + `DEV_PORT`; shell entry relative + DEV_PORT + spaFallback exempt `/remotes`; next.config rewrites APPEND (dest :5773/:5775-78 qua env `SHELL_ORIGIN`/`REMOTE_*_URL` absolute — normalize D3)
- [x] T0.2 Boot rig +600 nền: 5 vite (DEV_PORT=5773/5775/5776/5777/5778, strictPort) + `next dev -p 3600` (env SHELL_ORIGIN=http://localhost:5773, REMOTE_*_URL=http://localhost:5775-78, GATEWAY_URL=:8080 stack đang chạy — shared backend)
- [x] T0.3 Evidence gates (browser thật — Rule 0): (1) network `/remotes/<name>/remoteEntry.js` same-origin không port khác, 0 CORS/404; (2) HMR: sửa file remote → hot update; sửa file Next → hot update; (3) `http://localhost:3600/admin` render AdminApp full-bleed không chrome; (4) F5 deep-link `/login/2fa` `/account/orders` không 404
- [x] T0.4 Probe report `docs/superpowers/evidence/fi400-probe.md` (kết quả từng gate + variant D1/D2 chọn + fallback đã thử nếu gãy)

**Exit criteria:** 4 evidence gates có screenshot/log; nếu gate 1-2 fail cả A/B → STOP escalation epic (không tự chế hướng thứ 3 — spec §5.4).

### Task T1 — implement entry :3000 (config-only) — dep T0
- [x] T1.1 Finalize next.config.mjs rewrites (giữ probe config, dest default 5173/5175-78 qua D3 normalize)
- [x] T1.2 shell vite.config.ts final (entry relative default, proxy `/remotes/<name>` prefix-preserving, spaFallback exempt, DEV_PORT default 5173)
- [x] T1.3 4 remote vite.config.ts final (base + DEV_PORT + hmr.clientPort + strictPort)
- [x] T1.4 Commit atomic `feat(sf3): one-origin entry — rewrites + base-relative remotes (FI-400)`

**Exit criteria:** (a) re-boot rig +600 NHƯ T0.2 (giữ env offset SHELL_ORIGIN/REMOTE_*_URL absolute) + 4 gates browser PASS với config đã finalize; (b) D3 defaults (không env) verify bằng code-inspect + banner sandbox CHỈ — TUYỆT ĐỐI KHÔNG boot default ports (:3000/:5173 đang bị stack session khác giữ — cấm theo P0 constraint); tsc --noEmit shell + remotes pass.

### Task T2 — dev-stack/dev-stop — dep T1
- [x] T2.1 dev-stack.sh: guard boot curl `ENTRY_URL` (env `DEV_ENTRY_URL`, default :3000) VÀ `${SHELL_ORIGIN:-http://localhost:5173}`; banner 1-URL + chế độ remotes (relative/legacy từ shape REMOTE_*_URL — dev-stack export .env nên thấy) **+ kênh leak thứ hai: NEXT_PUBLIC_SHELL_URL absolute → banner cảnh báo links cross-origin (R5); health check entry sau boot FE
- [x] T2.2 dev-stop.sh: verify port list 3000/5173-5178 đủ (đã đủ → không đổi, ghi receipt); thêm port rig (3600/5773/5775-78) KHÔNG thêm (probe tự dọn — tránh kill nhầm)
- [x] T2.3 `bash -n` + exercise 4 nhánh guard (both-up / chỉ entry down / chỉ shell down / both-down) bằng curl stub hoặc port giả sandbox — bash -n KHÔNG bắt logic bug + commit `feat(sf3): dev-stack entry guard/banner/healthcheck (FI-400)`

**Exit criteria:** script syntax pass; cả 4 nhánh guard có receipt chạy thật (sandbox); banner text đúng cả 3 chế độ (1-origin / REMOTE_* legacy / NEXT_PUBLIC_SHELL_URL leak).

### Task T3 — env/site/e2e-helpers — dep T1
- [x] T3.1 .env.example: REMOTE_{CHECKOUT,ACCOUNT,ADMIN,SKELETON}_URL → `/remotes/<name>` + comment 2 chế độ; REMOTE_STOREFRONT_URL note legacy; NEXT_PUBLIC_SHELL_URL để trống + comment (default same-origin nằm ở site.ts; SITE_URL KHÔNG có sẵn trong .env.example — không thêm no-op); IDENTITY_OAUTH_FE_REDIRECT_BASE → `http://localhost:3000` + NOTIFY_MY_ORDERS_URL → `http://localhost:3000/account/orders` (comment entry)
- [x] T3.2 lib/site.ts: `shellUrl()` default `''` + comment entry; giữ env override
- [x] T3.3 Unit test site.ts (shellUrl default '' / env override / không `//`) — chạy trong package dir
- [x] T3.4 e2e/helpers/env.ts: SHELL default `http://localhost:3000` (+comment qua entry)
- [x] T3.5 Commit `feat(sf3): env defaults + shellUrl same-origin relative + e2e SHELL entry (FI-400)`

**Exit criteria:** unit test pass; grep không còn default absolute `:5173` trong site.ts; .env.example comment tự giải thích.

### Task T4 — docs ADR + README — dep T3
- [x] T4.1 `docs/adr/0008-dev-one-origin-entry.md`: quyết định D1-D6, probe evidence link, fallback 2-origin, prod note (rewrites dead-entry trong standalone manifest), auth-cookie lock target shift, R5 .env cũ (2 kênh: REMOTE_*_URL + NEXT_PUBLIC_SHELL_URL), note stale `docs/demo-script.md` (ngoài scope docs — post-merge sẽ cũ)
- [x] T4.2 README dev section: entry 1 URL + bảng port + cách tắt
- [x] T4.3 gateway-routes.yml comment-only cập nhật (dev vào entry :3000, giữ nguyên predicate)
- [x] T4.4 Commit `docs(sf3): adr 0008 + readme dev entry (FI-400)`

**Exit criteria:** ADR đủ 6 quyết định + evidence; README nhất quán spec.

### Task T5 — evidence + walkthrough + e2e subset — dep T4
- [x] T5.1 Golden path walkthrough 1-URL (browser thật, Rule 0): home→PLP→PDP→add-to-cart→cart→checkout guest→confirmation→account + `/admin` layout riêng — screenshots từng màn → `docs/superpowers/walkthroughs/fi400-*`
- [x] T5.2 HMR evidence cuối: sửa 1 file remote + 1 file Next trên rig → hot update (screenshot before/after)
- [x] T5.3 remoteEntry same-origin network evidence (acceptance #4): network tab `/remotes/<name>/remoteEntry.js` URL KHÔNG kèm `:5175/5176/5177` — screenshot network panel
- [x] T5.4 shellUrl links: hover/click header cart/account từ trang Next → URL `/cart` `/account` (không `//cart`, không absolute)
- [x] T5.5 e2e subset qua rig: golden-path + nav-honesty + auth-cookie (env E2E_STOREFRONT_URL/E2E_SHELL_URL=:3600) — PASS
- [ ] T5.6 Commit evidence + plan tick + **teardown rig receipt** (lsof :3600/:5773/:5775-78 sạch trước merge — tránh port-war chéo worktree)

**Exit criteria:** từng dòng ACCEPTANCE context pack §30-39 có evidence tương ứng; e2e subset xanh.

## 6. Risks & unknowns

Xem spec §6 R1-R6. Verify trước implement: probe T0 (chặn). Unverified: @module-federation/vite dev+base runtime (library evidence thuận); Next 14 rewrites WS (kỳ vọng chết — clientPort là chính).

---

## Meta steps (không dùng checkbox — checklist COMPLETE-RUN)

1. Code + tests pass (T0-T5).
2. Verify Phase 5 — từng dòng ACCEPTANCE context pack.
3. Rule 0 browser verify 3 tầng (T1 DOM eval hỗ trợ / T2 screenshot so direction FI-390 / T3 flow trọn) — coordinator tự làm.
4. Code-reviewer ĐỘC LẬP trên diff toàn SF → APPROVED.
5. security-audit surface (secrets/XSS/env leak) → FINDINGS/NONE.
6. verifier độc lập → PASS.
7. Merge worktree → `story/fi397-unify-frontend` (no-ff; merge PARENT vào sf-branch trước; update-ref FULL refname + 2 ancestor guards theo merge-playbook; conflict improvements-log giữ CẢ HAI) + audit comment merge-hash. **PRECONDITION:** :3000 đang bị stack session khác giữ → story-verify + smoke sau merge chạy CHẾ ĐỘ RIG (`DEV_ENTRY_URL`/`SHELL_ORIGIN` offset) và evidence ghi rõ offset-topology; bind :3000 thật = lần `make dev` đầu post-merge (user/coordinator dừng foreign session) — banner dev-stack mới sẽ in entry khi đó.
8. GATE CỨNG `~/.claude/bin/story-verify sf-3` sạch (chế độ rig nếu foreign session còn giữ :3000).
9. Set FI-400 Done + report cuối epic comment + terminal.
