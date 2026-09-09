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
6. ADR `docs/adr/0008-session-sync-contract.md` (0001-0007 đã chiếm — 0005 còn duplicate 2 lần trong tree, không đụng).
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
| Sentinel | `ecommerce.auth-sync` | localStorage key fallback, value `{v:1, t:<ms>, n:<nonce>}` — KHÔNG token. `n` = nonce random để value LUÔN khác giữa 2 lần ghi (storage event KHÔNG fire khi newValue giống cũ — 2 transition trong cùng ms cần nonce để event vẫn nổ) |
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
  đo contention TRƯỚC khi vào: (a) fallbackMode? (b) navigator.locks.query() có holder
  không phải mình? (handshake-start KHÔNG nằm trong điều kiện này — refresh-start chỉ tồn tại
  ở fallback mode, đã cover bởi (a); KHÔNG broadcast handshake khi có locks)
  acquire cross-tab lock:
    navigator.locks có sẵn  → navigator.locks.request('ecommerce.auth-refresh', runInside)
    không có (fallback)     → jitter 50-150ms → nếu thấy refresh-start remote còn active → chờ
                               done/timeout 5s → re-check → broadcast refresh-start → runInside →
                               refresh-done (finally). BEST-EFFORT — message-crossing 2 tab start
                               cùng lúc KHÔNG được serialize đầy đủ (đã khai báo, xem §4/§7)
  runInside():  # GIỮ single-flight per-tab như cũ BÊN TRONG lock (ensureRefreshed không đổi)
    POST refreshUrl (credentials include, AbortSignal.timeout(10s) — fetch treo không giữ lock vô hạn)
    200 + accessToken  → setToken → true
    !ok && status===401 → CHỈ retry khi CÓ bằng chứng rotate có thể xảy ra lúc mình chờ:
                            (a) đang fallback mode, hoặc (b) lock có contender lúc đo contention.
                          Không contender + không fallback → 401 là cookie thật chết (expiry/
                          revoke/logout app khác) → logout NGAY, 1 POST duy nhất.
                          Retry: chờ backoff 400ms → POST LẦN 2 (vẫn trong lock) — 200 → true;
                          vẫn fail → logout + false. Retry CHỈ 1 lần, KHÔNG đệ quy.
    !ok (khác 401) / mạng lỗi / body sai → logout + false (nguyên trạng)
