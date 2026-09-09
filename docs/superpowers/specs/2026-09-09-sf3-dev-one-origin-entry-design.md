# SF-3 dev-one-origin-entry — Spec v2 (FI-400)

> Story FI-397 · Epic spec: `docs/superpowers/specs/2026-09-08-frontend-unification-design.md` · Context pack: `docs/superpowers/contexts/fi397-sf-3.md` · Bracket: `docs/superpowers/brackets/fi397-unify-frontend.md`
> v2: revise sau spec-critic round 1 (FIX-P0-FIRST — 1 P0 routes + 5 P1 đã xử lý, chi tiết §7)
> Nhánh: `wakii-dev/sf-3-dev-entry` → đích `story/fi397-unify-frontend`

## 0. Root cause — vì sao phải làm

Dev hiện tại **2 origin**: storefront Next `:3000` (pages /c /p /search…) và shell Vite MF `:5173` (cart/checkout/account/admin). Hệ quả:

- **BroadcastChannel bất khả thi cross-origin** → session-sync tức thì của SF-2 không thể hoạt động khi user đi qua 2 origin (BC chỉ cùng origin).
- **localStorage tách biệt theo port** (memory: port-scoped) → guest cart token storefront và shell KHÔNG chung → cart mất khi cross-app.
- UX: user phải nhớ 2 URL dev.

SF-3 giải bằng **1 entry duy nhất `http://localhost:3000`** (user chốt 09-09): Next làm front-router, rewrite shell-routes sang Vite shell; remotes load same-origin qua entry. Prod KHÔNG đổi (gateway :8080 → nginx shell-web đã 1 entry từ SF-10/D16).

## 1. Problem

Ai: dev + demo + e2e. Khi nào: mọi lần `make dev`. Gì: 1 URL `:3000` đi được toàn golden path home→PLP→PDP→cart→checkout→confirmation→account VÀ `/admin` (AdminApp layout riêng full-bleed, KHÔNG chrome wrap). HMR 2 phía sống. Không bao giờ: đụng prod, backend, contracts.

## 2. Scope

**In (config-only + scripts + docs):**
- `frontend/apps/storefront-web/next.config.mjs` — APPEND shell-routes vào mảng rewrites() hiện có (KHÔNG thay function): shell pages (route table ĐẦY ĐỦ từ `apps/shell/src/App.tsx:156-289`) + dev assets + per-remote proxies.
- `frontend/apps/shell/vite.config.ts` — remote entry default RELATIVE `/remotes/<name>/remoteEntry.js`; server.proxy `/remotes/<name>` (giữ prefix) cho debug trực tiếp :5173; **spa-fallback exempt `/remotes` prefix** (middleware pre-proxy đang rewrite mọi GET không-dấu-chấm → `/` — sẽ nuốt `/remotes/checkout/@vite/client`); `server.port` + `hmr.clientPort` derive từ `DEV_PORT` (default 5173) — cùng pattern remotes.
- `frontend/apps/{mfe-checkout,mfe-account,mfe-admin,_skeleton-remote}/vite.config.ts` — dev `base: '/remotes/<name>/'` (mirror prod `vite build --base=/remotes/<name>/` Dockerfile.web:18-21) + `server.port` + `server.hmr.clientPort` ĐỀU derive từ env `DEV_PORT` (1 nguồn duy nhất — tránh clientPort lệch port khi rig override).
- `scripts/dev-stack.sh` — guard curl CẢ entry + shell, banner 1-URL + chế độ remotes (relative/legacy), health check entry.
- `scripts/dev-stop.sh` — verify port list 3000/5173-5178 đủ (đã đủ — giữ nguyên, chỉ verify).
- `.env.example` — REMOTE_{CHECKOUT,ACCOUNT,ADMIN,SKELETON}_URL defaults → relative `/remotes/<name>` (REMOTE_STOREFRONT_URL: legacy không consumer — ghi chú không đổi); SITE_URL/NEXT_PUBLIC_SHELL_URL theo entry; **+2 default 2-origin leak**: `IDENTITY_OAUTH_FE_REDIRECT_BASE` (:151 — identity 302 browser sau OAuth) và `NOTIFY_MY_ORDERS_URL` (:123 — link email) → `http://localhost:3000/…` (env-default only, KHÔNG đụng compose/backend code — flag epic).
- `frontend/apps/storefront-web/lib/site.ts` — `shellUrl()` default `''` (same-origin relative), env override giữ.
- `frontend/e2e/helpers/env.ts` — SHELL default → cùng entry URL `http://localhost:3000` (specs không sửa — 9 specs đọc `SHELL` tự đi qua entry).
- `backend/gateway/src/main/resources/gateway-routes.yml` — CHỈ comment dev (~dòng 109-115), KHÔNG đổi predicate.
- Docs: ADR `docs/adr/0008-dev-one-origin-entry.md` + README dev entry section.

