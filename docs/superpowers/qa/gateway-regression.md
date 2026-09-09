# SF-5 gateway-routes + 127-redirect regression (FI-402)

> Rig: gateway isolated `:8480` (compose `fi397sf5`, network `fi397sf5-net`) · dev-rig entry `:3400`/shell `:5573` · Chạy: 2026-09-09 · Fork-point `a9a8fad` → HEAD `be9962c`.

## 1. Diff check (T6) — routes/nginx/compose

| File | Diff fork→HEAD | Verdict |
|---|---|---|
| `backend/gateway/src/main/resources/gateway-routes.yml` | 6+/3- — **comment-only** (non-comment diff = EMPTY, `grep -vE '^\s*#'` cả 2 bản); SF-3 `5e3d544` cập nhật ghi chú dev-entry :3000 + ADR 0008; predicates/filters/uri nguyên trạng | ✅ PASS (deviation vs pack-literal "rỗng" — đã ghi sweeps.md §2, epic ratify) |
| `infra/nginx/frontend-web.conf` | EMPTY | ✅ PASS |
| `docker-compose.yml` (base) | EMPTY (chỉ override-sf2.yml MỚI thêm từ SF-2 — file riêng) | ✅ PASS |

## 2. Functional route matrix qua gateway isolated :8480 (T6)

| Route | Expect (bảng gateway-routes) | Actual |
|---|---|---|
| `/actuator/health` | gateway UP | **200** `{"status":"UP"}` |
| `/` | storefront-web (Next SSR container) | **200** (`x-middleware-rewrite: /vi` — locale rewrite sống) |
| `/vi` | storefront | **200** |
| `/cart` | frontend-web (nginx shell SPA) | **200** |
| `/admin` | frontend-web (AdminApp layout riêng — không chrome wrap, verify visual T2/T7) | **200** |
| `/login` | frontend-web (mfe-account mount) | **200** |
| `/api/catalog/products?size=1` | catalog-service quaStripPrefix | **200** JSON items |
| `/api/identity/auth/login` (POST sai creds) | identity-service | **401** `Email hoặc mật khẩu không đúng` (pipe sống, đăng nhập thật T1 e2e) |
| `/remotes/checkout/remoteEntry.js` | nginx static remote | **200** |
| `/favicon.ico` | static | **200** |

**Verdict: PASS** — route split prod chạy đầy đủ; gateway-routes regression sạch.

## 3. 127-redirect matrix (T3) — 2 FINDINGS (sweep fail → fix-task)

### Finding #4 (CODE — SF-2 ownership): Next dev default-bind → 308 TỰ-CHỈ VÔ HẠN (loop)

`apps/storefront-web/middleware.ts:29-34` + `lib/host-redirect`: guard ĐÚNG đọc Host header (FI-399 fix), nhưng **build URL target từ `request.nextUrl.clone()`** — `nextUrl.hostname` là **BIND address** (memory FI-399: `next dev` default bind `localhost`):

| Trạng thái boot | Host header 127.0.0.1 | Kết quả |
|---|---|---|
| `next dev -p 3400` (default bind localhost — dev-stack recipe hiện tại) | `127.0.0.1:3400` | **308 `location: /cart?x=1` (RELATIVE)** → browser/curl loop vô hạn trên 127.0.0.1 (curl -L ×5 vẫn 308; xác minh 10:39) |
| `next dev -p 3401 -H 0.0.0.0` (probe) | `127.0.0.1:3401` | **308 `location: http://localhost:3401/cart?x=1` (ABSOLUTE)** — đúng spec: path+query giữ ✅ |
| prod container (:8480 gateway → storefront) | gateway rewrite Host → guard không fire (đúng — redirect chỉ meaningful cho direct dev access) | 200 nguyên trạng |

**Root cause**: `target.hostname = 'localhost'` là NO-OP khi bind đã là `localhost` → Next serialize Location relative (cùng host) → self-redirect loop. **Fix gợi ý** (fix-task SF-2, KHÔNG tự sửa): build target từ Host header thật (`http://localhost:<port-from-host><path+query>`) thay vì `nextUrl.clone()`. Sau merge story, dev boot mặc định sẽ dính loop này trên mọi máy.

### Finding #5 (ENV/BOOT — SF-3 dev-stack ownership): Vite dev bind `[::1]` ONLY → 127.0.0.1 connection refused

- Shell rig `:5573` (và main stack `:5173` — cùng hành vi): `lsof` → `TCP [::1]:5573 (LISTEN)` — KHÔNG có IPv4 loopback → `curl 127.0.0.1:5573` = **Connection refused** (000).
- Plugin redirect-127 trong `packages/config/vite-preset.mjs` code ĐÚNG (308 absolute `http://localhost:PORT/...`) nhưng **không bao giờ nhận được request 127.0.0.1** trên máy có Node ≥17 (DNS verbatim → `localhost` resolve ::1 đầu → server.listen bind ::1 duy nhất).
- Node v24.10.0 (rig này). **Fix gợi ý**: dev-stack/dev-fe boot vite với `--host` (bind cả IPv4) hoặc tài liệu hóa "dùng localhost, không 127.0.0.1"; acceptance epic "127.0.0.1:5173 → redirect" KHÔNG đạt được trên dev boot mặc định máy này vì listener không có trên 127.0.0.1.

### Negative checks (đạt trên cả 2 trạng thái)

- `/_next/*` KHÔNG bị redirect: `127.0.0.1:3401/_next/static/x.js` → **404** (không 308 — matcher loại trừ hoạt động; 404 vì file probe không tồn tại) ✅
- `/@vite/client`, favicon, `/api`, robots: matcher loại trừ ✅ (api đi rewrite /api riêng)
- localhost trực tiếp: `localhost:3400/vi` → **200**, không loop ✅

## 4. Verdict T3

**PARTIAL-FAIL (2 fix-task)**: tiêu chí "127.0.0.1 → localhost redirect giữ path+query" chỉ đạt khi Next boot `-H 0.0.0.0` (probe 3401) — dev boot mặc định = loop (finding #4); shell 127-redirect không test được vì listener không có trên 127.0.0.1 (finding #5). Negative checks ĐẠT. Fix-task đã comment epic FI-397; re-run sau khi fix merge (cap 2 vòng).
