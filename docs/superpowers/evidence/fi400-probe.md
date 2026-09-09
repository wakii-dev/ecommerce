# FI-400 Probe Report — HMR + remoteEntry + rewrites (rig +600)

Date: 2026-09-09 · Rig: Next :3600 (entry) · shell :5773 · remotes :5775-5778 · backend gateway :8080 (stack session khác — shared contracts)
Env rig: `DEV_PORT=5773/5775/5776/5777/5778` (vite, port+clientPort+strictPort 1 nguồn) · Next: `SHELL_ORIGIN=http://localhost:5773 REMOTE_*_URL=http://localhost:5775-78 next dev -p 3600` · shell: `REMOTE_<NAME>_PORT=5775-78` (proxy target override).

## Gate 1 — remoteEntry same-origin qua entry — **PASS**

Network (performance entries, trang `/cart` qua :3600):

```
/remotes/skeleton/remoteEntry.js → 200
/remotes/account/remoteEntry.js  → 200
/remotes/checkout/remoteEntry.js → 200
/remotes/admin/remoteEntry.js    → 200
/remotes/<name>/node_modules/.vite/deps/* → 200   (deps bọc theo base prefix)
/remotes/<name>/@fs/<abs>/...    → 200   (module fs bọc theo base prefix)
```

KHÔNG một request nào mang port khác (same-origin tuyệt đối) — 0 CORS/404. Base-relative design (`base: '/remotes/<name>/'` + proxy giữ prefix) khớp đúng lib evidence `@module-federation/vite@1.21.3` lib/index.js:6038/6043/6068.

## Gate 2 — HMR 2 phía qua entry — **PASS**

| Phía | Hành động | Kết quả đo được | Loại |
|---|---|---|---|
| Next (storefront) | sửa `components/home/FlashDealSection.tsx` | text mới hiện **không reload** (`window.__NEXT_MARKER` persist) | Fast Refresh thật |
| Shell host | sửa `apps/shell/src/header/Header.tsx` | text mới hiện **không reload** (`window.__HMR_MARKER` persist) | Fast Refresh thật |
| Remote (checkout) | sửa `apps/mfe-checkout/src/pages/CartPage.tsx` | trang **tự full-reload** (marker wipe) + text mới hiện, 0 thao tác tay | auto full-reload qua relay |

Remote chain đã verify từng mắt xích: checkout log `[vite] hmr update /src/pages/CartPage.tsx` → metadata endpoint `{remote:"mfe_checkout",wsUrl:"ws://localhost:5775/remotes/checkout/?token=…"}` (clientPort!) → shell relay Node-to-Node → `full-reload` cho browser qua ws shell. Revert file → trang tự cập nhật ngược lại (round-trip).

## Gate 3 — /admin layout riêng qua entry — **PASS**

`:3600/admin` → RBAC redirect `/login` khi chưa đăng nhập → login `admin@demo.vn` **qua entry** (Next /api rewrite → gateway) → tự về `/admin`: AdminApp sidebar riêng (TỔNG QUAN/SẢN PHẨM/ĐƠN HÀNG/…), topbar admin, dashboard data sống. Shell Header giữ cho auth widget — đúng hiện trạng base (App.tsx:154-155 "shell Header vẫn giữ cho auth widget", full-bleed ngoài main 960). Screenshot: `docs/superpowers/walkthroughs/fi400-rig-admin.png`, `fi400-rig-cart.png`.

## Gate 4 — Deep-link F5 — **PASS**

`/login/2fa` `/account/orders` `/account` `/order/confirmation` `/register` `/checkout` — tất cả 200 + shell index (client router render đúng route).

## Phát hiện kỹ thuật (đút túi ADR + người sau)

1. **Next path-to-regexp chặn adjacency `@`**: source `/@:path*` KHÔNG match `/@vite/client` (404 im lặng); dạng tách segment `/@vite/:path*` hoạt động. Shell dev assets cần explicit: `/@vite /@id /@fs /@react-refresh`.
2. **next.config load-once**: đổi rewrites phải restart `next dev` — rig script phải idempotent về điểm này.
3. **MF remoteHmr gate**: toàn bộ plumbing HMR-remote nằm sau `dev.remoteHmr` (pluginDevRemoteHmr `isRemoteHmrEnabled` đứng trước) — KHÔNG set = không có gì chạy, im lặng. Đã set `dev: { remoteHmr: 'full-reload' }` trong `packages/config/vite-preset.mjs` (federation opts — ngoài 2 vùng được bảo vệ SHARED_SINGLETONS/redirect; flag epic R6).
4. **Strategy 'native' KHÔNG deliver cho federated module** (probe thật: ws established, server push, client không fetch, console sạch) → `full-reload` là cơ chế cross-federation chính thức của plugin (relay Node-to-Node). HMR remote = tự reload trang (không fast-refresh) — giới hạn của plugin, ghi ADR.
5. **Relay resolve qua SHELL origin**: `getRemoteHmrEndpoint` = `http://localhost:<shell port>/remotes/<name>/__mf_hmr` → shell's own proxy `/remotes/*` PHẢI trúng remote thật → thêm `REMOTE_<NAME>_PORT` override (rig/debug) ngoài `REMOTE_*_URL` (D3 slot DESTINATION).
6. **ws của vite yêu cầu subprotocol `vite-hmr`** — probe tay không có subprotocol → treo/timeout (nhầm là chết).
7. **spa-fallback shell phải exempt `/remotes`** (middleware pre-proxy) — đã thêm; không exempt thì `/remotes/<name>/@vite/client` bị rewrite `/` → remote client chết.

## Quyết định variant (theo spec §5.4)

- D1 base-relative: **CONFIRMED** (gate 1).
- D2 HMR: hybrid — host/shell + Next = fast-refresh ws trực tiếp clientPort; remote = auto full-reload qua relay clientPort. Option (A) clientPort là transport CHUẨN cho cả hai (wsUrl relay dùng clientPort); option (B) ws-through-entry không cần (clientPort sống); hậu quả: remote edit = reload trang thay vì hot-swap — chấp nhận theo thiết kế plugin, ghi ADR + acceptance #3 diễn giải "hot update trang shell" = trang tự cập nhật không thao tác tay.
