# SF-5 sync-matrix × 2 app — report (FI-402)

> Ngày chạy: 2026-09-09 · Spec: `frontend/e2e/tests/session-sync-matrix.spec.ts` · Pattern: FI-399 `auth-cookie.spec` (trackRefreshPosts attach trước nav, stamp `sf5SyncLoaded` chống reload)
> Tab A = storefront `/` (Next host) · Tab B = shell `/cart` (Vite host) — CÙNG Playwright context, CÙNG origin qua entry · API register/login/2fa qua entry `/api/identity/**`
> VIDEO deliverable: `test.use({ video: 'on' })` → copy sang `.run/sf5-sync-video/` (10 file: 5 case × 2 tab).

## Verdict tổng

| Rig | Kết quả | Ghi chú |
|---|---|---|
| **A — dev 1-origin :3400** (entry Next, gateway isolated :8480, MAILPIT :8425) | **5/5 PASS** (41.9s, 0 retry) | Toàn bộ tiêu chí binary từng leg ĐẠT |
| **B — isolated prod :8480** | **0/5 — RED: shell prod KHÔNG boot** (không phải lỗi spec) | Finding hội nhập thật → fix-task, xem §Finding. Storefront host :8480 `/` = 200 OK; mọi shell page (/cart, /login…) trắng vì app không mount |

Lệnh chạy: `cd frontend/e2e && E2E_STOREFRONT_URL=E2E_SHELL_URL=http://localhost:3400 MAILPIT_API=http://localhost:8425 GATEWAY_URL=http://localhost:8480 pnpm exec playwright test tests/session-sync-matrix.spec.ts` (rig B: đổi 2 URL thành `http://localhost:8480`).

## Ma trận case × kết quả (rig A)

| # | Case | Tiêu chí binary | Kết quả | Evidence |
|---|---|---|---|---|
| 1 | login A (storefront) → B (shell /cart) thấy user | B `auth-user` ≤15s; B **≤1** POST refresh; B **không reload** (stamp nguyên) | **PASS** (11.7s) | video `sf5-sync-1-login-storefront-to-shell-tab{A,B}.webm` |
| 2 | logout A → B guest | B `auth-guest` ≤15s; không reload; ≤1 POST (401 lần đầu) | **PASS** (4.2s) | `sf5-sync-2-logout-storefront-to-shell-tab{A,B}.webm` |
| 3 | 2FA full-chain | challenge `/login/2fa` → B **0 POST refresh** + vẫn guest (challenge KHÔNG broadcast); verify TOTP → B thấy user, ≤1 POST | **PASS** (4.7s) | `sf5-sync-3-2fa-challenge-no-broadcast-tab{A,B}.webm` |
| 4 | OAuth callback error-path `?error=access_denied` | `role=alert` đúng text i18n ('Bạn đã từ chối cấp quyền đăng nhập.'), title lỗi, nút Về trang đăng nhập; không crash; B vẫn guest | **PASS** (8.7s) | `sf5-sync-4-oauth-callback-error-tab{A,B}.webm` |
| 5 | 20-run rotate-race cross-app | mỗi run: CẢ A (storefront tab, chạy shell app sau login) + B (shell) không logout; tổng POST refresh ≤ 50; không reload | **PASS** (11.4s) | `sf5-sync-5-rotate-race-20run-tab{A,B}.webm` |

Số học race: 20 broadcast × 2 page = 40 POST dự kiến + slack 10 — assert `≤ 50` xanh (coordination serialize giữ nguyên xuyên app boundary).

Video đầy đủ: `/Users/hoivu/orca/workspaces/ecommerce/sf-5-convergence-qa/.run/sf5-sync-video/` (mỗi case 2 file: tabA-storefront = page A, tabB-shell = page B).

## Finding — prod-mode :8480 shell không boot (FIX-TASK, ngoài boundary SF-5)

**Triệu chứng:** mọi test trên rig B chết ở assert chrome đầu tiên trên shell page. Probe headless: `document.querySelector('.chrome-header')` = null, `#root` rỗng (0 children), console: `Failed to fetch dynamically imported module: http://localhost:8480/remoteEntry.js` (404) + `REQFAIL /remoteEntry.js ERR_ABORTED`.

**Chuỗi nguyên nhân (đã truy từng hop):**

