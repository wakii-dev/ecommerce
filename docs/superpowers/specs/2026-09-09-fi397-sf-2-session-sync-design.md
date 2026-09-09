# SF-2 session-sync — Spec slice (FI-399, story FI-397)

> Ngày: 2026-09-09 · Tier: 0 · Nhánh: `wakii-dev/sf-2-session-sync` → đích `story/fi397-unify-frontend`
> Nguồn: epic spec `2026-09-08-frontend-unification-design.md` (§1 Q-sync đã chốt) + context pack `fi397-sf-2.md` (master 56cd136 — CHƯA trên story branch, pack đọc từ commit) + code hiện trạng đọc 09-09.
> Design: none (FI-390 hand-off giữ nguyên visual; SF này không đụng UI chrome).

## 0. Problem

Cookie refresh là **one-time rotate** (replay cookie cũ → 401, `auth-cookie.spec:41-72`). Hiện trạng `AuthStore.refresh()` (AuthStore.ts:136-160): refresh fail → `logout()` NGAY. Single-flight chỉ per-tab (AuthStore.ts:69-70). Khi N tab refresh đồng thời với cùng cookie: 1 thắng, N-1 POST bằng cookie đã rotate → 401 → **spurious logout user-visible**. Ngoài ra: login/logout ở 1 tab không lan sang tab khác (chỉ tự cập nhật ở lần refresh kế), và `127.0.0.1` vs `localhost` là 2 cookie host khác nhau.

Real problem = **sync tức thì đa tab KHÔNG kèm spurious logout** (race phải được điều phối, không chỉ broadcast thêm).

## 1. Scope

**In:**
1. Module `packages/auth/src/session-sync.ts` — BroadcastChannel (primary) + `storage` sentinel fallback + cross-tab refresh coordination + transition-only broadcast. SSR-guard lazy init.
2. AuthStore cắm điểm: auto-start listener trong `configureAuth` (exported wrapper AuthStore.ts:209) — idempotent; refresh 401 → retry ĐÚNG 1 lần sau backoff ~400ms TRƯỚC logout (đặt BÊN TRONG cross-tab lock).
3. Redirect `127.0.0.1` → `localhost`: Next middleware guard + matcher `_next`; Vite plugin middleware trong `packages/config/vite-preset.mjs` (không đụng SHARED_SINGLETONS — vùng SF-1).
4. Unit tests trong `packages/auth/src/__tests__/` — sync matrix, rotate-race 20 run, transition-only, receiver no-rebroadcast, 2FA no-broadcast, SSR sạch, guest-cart key binary check.
5. e2e extension `frontend/e2e/tests/auth-cookie.spec.ts` — multi-tab = 2 PAGES CÙNG Playwright context (login A→B thấy ngay; logout A→B out; 20-run race 0 spurious logout). Env tự thân (E2E_* vars).
6. ADR `docs/adr/0001-session-sync-contract.md`.
7. `docker-compose.override-sf2.yml` (repo root) — isolated stack +400 cho gate same-origin proof (recipe của pack).

**Out (boundary — theo pack):**
- KHÔNG đụng `packages/chrome/**` (SF-1), dev entry/proxy defaults + scripts/.env/e2e helpers (SF-3), layout swap (SF-4).
- KHÔNG đổi cookie contract/path/rotate backend; KHÔNG token vào storage/BC message; KHÔNG đổi 2FA/OAuth/merge-cart logic (chỉ cắm hooks).
- KHÔNG đổi logic affiliate/locale hiện có của middleware (chỉ thêm guard host-127 TRƯỚC logic + mở matcher `_next`).
- KHÔNG thêm dependency mới (kể cả devDep — test mock bằng tay, KHÔNG thêm jsdom vào packages/auth; xem §6.5).
- KHÔNG merge vào main; gate KHÔNG assert 1-URL entry (SF-3) hay chrome layout (SF-1/4).

## 2. Thiết kế session-sync (quyết định đã chốt ở epic + chi tiết hóa ở đây)

### 2.1 Hằng số & message contract

| Hằng | Giá trị | Ý nghĩa |
|---|---|---|
| Channel BC | `ecommerce.auth` | BroadcastChannel name |
| Lock | `ecommerce.auth-refresh` | `navigator.locks.request` name — origin-global, serialize POST refresh |
| Sentinel | `ecommerce.auth-sync` | localStorage key fallback, value `{v:1, t:<ms>, n:<nonce>}` — KHÔNG token |
| Message sync | `{type:'auth-changed'}` | KHÔNG mang token — receiver refresh cookie-roundtrip |
| Message handshake | `{type:'refresh-start'}` / `{type:'refresh-done'}` | fallback khi không có `navigator.locks`; KHÔNG触发 refresh |