```

Lý do retry **trong** lock + **có điều kiện**: sau khi tab thắng xong, cookie mới là host-wide — tab chờ vào lock sẽ POST với cookie mới và thành công (401 khi có contention chỉ còn nghĩa cookie chết thật). Điều kiện (a)/(b) giữ đúng quyết định epic "retry ĐÚNG 1 lần" (retry tồn tại cho fallback mode + race lạc) mà không đánh thuế MỌI guest-boot: `initAccountShell` boot-refresh tab guest (mfe-account bootstrap.tsx:41, POST refresh :54) không contender → 1 POST, không delay 400ms authReady. Backoff 400ms fixed (trong khoảng ~300-500ms pack; deterministic cho test).

**Seam cơ chế (chốt — không 2 cách implement):** logic coordination KHÔNG nằm trong AuthStore. `createSessionSync(store, deps?)` **wrap `store.refresh`**: giữ nguyên bản gốc, thay bằng bản đã lock+retry; `stop()` trả nguyên bản (restore). Deps inject: `{ bus, locks, storage, backoffMs, jitter }` — production dùng Web APIs thật; singleton path `configureAuth → ensureStarted() → createSessionSync(authStore)` (đúng code production); test DI 2 store + mock deps (đúng seam production → test kiểm ĐÚNG code chạy thật).

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
| `session-sync-race.test.ts` | rotate-race **2 tab thật = 2 instance**: `export class AuthStore` (additive — instance singleton `authStore` giữ nguyên) + `createSessionSync(store, deps)` factory DI (bus/locks/storage/fetch/backoff injectable). Shared mock: BC bus phát cho CẢ 2 instance; **cookie-jar fetch mock xoay thật** (giữ biến currentCookie — mỗi POST đọc jar hiện tại rồi Set jar mới; POST mang cookie cũ sau rotate → 401 — đúng vật lý one-time rotate); **navigator.locks mock queue THẬT** (request() xếp callback, chỉ chạy callback kế khi promise trước resolve — KHÔNG gọi-through). Kịch bản: 2 tab refresh đồng thời → lock tuần tự → cả 2 200, 0 logout; 20 chạy liên tiếp 0 logout. Fallback handshake (locks không có): **scripted delivery** (giả lập message đến tuần tự — khai báo best-effort, KHÔNG claim message-crossing đồng thời). 401-retry có điều kiện: fallback mode → POST 1 401, POST 2 sau backoff 200 → không logout; không contender + không fallback → 401 → logout NGAY sau ĐÚNG 1 POST; contender có → 401 → retry → đúng 2 POST. Boot guest không contender → 1 POST, không backoff delay |
| `ssr-guard.test.ts` | node thuần, không window: dynamic import + configureAuth → không ném, BroadcastChannel constructor không gọi |
| `guest-cart-key.test.ts` | binary: key literal trong `apps/storefront-web/components/pdp/AddToCart.tsx` ≡ `GUEST_CART_TOKEN_KEY` trong `apps/mfe-checkout/src/lib/cartApi.ts` (đọc file qua fs + regex — 2 app không import chéo được); simulate 2 app-context cùng 1 localStorage mock → ghi/đọc cùng key roundtrip |

`packages/auth/vitest.config.ts` MỚI nếu cần khai báo rõ `environment: 'node'` (hiện không có config — default node; thêm config chỉ khi pragma jsdom cần — theo thiết kế này KHÔNG cần).

Lưu ý thiết kế: session-sync register/unregister SẠCH theo store instance qua seam đã chốt ở §2.3 (createSessionSync wrap `store.refresh`, `stop()` restore) — 2 instance test không được chạm listener của nhau; singleton path (`configureAuth` → `createSessionSync(authStore)`) vẫn start tự động như §2.4.

## 5. e2e extension (auth-cookie.spec.ts) — 2 PAGES CÙNG context

Thêm describe MỚI vào file hiện có (giữ nguyên 4 test HTTP-level — regression lock FI-337 không đụng):

- Setup: 1 browser context, `pageA = page`, `pageB = await page.context().newPage()` — CÙNG cookie jar + storage + BC (P1 pack: multi-context = fail 100%).
- **User cấp bằng API trước** (beforeAll, pattern `newCredentials` như 4 test HTTP-level hiện có — POST register trực tiếp, KHÔNG register qua UI).
- Cả 2 page mở SHELL (E2E_SHELL_URL, default :5173 — env tự thân, KHÔNG đợi SF-3).
- **Login sync**: A đi UI `/login` → submit → header `[data-testid="auth-user"]`. B (mở trước, guest, load XONG) → **gắn `page.on('request')` counter SAU khi B load xong** (boot-refresh guest của B không tính — `initAccountShell` tự POST 1 lần lúc boot) → sau login A: expect auth-user xuất hiện ở B KHÔNG reload (đóng dấu `window.__noReload = true` sau load; assert còn nguyên) + counter B đếm ĐÚNG 1 POST `/api/identity/auth/refresh`.
- **Logout sync**: A logout qua UserMenu → B expect `[data-testid="auth-guest"]`, auth-user mất, không reload.
- **20-run race regression**: 20 vòng — từ page A `evaluate`: tạo `BroadcastChannel('ecommerce.auth')` ngoài app, postMessage `{type:'auth-changed'}` → CẢ 2 page refresh đồng thời (đúng race thật) → serialized bởi lock → sau mỗi vòng assert CẢ HAI vẫn auth-user (0 spurious logout). Không assert đếm POST per-vòng (flaky) — assert TỔNG refresh POST cả 2 page trong 20 vòng ≤ 40 (2×20) + 10 slack (reconnect/boot nhiễu) = **≤ 50**; vượt → coordination hỏng (storm).
- Selectors: giữ data-testid `auth-guest`/`auth-user` + text vi ('Đăng nhập', 'Đăng xuất') — song song semantic per boundary epic.

## 6. Gate same-origin proof — isolated stack +400

**Recipe (spec-critic P0 đã chốt — tự thân, không improvising):**

Preflight của e2e (`global-setup.ts` → `helpers/env.ts`) CHẠY MỌI lần và check 4 thứ — trong đó `MAILPIT_API = 'http://localhost:8025'` HARDCODE không override được, và `helpers/env.ts` + `playwright.config.ts` nằm NGOÀI touch map (SF-3) → gate PHẢI đáp ứng preflight bằng hạ tầng, KHÔNG sửa code:

| Preflight check | Đáp ứng ở gate |
|---|---|
| gateway `${GATEWAY_URL}` | `GATEWAY_URL=http://localhost:8480` — dùng TÊN NÀY (precedence cao nhất: `env('GATEWAY_URL') || env('E2E_GATEWAY_URL') || default`, env.ts:42); trùng luôn var proxy bước 3. KHÔNG để repo-root `.env` chứa `GATEWAY_URL` khác lúc gate (nếu có → temp rename trong gate) |
| storefront `:3000` | `E2E_STOREFRONT_URL=http://localhost:5573` (probe shell sống là đủ — spec auth-cookie không đụng Next) |
| shell `E2E_SHELL_URL` | `E2E_SHELL_URL=http://localhost:5573` |
| mailpit `:8025` (hardcode) | **CHỐT 1 phương án**: dùng mailpit `:8025` đang sống trên máy (main stack `ecommerce-mailpit` — đã verify 09-09, chỉ nhận mail không xung đột state auth); nếu lúc gate `:8025` chết → `docker run -d --name fi397sf2-mailpit -p 8025:8025 axllent/mailpit` rồi xoá sau gate. KHÔNG map mailpit isolated sang port khác (preflight không đọc được env) |