**Out:** prod (nginx/gateway predicate/docker-compose/backend code) · middleware.ts (SF-2) · packages/chrome (SF-1) · packages/auth (SF-2) · layout swap (SF-4) · dep mới · runtime app code · `apps/*/package.json` dev scripts (rig dùng CLI/env, KHÔNG sửa script).

## 3. Touch map

```
SỞ HỮU (SF-3 sửa):
  frontend/apps/storefront-web/next.config.mjs         (anchor: rewrites block; transpilePackages là vùng SF-1)
  frontend/apps/shell/vite.config.ts                   (remote entry + proxy /remotes/* + spaFallback exempt + DEV_PORT)
  frontend/apps/mfe-checkout/vite.config.ts            (base + DEV_PORT→port/hmr.clientPort)
  frontend/apps/mfe-account/vite.config.ts             (như trên)
  frontend/apps/mfe-admin/vite.config.ts               (như trên)
  frontend/apps/_skeleton-remote/vite.config.ts        (như trên)
  scripts/dev-stack.sh · scripts/dev-stop.sh           (guard/banner/healthcheck · verify port list)
  .env.example                                         (REMOTE_*/SITE_URL/NEXT_PUBLIC_SHELL_URL/IDENTITY_OAUTH_FE_REDIRECT_BASE/NOTIFY_MY_ORDERS_URL)
  frontend/apps/storefront-web/lib/site.ts             (shellUrl() default '')
  frontend/e2e/helpers/env.ts                          (SHELL default)
  docs/adr/0008-dev-one-origin-entry.md                (mới)
  README.md                                            (dev entry section)
  backend/gateway/src/main/resources/gateway-routes.yml (comment-only)

READ-ONLY: packages/{chrome,auth}/** · apps/storefront-web/middleware.ts · apps/*/src/** runtime code
· apps/*/package.json · gateway predicate/nginx/docker-compose/backend code · contracts/** · pnpm-lock
```

LƯU Ý dev-stack là script chung — `make dev` của người KHÔNG đụng SF phải vẫn chạy (default-on nhất quán, ADR ghi fallback 2-origin: set `REMOTE_*_URL` absolute).

## 4. Design (quyết định + rationale)

### D1 — Same-origin remotes: base-relative, MIRROR PROD

Prod đã giải đúng bài này: `frontend/Dockerfile.web` build remotes `--base=/remotes/<name>/` + bake `REMOTE_*_URL=/remotes/<name>` RELATIVE vào shell → remoteEntry same-origin qua gateway (nginx alias `/remotes/<name>/`). Library-level evidence: `@module-federation/vite@1.21.3` dev mode TÔN TRỌNG base (lib/index.js:6038,6043 — devEntryPath = config.base + …; :6068-69 middleware handle base-prefixed request). Dev làm đúng cơ chế:

- Remote dev server `base: '/remotes/<name>/'` → MỌI URL của remote (module, /@vite/client, deps cache, react-refresh path — lib:6370) nằm gọn dưới prefix → không ambiguate giữa các app.
- Shell entry default `/remotes/<name>/remoteEntry.js` (browser resolve same-origin theo entry origin).
- Proxy per-remote **GIỮ prefix**: Next `/remotes/checkout/:path*` → `http://localhost:5175/remotes/checkout/:path*`; shell vite server.proxy tương tự (target absolute, không strip).

**Alternative bị loại:** (a) prefix-STRIP proxy — remote import root-absolute `/@vite/client` + non-shared deps không phân biệt được app nào; (b) remoteEntry absolute cross-origin — chạy được nhưng vi phạm "same-origin qua entry" của spec slice epic.

### D2 — HMR: `hmr.clientPort` derive từ `DEV_PORT` (1 nguồn với server.port)