Receiver bỏ qua message lạ/không parse được (defensive, không crash).

### 2.2 Broadcast transition-only — cắm kiểu subscriber-diff

Pack yêu cầu "cắm tại setToken (:80-84) và logout (:199-204) qua 1 wrapper nhỏ". Chọn **subscriber-diff**: session-sync đăng ký 1 listener qua `authStore.subscribe()`, giữ `wasAuthed = authStore.isAuthenticated()` trước đó; mỗi notify → so `isAuthenticated()` mới — CHỈ khiflip auth↔unauth thì broadcast. Đạt đúng semantics transition-only cho CẢ HAI điểm cắm (setToken + logout đều đi qua `notify()`), không đụng internals AuthStore:

- `setToken` lúc đã authed (refresh rotate token) → auth→auth, không broadcast → **chặn BC loop** (chính là quy tắc "receiver KHÔNG re-broadcast trừ khi chính nó transition").
- `logout` khi guest (`hadState=false` không notify) → không broadcast.
- 2FA challenge: `login()` throw TRƯỚC `setToken` (api.ts:60-62) → không broadcast (acceptance 3).
- OAuth callback `setToken` như thường → broadcast tự nổ (đúng).
- Boot-refresh tab mới: guest→authed là transition → broadcast; tab khác nhận → refresh (đã authed → không transition → không re-broadcast). Sóng N-tab tắt sau tối đa N broadcast — không loop.

### 2.3 Cross-tab refresh coordination (P0 — race one-time rotate)

`refresh()` mới:

```
refresh():
  # (giữ) refreshUrl chưa cấu hình → throw như cũ
  acquire cross-tab lock:
    navigator.locks có sẵn  → navigator.locks.request('ecommerce.auth-refresh', runInside)
    không có (fallback)     → BC handshake: nếu nhận refresh-start còn active → chờ done/timeout 5s;
                               broadcast refresh-start → runInside → refresh-done (finally)
  runInside():  # GIỮ single-flight per-tab như cũ BÊN TRONG lock (ensureRefreshed không đổi)
    POST refreshUrl (credentials include)
    200 + accessToken  → setToken → true
    !ok && status===401 → chờ backoff ~400ms → POST LẦN 2 (retry ĐÚNG 1 lần, vẫn trong lock)
                          200 → true; vẫn fail → logout + false
    !ok (khác 401) / mạng lỗi / body sai → logout + false (nguyên trạng)
```

Lý do retry **trong** lock: sau khi tab thắng xong, cookie mới là host-wide — tab chờ vào lock sẽ POST với cookie mới và thành công; retry ngoài lock sẽ tái tạo bầy N POST đồng thời. Backoff 400ms fixed (nằm trong khoảng ~300-500ms của pack; deterministic cho test — lock đã serialize nên không cần jitter).

Hmm-điểm chứng minh race: hôm nay N tab POST đồng thời cùng cookie C1 → 1 nhận Set-Cookie C2, N-1 dùng C1 đã revoke → 401 → logout ảo. Với lock: POST tuần tự, mỗi POST mang cookie mới nhất → tất cả 200.

### 2.4 Receiver flow

Nhận `{type:'auth-changed'}` (BC) hoặc storage event đúng sentinel key → gọi `authStore.refresh()` (cookie-roundtrip — không áp token từ message) → transition (nếu có) tự broadcast theo §2.2. Coordination §2.3 đảm bảo ≤1 POST refresh/tab/event. Lazy init toàn bộ client-only object trong `ensureStarted()`:

- Guard `typeof window === 'undefined'` → no-op hoàn toàn (SSR/Node sạch — renderToStaticMarkup không crash).
- `configureAuth()` (exported, AuthStore.ts:209) gọi `ensureStarted()` — idempotent bằng module-level flag; nhiều lần configure không nhân bản listener/channel.

### 2.5 SSR-guard lưu ý

Node 24 CÓ `BroadcastChannel` native → guard KHÔNG được dựa vào `typeof BroadcastChannel`; phải là `typeof window`. Test SSR chạy node env, spy `globalThis.BroadcastChannel` → configureAuth → assert constructor không được gọi.

## 3. Redirect 127.0.0.1 → localhost

### 3.1 Next (`apps/storefront-web/middleware.ts`)