Stack isolate (JVM recipe — tránh build ~10 Spring images từ đầu: `docker images` xác nhận 0 image service tồn tại, active compose project `ecommerce` thuộc SF khác KHÔNG được đụng):

1. `docker-compose.override-sf2.yml` (repo root, MỚI): map TẤT CẢ host-port +400 + prefix `container_name` `fi397sf2-*` (container là global — project name riêng KHÔNG đổi container_name) → file này phục vụ **SF-5 full regression**; gate SF-2 chỉ `up` dịch vụ cần: `docker compose -p fi397sf2 -f docker-compose.yml -f docker-compose.override-sf2.yml up -d --no-deps postgres` (PG fresh 5833, flyway db_identity migrate sạch).
2. JVM isolate (keys ABSOLUTE path — memory springboot-run-cwd): identity-service `SERVER_PORT=8481 SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5833/db_identity JWT_{PRIVATE,PUBLIC}_KEY_PATH=<repo>/infra/keys/...`; gateway `SERVER_PORT=8480 IDENTITY_URI=http://localhost:8481 IDENTITY_JWKS_URI=http://localhost:8481/.well-known/jwks.json` (JWKS trỏ ĐÚNG — 401 thầm lặng memory sf15). Verify: `curl -4 http://localhost:8480/actuator/health` + login round-trip curl.
3. FE rig +400, **boot với `--host` (bind tất cả interface — else 127.0.0.1 không với tới server, IPv4/IPv6 memory)**: shell 5573, remotes 5575-5578 (`REMOTE_*_URL`), `GATEWAY_URL=http://localhost:8480` (vite proxy đọc env sẵn, KHÔNG đổi config).
4. `GATEWAY_URL=http://localhost:8480 E2E_SHELL_URL=http://localhost:5573 E2E_STOREFRONT_URL=http://localhost:5573 pnpm --filter @ecommerce/e2e exec playwright test auth-cookie` (package tên `@ecommerce/e2e`, script là `playwright test` — KHÔNG có script `test`; cú pháp `exec` đã verify ở plan SF-5) → toàn bộ describe (HTTP-level + multi-tab) xanh trên same-origin thật.
5. Xong: kill JVMs + `docker compose -p fi397sf2 down -v` (+ xoá standalone mailpit nếu đã tạo).