1. Shell prod build chứa chunk lazy `assets/index-yGhJx9dw.js` (serves route RemotePage) mở đầu bằng **static import `"../remoteEntry.js"`** — từ `/assets/*.js` resolve thành **`/remoteEntry.js` (origin root)**. (Đây là artifact do @module-federation/vite generate lúc build, không phải code tay trong repo.)
2. Gateway route `shell-web` (`backend/gateway/src/main/resources/gateway-routes.yml`, dòng ~121) predicate `Path=/cart,/cart/**,/checkout,…,/remotes/**,/assets/**,/favicon.ico,/favicon.svg` — **KHÔNG có `/remoteEntry.js`** → gateway tự 404 TRƯỚC khi tới nginx.
3. nginx `frontend-web.conf` `location / { try_files $uri … }` CÓ THỂ phục vụ được — file **tồn tại trong container**: `fi397sf2-frontend-web:/usr/share/nginx/html/shell/remoteEntry.js` (verify bằng docker exec). Tức là chỉ thiếu 1 hop route gateway.
4. Hệ quả: import chain mf-entry → vỡ → shell không render gì (cả chrome/auth) trên MỌI shell page prod; storefront Next host vẫn 200 (SSR không phụ thuộc shell boot).

**Đề xuất fix (epic gán chủ sở hữu — cả 2 phương án đều ngoài quyền SF-5):**
- (a) **Gateway 1 dòng:** thêm `/remoteEntry.js` vào predicate route `shell-web` — smallest blast radius, nhưng đụng backend/contracts (frozen với SF-5; diff-check Task 6 vẫn comment-only vì gap này TỒN TẠI từ trước fork-point, không phải regression SF-1..4 merge mới gây).
- (b) **Shell build (SF-1/SF-4 surface):** cấu hình MF vite để host không self-import remoteEntry theo path root-relative (vd đưa remoteEntry vào /assets/ hoặc tránh static import trong lazy chunk).
- Fix-task format: `[SF-5 sweep] gateway-routes shell-web predicate — backend/gateway/src/main/resources/gateway-routes.yml:121 — thiếu /remoteEntry.js → shell prod :8480 trắng trang hoàn toàn (không chrome, không auth) → đề nghị + '/remoteEntry.js' vào Path predicate (hoặc fix MF host build — SF-1)`.

**Trạng thái re-run:** spec sẵn sàng chạy lại trên :8480 ngay khi fix merge về nhánh đích (plan Task 1 cb4 chưa tick — chờ đúng nghĩa "prod-mode proof PASS"; evidence red đã lưu ở report này).

## Disclosure trung thực

- **OAuth success-path KHÔNG e2e được** (cần provider Google/Facebook thật — redirect ngoài). Coverage thay thế: (1) error-path e2e ở case 4; (2) seam token giống hệt password login — cả 2 đường đều kết thúc ở cùng call-site `setToken` của `packages/auth` (`frontend/packages/auth/src/api.ts` / `AuthStore.ts`), broadcast auth-changed phát từ store nên case 1/3 đã chứng minh hành vi post-token xuyên app; (3) unit tests sẵn có KHÔNG đụng tới: `packages/auth/src/__tests__/` — `session-sync.test.ts`, `session-sync-race.test.ts`, `authStore.test.ts`, `api.test.ts` (không viết test mới — ngoài ownership SF-5).
- **Số POST trong report là CHẶN trên (assert binary)**: spec assert `≤1` / `=0` / `≤50` — không in số tuyệt đối ra log. Mọi assert đều xanh trên rig A.
- **2FA flow chỉ phủ app-authenticator (6 số)**, không phủ backup code 8 ký tự (cùng endpoint verify, backend chấp nhận cả hai — TwoFactorService ±1 bước 30s; spec đã có retry window kế cho biên 30s).
- **Dev-rig storefront restart giữa phiên**: server `next dev :3400` (boot 17:34) rơi vào trạng thái 404 mọi route locale (route local chết, rewrite → shell vẫn sống; log `.run/logs/sf5-rigA-storefront.log`). Restart bằng ĐÚNG env boot gốc (SHELL_ORIGIN/REMOTE_*_URL/GATEWAY_URL) → `/` 200, không đụng code. Không rõ root cause (không phải `next build` — không có BUILD_ID); nếu lặp lại → flag riêng.
- **Flake đã sửa trong spec** (không phải app): bản đầu dùng 1 user chung cho 5 case — test 2FA bật 2FA trên user đó làm case kế thừa challenge (retry lọt vì beforeAll tạo user mới). Refactor: mỗi case tự `newUser()` — order-independent.
- **Compose project rig B thực tế tên `fi397sf2`** (coordinator boot Task 0, override-sf2 reuse) — isolated đầy đủ (PG/mailpit/gateway +400 riêng), không ảnh hưởng tính giá trị evidence; ghi lại để audit khỏi nhầm với project `fi397sf5` trong plan.
