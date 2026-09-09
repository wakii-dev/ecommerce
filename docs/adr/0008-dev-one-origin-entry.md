# ADR 0008 — dev one-origin entry: 1 URL :3000, remotes same-origin mirror prod

Date: 2026-09-09 · Status: Accepted · Decides FI-400 (SF-3 dev-one-origin-entry, story FI-397)

## Context

Dev topology trước SF-3 là **2 origin**: storefront Next `:3000` (public pages)
và shell Vite MF `:5173` (cart/checkout/account/admin), remotes load cross-origin
trực tiếp :5173→:5175-78. Hệ quả:

- **BroadcastChannel chỉ tồn tại cùng origin** → session-sync tức thì của SF-2
  chết khi user đi qua 2 origin.
- **localStorage port-scoped** → guest cart token storefront và shell tách biệt;
  cart "mất" khi cross-app.
- UX dev/demo/e2e phải nhớ 2 URL.

Prod đã giải đúng bài này từ SF-10/D16: `frontend/Dockerfile.web` build remotes
`vite build --base=/remotes/<name>/` + bake entry RELATIVE
`/remotes/<name>/remoteEntry.js` vào shell → mọi thứ same-origin qua gateway
:8080 (nginx alias). Dev không cần chế riêng — làm cùng cơ chế.

## Decision