Page qua entry :3000 nhưng WS HMR nối TRỰC TIẾP server thật (lib:6515 — `hmr.clientPort || hmr.port || server.port`, host default localhost; path base-aware). Shell + MỖI remote config: `const port = Number(process.env.DEV_PORT ?? <default>)` → `server: { port, strictPort: true, hmr: { clientPort: port } }` (shell default 5173, remotes 5175-78). Rig +600 boot TỪNG app riêng với env riêng (turbo --parallel chia sẻ env → DEV_PORT chung = xung đột): `DEV_PORT=5773 pnpm --filter @ecommerce/shell exec vite` v.v.; Next: `next dev -p 3600` (CLI, không sửa package.json). Port VÀ clientPort cùng nguồn → không thể trỏ nhầm server thật đang chạy; strictPort chặn auto-increment drift.

### D3 — Env semantics TWO-SLOT: ENTRY chấp nhận relative · DESTINATION luôn absolute

- **Slot ENTRY** (shell `remotes[].entry`): nhận nguyên giá trị env (relative `/remotes/x` hoặc absolute) — bare `/x` + `/remoteEntry.js`; **unset → relative default** `/remotes/<name>`.
- **Slot DESTINATION** (Next rewrite dest + shell proxy target): LUÔN absolute — resolve bằng bảng tên→port (checkout 5175, account 5176, admin 5177, skeleton 5178) khi env relative/unset; chỉ dùng env khi khớp `^https?://`.
- Kết quả: relative env (mặc định mới) = 1-origin; absolute env = kill-switch 2-origin legacy (entry absolute như cũ); KHÔNG có path nào làm feature tắt ngầm.
- Next process đọc .env (Next auto-load) — normalize ở next.config.mjs; vite process KHÔNG thấy .env (chỉ process env) — cả 2 slot vẫn nhất quán.

### D4 — Rewrites list (route table ĐẦY ĐỦ từ App.tsx:156-289 + mirror gateway predicate)

APPEND vào rewrites() (giữ /api + /media nguyên vẹn). Pattern `X/:path*` = zero-or-more (phủ cả bare X):

```
shell pages:  /admin/:path*  /account/:path*  /cart/:path*  /checkout/:path*
              /order/confirmation/:path*  /login/:path*   (phủ /login, /login/2fa App.tsx:187,
                                                              /login/oauth/callback App.tsx:178)
              /register  /forgot-password  /reset-password  /skeleton  /ui-kit
shell dev:    /@vite/:path*  /src/:path*  /node_modules/:path*  /assets/:path*  (parity gateway)
              /favicon.ico  /favicon.svg
per-remote:   /remotes/checkout/:path* → 5175   /remotes/account/:path* → 5176
              /remotes/admin/:path* → 5177      /remotes/skeleton/:path* → 5178  (GIỮ prefix)
```