Verify trước khi chạy: `docker ps` (container trùng tên?), `lsof` từng port, `curl -4` từng host trước khi test (port-squatting IPv4 gotcha).

## 7. ADR

`docs/adr/0008-session-sync-contract.md` — channel name, message shapes (sync + handshake + sentinel + nonce dùng để đảm bảo storage event luôn fire), transition-only rule (+vì sao chặn loop N-tab), coordination mechanism (Web Locks primary + BC handshake fallback **best-effort** + backoff-400ms retry-once TRONG lock VỚI điều kiện contention/fallback — guest boot uncontended không bị đánh thuế 2 POST + 400ms), AbortSignal.timeout(10s) trên POST refresh (fetch treo không giữ lock vô hạn), SSR-guard (`typeof window`, KHÔNG `typeof BroadcastChannel` — Node có BC native), redirect 127→localhost (cookie host), boot-wave N tab = O(N²) POST thừa tự tắt (ghi nhận là chi phí đã biết, không phải bug), guest-cart key contract. Roadmap migration (b) = SF-5, không ở đây.

## 8. Risks & unknowns (đã probe)

| Rủi ro | Giảm |
|---|---|
| Node có BroadcastChannel native → SSR guard sai nếu check `typeof BroadcastChannel` | Guard `typeof window`; test SSR spy constructor (§2.5) |
| jsdom devDep phá pnpm-lock-0-dep (epic criterion 9) | Không thêm — mock tay node env (§4) |
| Compose isolated đụng stack chính (container_name global) | Override prefix container + port; check `docker ps` trước |
| storage event double-delivery cùng BC | Chỉ ghi sentinel khi BC KHÔNG khả dụng; single-flight per-tab hấp thụ trigger kề nhau |
| Wave N-tab khi nhiều guest nhận auth-changed | Mỗi tab broadcast tối đa 1 lần/state-flip → tắt tự nhiên (§2.2) |
| e2e flaky đếm POST race 20-run | Chỉ assert KHÔNG logout + biên tổng POST (§5) |
| `middleware.ts` matcher mở `_next` đổi behavior affiliate/locale | storefront-web là **App Router** (`app/[locale]`) — không phát sinh `_next/data`; soft-nav `?ref` đi qua page path (matcher mới vẫn match) → affiliate capture giữ nguyên. Matcher mới chỉ fast-path các request middleware hôm nay đã no-op; test bằng curl -I + assert `?ref` được giữ qua redirect |
| SF-1 song song cũng đụng vite-preset.mjs (SHARED_SINGLETONS) | Khác vùng file; merge SF-1 → SF-2 giữ CẢ HAI (anchor rule epic) |

## 9. ACCEPTANCE (ràng buộc Phase 5 — copy từ pack, KHÔNG đổi)

1. 2 pages CÙNG context (same origin — docker isolated :8480 hoặc dev cùng app): login A → B header user NGAY (≤1 POST refresh, KHÔNG reload); logout A → B out ngay. KHÔNG demo cross-origin :3000↔:5173.
2. 20 chạy liên tiếp rotate-race: 0 spurious logout (unit regression + e2e).
3. 2FA challenge không broadcast session sai (unit — challenge không set token).
4. Redirect 127→localhost: chứng minh trên **rig của mình** (Next 3400 + shell 5573, boot `--host`) — `curl -4 -I http://127.0.0.1:3400/c/...` + `http://127.0.0.1:5573/...` → 308 sang `localhost` cùng port/path/query (kèm assert `?ref=CODE` được GIỮ qua redirect); asset `/_next/*` KHÔNG redirect. (Port 3000/5173 trong pack là default dev — rig này dùng +400 theo port map epic; behavior như nhau vì middleware/plugin chạy trước khi chạm backend. Preflight `curl -4` cả 2 host trước — Vite bind ::1-only sẽ khiến 127.0.0.1 unreachable vì lý do không phải code.)
5. Reload SSR page không crash — renderToStaticMarkup/import Node sạch.
6. Unit packages/auth xanh + e2e auth-cookie extension xanh.