1. **1 entry duy nhất `http://localhost:3000`** — Next làm front-router dev:
   `next.config.mjs` APPEND shell-routes vào mảng rewrites hiện có (afterFiles —
   filesystem trước; /api + /media nguyên vẹn). Route table ĐẦY ĐỦ từ
   `apps/shell/src/App.tsx:156-289` (`/admin/:path*` `/account/:path*`
   `/cart/:path*` `/checkout/:path*` `/order/confirmation/:path*`
   `/login/:path*` — `:path*` zero-or-more phủ cả bare — + `/register`
   `/forgot-password` `/reset-password` `/skeleton` `/ui-kit`) + shell dev assets
   (`/@vite` `/@id` `/@fs` `/@react-refresh` `/src` `/node_modules` `/assets`
   `/favicon.*`) + per-remote `/remotes/<name>/:path*` GIỮ prefix. Destination
   shell = `SHELL_ORIGIN` (default `http://localhost:5173`).
   Lưu ý path-to-regexp Next: source `/@:path*` KHÔNG match `/@vite/client`
   (404 im lặng) — phải tách segment `/@vite/:path*` (probe FI-400 phát hiện #1).
2. **Remotes same-origin base-relative — MIRROR PROD, không chế riêng:** 4
   remote dev `base: '/remotes/<name>/'` (checkout 5175 · account 5176 · admin
   5177 · skeleton 5178) → mọi URL của remote (module, /@vite/client, deps
   cache, react-refresh) nằm gọn dưới prefix; shell entry mặc định RELATIVE
   `/remotes/<name>/remoteEntry.js` (browser resolve same-origin theo entry
   origin). Next rewrite lẫn shell `server.proxy /remotes/<name>` đều GIỮ prefix
   (không strip). `@module-federation/vite@1.21.3` tôn trọng base trong dev
   (lib evidence lib/index.js:6038/6043/6068; empirical gate 1 — probe report).
3. **HMR — hybrid (probe gate 2):**
   - Host/shell + Next: ws HMR nối TRỰC TIẾP server thật qua `hmr.clientPort`
     (bypass entry) → Fast Refresh thật 2 phía. Next 14 dev KHÔNG forward WS
     upgrade qua rewrites nên clientPort direct-WS là phương án chính (R2 —
     ws-through-entry không cần).
   - Remote: `dev.remoteHmr: 'full-reload'` trong
     `frontend/packages/config/vite-preset.mjs` — plugin relay Node-to-Node:
     remote publish metadata `/remotes/<name>/__mf_hmr` (qua shell proxy), shell
     fetch wsUrl (dùng clientPort — `ws://localhost:<clientPort>/…`) rồi push
     `full-reload` cho browser qua ws shell → **remote edit = trang shell tự
     reload** (không thao tác tay, không fast-refresh).
   - **Giới hạn ghi nhận:** remote edit = reload trang, KHÔNG hot-swap — giới
     hạn của plugin @module-federation/vite 1.21.3; probe strategy `native`
     KHÔNG deliver cho federated module (ws established, server push, client
     không fetch — probe phát hiện #4). Chấp nhận theo thiết kế plugin.
   - Vite ws yêu cầu subprotocol `vite-hmr` — probe tay thiếu subprotocol treo
     im lặng, dễ kết luận nhầm WS chết (phát hiện #6).
4. **`DEV_PORT` 1 nguồn duy nhất** (shell + mỗi remote): `server.port` +
   `hmr.clientPort` + `strictPort: true` derive từ cùng env — hết khả năng
   clientPort trỏ nhầm server; port bận fail LOUD thay vì auto-increment lệch
   rewrite dest. Rig/debug boot TỪNG app riêng với env riêng (turbo --parallel
   chia sẻ env, không override per-app được): `DEV_PORT=5773 pnpm --filter
   @ecommerce/shell exec vite` + `next dev -p 3600` (CLI — không sửa
   package.json).
5. **Env two-slot D3:** slot ENTRY (`remotes[].entry` shell) nhận nguyên giá trị
   env — relative `/remotes/<name>` (mặc định mới) hoặc absolute legacy; slot
   DESTINATION (Next rewrite dest + shell proxy target) LUÔN absolute — env chỉ
   dùng khi khớp `^https?://`, còn lại resolve theo bảng port chuẩn.
   `REMOTE_<NAME>_PORT` override port target cho rig/debug khi remote chạy port
   lệch chuẩn mà muốn giữ entry relative.
6. **`shellUrl()` default `''`** (`lib/site.ts`) → link `shellUrl()+'/cart'` =
   `/cart` same-origin (env `NEXT_PUBLIC_SHELL_URL` giữ làm kill-switch links).
   **e2e `SHELL` default `http://localhost:3000`** (`frontend/e2e/helpers/env.ts`)
   — 9 specs đọc SHELL tự đi qua entry, spec files KHÔNG sửa.

**Cách tắt — kill-switch 2-origin legacy:** set `REMOTE_*_URL` absolute
(`http://localhost:5175`…) + `NEXT_PUBLIC_SHELL_URL` absolute trong `.env` —
remoteEntry cross-origin + links thẳng shell như trước SF-3. **2 kênh leak phải
đổi CẢ HAI** (chỉ đổi REMOTE_* thì links storefront→shell vẫn absolute, và ngược
lại) — banner `make dev` in chế độ hiện tại + cảnh báo kênh
`NEXT_PUBLIC_SHELL_URL`.

**Prod KHÔNG đổi:** rewrites chỉ sống trong standalone routes-manifest của Next
(dev — dead-entry ở prod: gateway prod route shell-web → nginx `frontend-web`
profile full, KHÔNG qua Next); gateway-routes predicate shell-web nguyên trạng.
SF-5 đọc routes-manifest: đừng hiểu nhầm rewrites = prod route.

**Regression lock auth-cookie (FI-337):** mục tiêu spec chuyển từ vite proxy
:5173 → NEXT proxy :3000 (path /api KHÔNG strip trong next.config — regex
`Path=/api/identity` trong Set-Cookie vẫn khớp). Risk transfer: 6/15 e2e specs
chỉ chạy ở SF-5 — phần còn lại của lock chạy lại khi SF-5 thực thi.

## Consequences

- `make dev`: guard boot 2 chân (`ENTRY_URL` + `SHELL_ORIGIN` — nửa sống nửa
  chết vẫn boot để leg chết dậy; env-aware `DEV_ENTRY_URL` cho rig offset),
  banner in entry URL + chế độ remotes (1-origin / 2-origin legacy) + cảnh báo
  `NEXT_PUBLIC_SHELL_URL`, health check entry warn-only sau boot.
- **R5 — `.env` thật cũ (gitignored):** user copy từ bản trước còn
  `REMOTE_*_URL` absolute → 2-origin âm thầm. Banner dev-stack in chế độ; muốn
  1-origin phải TỰ sửa `.env` sang `/remotes/<name>` (xóa dòng cũng được —
  default đã relative) + bỏ trống `NEXT_PUBLIC_SHELL_URL` nếu có. Repo không tự
  ghi đè `.env` của ai.
- **`docs/demo-script.md` stale post-merge:** phần preflight/error của nó vẫn
  dạy 2-URL (:5173 trực tiếp). Sửa nằm ngoài scope SF-3 — follow-up doc pass
  sau merge.
- spa-fallback shell exempt `/remotes` prefix — không exempt thì middleware
  pre-proxy rewrite mọi GET không-dấu-chấm về `/` và nuốt
  `/remotes/<name>/@vite/client` (probe phát hiện #7).
- `next.config` load-once: đổi rewrites phải restart `next dev` (phát hiện #2).
- `/admin` qua entry: AdminApp full-bleed (không chrome wrap) — shell Header chỉ
  giữ cho auth widget, đúng hiện trạng App.tsx.

## Refs

- Story FI-397 · SF-3 dev-one-origin-entry (FI-400)
- Probe evidence: `docs/superpowers/evidence/fi400-probe.md` (4 gates PASS +
  7 phát hiện + variant decisions)
- Spec: `docs/superpowers/specs/2026-09-09-sf3-dev-one-origin-entry-design.md`
  (D1-D6 · §6 R1-R6)
- Plan: `docs/superpowers/plans/2026-09-09-sf3-dev-one-origin-entry-plan.md` Task T4
- Precedent: SF-10/D16 route split (gateway-routes.yml shell-web) ·
  Dockerfile.web bake `--base=/remotes/<name>/`