- Dòng đầu `middleware()`: `nextUrl.hostname === '127.0.0.1'` → clone URL, đổi hostname sang `localhost` (giữ protocol/port/path/**query** — `?ref` vẫn đi qua capture ở hop sau), `NextResponse.redirect(url, 308)`. `localhost` không khớp trigger → không loop.
- Matcher: mở `_next/static|_next/image` → `_next` (loại trừ TOÀN BỘ `/_next/*` — redirect trên asset/data = refetch sai host; hôm nay middleware no-op trên `_next/data` nên behavior không đổi, chỉ nhanh hơn). Giữ nguyên `favicon|robots.txt|sitemap.xml|api`.
- Không đụng logic affiliate/locale — guard đặt TRƯỚC mọi logic hiện có.

### 3.2 Vite (`packages/config/vite-preset.mjs`)

- Plugin `redirect-127-to-localhost` inline trong cùng file: `configureServer` → `server.middlewares.use` (PRE — chạy trước spa-fallback/transform): `req.headers.host` bắt đầu `127.0.0.1` → 308 sang `localhost:<port><req.url>`; skip `upgrade` (HMR ws); skip khi host đã là localhost.
- Đưa vào `plugins: [federation(), redirect]` của `defineMfeConfig` — MỌI MFE dev server (shell + remotes) tự redirect. **KHÔNG đụng SHARED_SINGLETONS** (vùng SF-1, anchor rule epic §3).

## 4. Unit tests (packages/auth/src/__tests__/)

Môi trường: **node env mặc định của package (KHÔNG thêm jsdom devDep — dep freeze, giữ pnpm-lock 0 dep mới)**; giả lập browser bằng mock tay: `globalThis.window`, `localStorage`, `BroadcastChannel`, `navigator.locks` — đúng bộ API mà session-sync dùng. Pack ghi "jsdom mock" — ý là "môi trường giả lập có BC mock"; mock tay trong node đạt intent mà không thêm dep (ui-kit giữ jsdom riêng của nó).

| File | Case |
|---|---|
| `session-sync.test.ts` | transition-only: guest→authed 1 broadcast; refresh rotate (authed→authed) 0; logout 1; logout-when-guest 0. Receiver: nhận message → refresh đúng 1 lần, không áp token từ message; receiver đã authed → không re-broadcast; receiver transition → có broadcast (đúng quy tắc). BC không có → storage sentinel fallback được ghi/nhận. configureAuth ×2 → 1 channel duy nhất (idempotent). Message lạ → bỏ qua không crash |
| `session-sync-race.test.ts` | rotate-race 2 "tab" (2 store instance mô phỏng? — KHÔNG: 1 authStore singleton thật + 2 session-sync instance trên 1 BC bus mock, fetch mock xoay cookie: POST kề nhau phải tuần tự theo lock; tab "thua" vẫn authed). 20 chạy liên tiếp 0 logout. Fallback handshake (khóa không có) — same scenario. 401-retry: POST 1 → 401, POST 2 (sau backoff) → 200 → không logout; 401 cả 2 → logout sau ĐÚNG 2 POST |
| `ssr-guard.test.ts` | node thuần, không window: dynamic import + configureAuth → không ném, BroadcastChannel constructor không gọi |
| `guest-cart-key.test.ts` | binary: key literal trong `apps/storefront-web/components/pdp/AddToCart.tsx` ≡ `GUEST_CART_TOKEN_KEY` trong `apps/mfe-checkout/src/lib/cartApi.ts` (đọc file qua fs + regex — 2 app không import chéo được); simulate 2 app-context cùng 1 localStorage mock → ghi/đọc cùng key roundtrip |

`packages/auth/vitest.config.ts` MỚI nếu cần khai báo rõ `environment: 'node'` (hiện không có config — default node; thêm config chỉ khi pragma jsdom cần — theo thiết kế này KHÔNG cần).

## 5. e2e extension (auth-cookie.spec.ts) — 2 PAGES CÙNG context

Thêm describe MỚI vào file hiện có (giữ nguyên 4 test HTTP-level — regression lock FI-337 không đụng):

- Setup: 1 browser context, `pageA = page`, `pageB = await page.context().newPage()` — CÙNG cookie jar + storage + BC (P1 pack: multi-context = fail 100%).
- Cả 2 page mở SHELL (E2E_SHELL_URL, default :5173 — env tự thân, KHÔNG đợi SF-3).
- **Login sync**: A đi UI `/login` → submit → header `[data-testid="auth-user"]`. B (mở trước, guest) → expect auth-user xuất hiện KHÔNG reload (đóng dấu `window.__noReload = true` sau load; assert còn nguyên) + đếm POST `/api/identity/auth/refresh` của B qua `page.on('request')` == 1.
- **Logout sync**: A logout qua UserMenu → B expect `[data-testid="auth-guest"]`, auth-user mất, không reload.
- **20-run race regression**: 20 vòng — từ page A `evaluate`: tạo `BroadcastChannel('ecommerce.auth')` ngoài app, postMessage `{type:'auth-changed'}` → CẢ 2 page refresh đồng thời (đúng race thật) → serialized bởi lock → sau mỗi vòng assert CẢ HAI vẫn auth-user (0 spurious logout). Không assert đếm POST per-vòng (flaky) — assert tổng ≤ 2×20 + biên dự phòng.
- Selectors: giữ data-testid `auth-guest`/`auth-user` + text vi ('Đăng nhập', 'Đăng xuất') — song song semantic per boundary epic.

## 6. Gate same-origin proof — docker full ISOLATED (+400)

Làm theo recipe pack (nhúng sẵn):

1. `docker-compose.override-sf2.yml` (repo root, MỚI): map TẤT CẢ host-port +400 (gateway 8480, PG 5833, minio 9400, mailpit 1425/8425, mongo 27417, es 9600, redis 6777, rabbit 6072, mongo-express 8489, ordering 8490, keycloak +400 …) + prefix `container_name` (`fi397sf2-*`) — container là global, project name riêng KHÔNG đổi container_name → phải prefix kẻo đụng stack chính/FI-390. Inter-service vẫn DNS theo service name (không đổi).
2. `COMPOSE_PROJECT_NAME=fi397sf2 docker compose -p fi397sf2 -f docker-compose.yml -f docker-compose.override-sf2.yml --profile full up -d` → PG riêng, flyway chạy fresh.
3. FE rig +400: shell 5573, remotes 5575-5578 (`REMOTE_*_URL`), `GATEWAY_URL=http://localhost:8480` (vite proxy target — đã đọc env sẵn, KHÔNG đổi config). JWKS gateway → identity-service internal (không ảnh hưởng host-port).
4. `E2E_SHELL_URL=http://localhost:5573 pnpm --filter e2e test auth-cookie` → toàn bộ describe (HTTP-level + multi-tab) xanh trên same-origin thật.
5. Xong: `docker compose -p fi397sf2 down -v`.

Verify trước khi chạy: `docker ps` (container trùng tên?), `curl -4 http://localhost:8480/actuator/health` (IPv4/IPv6 gotcha — memory sf15), lsof ports.

## 7. ADR

`docs/adr/0001-session-sync-contract.md` — channel name, message shapes (sync + handshake + sentinel), transition-only rule (+vì sao chặn loop N-tab), coordination mechanism (Web Locks primary + BC handshake fallback + backoff-400ms-retry-once TRONG lock), SSR-guard (`typeof window`, KHÔNG `typeof BroadcastChannel` — Node có BC native), redirect 127→localhost (cookie host), guest-cart key contract. Roadmap migration (b) = SF-5, không ở đây.

## 8. Risks & unknowns (đã probe)

| Rủi ro | Giảm |
|---|---|
| Node có BroadcastChannel native → SSR guard sai nếu check `typeof BroadcastChannel` | Guard `typeof window`; test SSR spy constructor (§2.5) |
| jsdom devDep phá pnpm-lock-0-dep (epic criterion 9) | Không thêm — mock tay node env (§4) |
| Compose isolated đụng stack chính (container_name global) | Override prefix container + port; check `docker ps` trước |
| storage event double-delivery cùng BC | Chỉ ghi sentinel khi BC KHÔNG khả dụng; single-flight per-tab hấp thụ trigger kề nhau |
| Wave N-tab khi nhiều guest nhận auth-changed | Mỗi tab broadcast tối đa 1 lần/state-flip → tắt tự nhiên (§2.2) |
| e2e flaky đếm POST race 20-run | Chỉ assert KHÔNG logout + biên tổng POST (§5) |
| `middleware.ts` matcher mở `_next` đổi behavior affiliate/locale | Ngày nay middleware no-op trên `_next/data` (rewriteTarget null + locale null) — chỉ fast-path; test bằng curl -I |
| SF-1 song song cũng đụng vite-preset.mjs (SHARED_SINGLETONS) | Khác vùng file; merge SF-1 → SF-2 giữ CẢ HAI (anchor rule epic) |

## 9. ACCEPTANCE (ràng buộc Phase 5 — copy từ pack, KHÔNG đổi)

1. 2 pages CÙNG context (same origin — docker isolated :8480 hoặc dev cùng app): login A → B header user NGAY (≤1 POST refresh, KHÔNG reload); logout A → B out ngay. KHÔNG demo cross-origin :3000↔:5173.
2. 20 chạy liên tiếp rotate-race: 0 spurious logout (unit regression + e2e).
3. 2FA challenge không broadcast session sai (unit — challenge không set token).
4. `127.0.0.1:3000` + `127.0.0.1:5173` → redirect `localhost` giữ path/query (curl -I); asset `/_next/*` KHÔNG redirect.
5. Reload SSR page không crash — renderToStaticMarkup/import Node sạch.
6. Unit packages/auth xanh + e2e auth-cookie extension xanh.