Destination shell = `${SHELL_ORIGIN:-http://localhost:5173}` + cùng path. An toàn collision: rewrites array = afterFiles (filesystem trước); shell-routes không trùng Next pages (app dir chỉ [locale] + search/coupons/c/p); middleware `rewriteTarget()` chỉ rewrite 5 nhóm /, /search, /coupons, /c/**, /p/** (đọc — pass-through shell-routes).

### D5 — `shellUrl()` → same-origin relative

Default `''` → link `shellUrl()+'/cart'` = `/cart` (cấm `//cart`). Env `NEXT_PUBLIC_SHELL_URL` override giữ (kill-switch cho links). Consumers grep: Header:35,44 · Footer:21 · WishlistHeart:58 · AddToCart:135 · WriteReviewModal:121 — đều template-prefix, không sinh `//`.

### D6 — dev-stack / e2e / docs

- dev-stack: guard boot = curl CẢ `ENTRY_URL` (default `http://localhost:3000`, env `DEV_ENTRY_URL` cho rig offset) VÀ shell origin (derive `${SHELL_ORIGIN:-http://localhost:5173}` — env-aware, không hardcode — chặn chế độ nửa sống, P2 critic); banner in entry URL + chế độ remotes (`1-origin /remotes/*` hay `2-origin legacy — REMOTE_*_URL absolute`); health check entry sau boot.
- e2e: `SHELL` default `http://localhost:3000`. 9 specs đọc SHELL → tự đi qua entry; 6 specs còn lại chỉ chạy SF-5 (risk transfer ghi ADR). auth-cookie FI-337 lock chuyển mục tiêu: trước = vite proxy :5173, sau = NEXT proxy :3000 (path /api không strip — next.config:14-18 — regex `Path=/api/identity` vẫn khớp); shift ghi rõ ADR, spec KHÔNG sửa (out of touch map).
- ADR 0008 + README: entry 1 URL, cách tắt (D3), probe evidence, prod note (rewrites dead-entry trong standalone manifest — gateway prod KHÔNG route qua Next — để SF-5 không květ khi đọc routes-manifest).

## 5. Impl outline + test strategy

Thứ tự: T0 probe (rig +600, evidence D1/D2 trước khi implement) → T1 implement config theo probe → T2 dev-stack/stop → T3 env/site/e2e helpers → T4 docs/ADR → T5 evidence: golden path 1-URL walkthrough (browser thật, Rule 0) + e2e subset qua rig.

**Probe evidence gates (T0 — quyết định trước khi commit implement):**
1. remoteEntry 3 remotes (checkout/account/admin) + skeleton load **same-origin**: network URL `/remotes/<name>/remoteEntry.js` KHÔNG kèm port khác (assert same-origin — không chỉ "không CORS/404").
2. HMR: sửa 1 file remote → hot update trang qua entry; sửa 1 file Next → hot update. Log/ws evidence.
3. `/admin` qua entry: AdminApp layout riêng full-bleed render.
4. Fallback chain nếu gãy: (A) clientPort direct-WS [chính]; (B) ws-through-entry nếu Next proxy WS [probe A/B]; (C) remoteEntry absolute cross-origin + no-HMR clientPort → ADR + REQUIREMENT-GAP epic — KHÔNG tự chế hướng khác.

Tests: unit `site.ts` (shellUrl default '' + env override); e2e subset golden-path + nav-honesty + auth-cookie qua rig offset; walkthrough screenshots so direction FI-390 (GIỮ visual).

## 6. Risks & unknowns

- **R1** @module-federation/vite dev + base prefix gãy runtime (đã có library evidence chiều thuận — lib:6038/6515 — nhưng chưa empirical) → T0 chặn; fallback chain §5.4.
- **R2** WS HMR xuyên Next rewrites: Next 14 dev KHÔNG forward WS upgrade qua rewrites (P2 critic — phương án B gần như chết, vẫn probe để có evidence); phương án chính là A (clientPort).
- **R3** :3000 bị stack session khác chiếm → mọi verify trên rig +600 (:3600/:5773/:5775-78, DEV_PORT env + `next dev -p 3600` CLI); :3000 là default config sẵn (package.json `next dev -p 3000` không đổi) — bật thật khi stack khác dừng/sau merge. Evidence ghi rõ entry=:3600 cùng topology.
- **R4** Set-Cookie xuyên Next proxy — regression lock auth-cookie chạy lại qua entry (shift mục tiêu ghi ADR).
- **R5** `.env` THẬT user còn REMOTE_* absolute → 2-origin âm thầm: dev-stack banner in chế độ + README "xóa/dổi relative để 1-origin".
- **R6** Boundary: remote vite.config.ts ngoài touch map gốc nhưng bracket What chỉ định "clientPort riêng mỗi remote" + "remotes load qua entry" → in-scope theo bracket; .env.example mở thêm 2 var (env-default only) → flag epic comment cả hai.

## 7. Spec-critic round 1 — xử lý

- **P0 routes thiếu** → D4 dùng route table đầy đủ App.tsx:156-289 (`/login/:path*` phủ 2FA+OAuth callback; +`/skeleton` `/ui-kit`); đã verify bằng mắt route table.
- **P1 rig port mechanism** → D2 `DEV_PORT` env 1 nguồn (port + clientPort + strictPort); rig = env + `next dev -p` CLI; package.json KHÔNG đổi.
- **P1 clientPort nhầm server** → cùng nguồn DEV_PORT (hết khả năng lệch).
- **P1 D3 ambiguity** → two-slot §D3; acceptance same-origin URL (§5.1).
- **P1 env leak** → IDENTITY_OAUTH_FE_REDIRECT_BASE + NOTIFY_MY_ORDERS_URL vào scope (flag epic); REMOTE_STOREFRONT_URL legacy note.
- **P1 spaFallback clobber** → exempt `/remotes` prefix (shell vite.config).
- **P2** (đã adopt): strictPort; guard 2 chân; auth-cookie shift ghi ADR; REMOTE_STOREFRONT_URL note; /assets parity; prod manifest note; e2e risk transfer. (Không adopt: thêm origin :5176 vào auth-cookie spec — spec file out of touch map.)
