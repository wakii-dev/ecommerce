# SF-6 T7 — e2e FULL suite trên code hợp nhất (FI-396)

- Worktree: `sf-6-convergence-qa`, tip hợp nhất `8d775b8` (5 SF merged)
- Chạy: `E2E_STOREFRONT_URL=… E2E_SHELL_URL=http://localhost:5703 pnpm exec playwright test` (config giữ nguyên: serial workers=1, retries=1)
- Full log mỗi vòng: `/tmp/sf6-t7-run{1,2,3,4}.log` (copy tóm tắt dưới)

## KẾT QUẢ CUỐI: PASS — 51/51 test, 14/14 spec xanh, 0 skip (run 4, exit 0)

| # | Spec | Tests | Kết quả |
|---|------|-------|---------|
| 1 | admin-coupon.spec.ts | 5 | ✓ (5/5) |
| 2 | admin-crud.spec.ts | 2 | ✓ (2/2) |
| 3 | auth-cookie.spec.ts | 4 | ✓ (4/4) |
| 4 | cod-checkout.spec.ts | 1 | ✓ |
| 5 | engagement.spec.ts | 5 | ✓ (5/5) |
| 6 | golden-path.spec.ts | 8 | ✓ (8/8 — full PAID Stripe 4242, không skip [PENDING-STRIPE-KEYS]) |
| 7 | nav-honesty.spec.ts | 7 | ✓ (7/7) |
| 8 | password-reset.spec.ts | 2 | ✓ (2/2) |
| 9 | platform-asserts.spec.ts | 6 | ✓ (6/6) |
| 10 | rbac.spec.ts | 7 | ✓ (7/7) |
| 11 | related-products.spec.ts | 1 | ✓ |
| 12 | review-flow.spec.ts | 1 | ✓ |
| 13 | saga-fail.spec.ts | 1 | ✓ |
| 14 | upload-image.spec.ts | 1 | ✓ |

Không spec nào skip — Stripe 3-gates sống nên golden path chạy full PAID (không có nhánh [PENDING-STRIPE-KEYS]).

## Lịch sử vòng chạy

### Vòng 0 (env-prep — không tính sweep)
Chạy đầu tiên chết 14/14 vì **Playwright browser binary thiếu** (`chromium_headless_shell-1234` không tồn tại trong cache máy). Fix: `pnpm exec playwright install chromium`. Không phải lỗi spec/app.

### Vòng chạy 1 (baseline thật) — 30 passed / 10 failed / 11 did-not-run (1.4m)
| Nhóm | Specs | Nguyên nhân gốc |
|------|-------|-----------------|
| A | admin-coupon, admin-crud, cod-checkout, golden-path t3, password-reset, review-flow, saga-fail, upload-image (8 specs) | `getByLabel('Mật khẩu')` strict-mode violation — shell SF-3 thêm nút show/hide password có `aria-label="Hiện mật khẩu"` (substring trùng "Mật khẩu") → locator trúng 2 element |
| B | nav-honesty CategoryTiles | Seed hợp nhất đổi thứ tự cat-grid: tile đầu = `/c/lam-dep`, spec kỳ vọng `/c/dien-tu` (fixture cũ) |
| C | platform-asserts §5.13 | Partner key `pk_0123…` (seed.sh deterministic) KHÔNG có trong db_partner của rig — boot-seed SF-11 đã sinh key random (prefix `pk_da9df`) thay thế |

### Sweep round 1 — fix SPECS (đúng phạm vi cho phép)
1. **10 occurrences × 8 files**: `getByLabel('Mật khẩu')` → `getByRole('textbox', { name: 'Mật khẩu' })` (role-based, không đụng nút toggle — selector Playwright tự suggest).
   Files: `tests/{review-flow,golden-path,upload-image,admin-crud,password-reset,admin-coupon,cod-checkout,saga-fail}.spec.ts`
2. **nav-honesty L46-48**: CategoryTiles kỳ vọng tile đầu `/c/dien-tu` → `/c/lam-dep` (khớp seed hợp nhất — rule c, seed-order).
3. **nav-honesty footer L72-88** (pre-flagged coordinator): SPA-nav race — `waitForLoadState('load') + page.url()` tức thì → `await expect(page).toHaveURL(fn)` origin-agnostic (next/link không bắn load-event mới).
4. **[DB — không phải code] restore partner key deterministic**: `INSERT INTO api_keys` row `22222222-…` với `sha256('pk_0123…')` + prefix `pk_01234`, scopes `{catalog:read,orders:read,orders:write}`, gắn vào partner DEMO-PARTNER có sẵn — chính xác câu INSERT của `scripts/seed/seed.sh:214-222` (idempotent-style, KHÔNG make seed wipe). Verify curl `/open-api/v1/products` với key deterministic → 401 → **200**.

### Vòng chạy 2 — 41 passed / 5 failed / 5 did-not-run (2.6m)
Cụm fail MỚI lộ ra (trước đó bị serial-skip che):
- cod-checkout, golden-path t4, saga-fail: `POST /api/cart/items` → **403**
- admin-coupon (COD checkout): timeout `getByLabel('Họ tên người nhận')` — snapshot cho thấy checkout rỗng ("Không có sản phẩm khả dụng") vì add-to-cart 403 ngay trước đó → CÙNG GỐC
- review-flow: dialog hiện "Đăng nhập để đánh giá" thay vì form sao

### Root-cause round 2 — ENV, KHÔNG phải spec (curl chứng minh)
- `POST /api/cart/items` với `Origin: http://localhost:5703` → **200**; `Origin: http://127.0.0.1:3101` → **403**. Gateway origin-allowlist nhận hostname `localhost`, từ chối `127.0.0.1`.
- Đồng thời: cookie đăng nhập set trên host `localhost` (shell :5703) KHÔNG thấy bởi PDP chạy trên host `127.0.0.1` (cookie scope theo HOST, không theo port) → review dialog tưởng chưa login.
- **Fix (env-only, không sửa code/spec)**: chạy suite với `E2E_STOREFRONT_URL=http://localhost:3101` (cùng server Next, origin hợp lệ + cookie đồng host).

### Vòng chạy 3 — 47 passed / 2 failed / 2 did-not-run (3.1m)
- golden-path t5 + saga-fail: `.pay-panel iframe` không mount. Snapshot UI tự báo: *"đơn đã tạo nhưng chưa mount được form thẻ (thiếu VITE_STRIPE_PUBLISHABLE_KEY)"*.
- Root cause: process mfe-checkout :5705 (cwd = worktree này) boot KHÔNG có env Stripe — root `.env` CÓ đủ 3 gates (`STRIPE_SECRET_KEY` L46, `STRIPE_WEBHOOK_SECRET` L47, `VITE_STRIPE_PUBLISHABLE_KEY` L93) nhưng Vite chỉ bake env lúc start (recipe: "FE boot phải export .env").
- **Fix (env-only)**: restart `pnpm --filter mfe-checkout exec vite --port 5705 --strictPort` với `VITE_STRIPE_PUBLISHABLE_KEY` + `GATEWAY_URL` export từ root `.env` (giữ nguyên port/flags gốc). Verify key bake vào module: curl `/src/lib/stripePay.ts` thấy `pk_test_51UDNyjJ…`.

### Vòng chạy 4 — **51 passed / 0 failed / 0 skip (1.3m, EXIT=0)** ✅

## Diff tóm tắt các fix spec (file + 1 dòng)
- `tests/{8 files}`: `getByLabel('Mật khẩu')` → `getByRole('textbox', { name: 'Mật khẩu' })` (10 chỗ) — surface shell thêm pw-toggle.
- `tests/nav-honesty.spec.ts`: tile đầu cat-grid `/c/dien-tu` → `/c/lam-dep` (seed-order hợp nhất).
- `tests/nav-honesty.spec.ts`: footer click → `toHaveURL(fn)` thay `waitForLoadState + page.url()` (SPA-nav race).

**Fail-list fix-task proposals: KHÔNG có** — mọi fail đều gỡ được bằng spec-fix (phạm vi cho phép) hoặc env repair; không phát hiện bug app bắt buộc sửa surface.

## Quan sát hệ thống (không chặn PASS — cho coordinator/rig recipe)
1. **Gateway origin-allowlist thiếu `127.0.0.1`**: chỉ nhận `localhost` (kể cả :3101). Suite đã chuyển sang `http://localhost:3101`. Nếu ai chạy suite với origin IP → 403 thầm lặng ở cart/coupon POST. Backend/platform-owned, ngoài 5 SF.
2. **Footer + shell-links hardcode qua `NEXT_PUBLIC_SHELL_URL` (default `http://localhost:5173`)**: rig boot không set env này → footer storefront trỏ :5173 (process lạ của worktree khác đang sống nên test vẫn pass origin-agnostic). Rig recipe nên export `NEXT_PUBLIC_SHELL_URL=http://localhost:5703` cho storefront. Cùng hiện tượng: header shell mini-nav links → `http://localhost:3000/c/...` (env storefront-url của shell chưa set → :3000).
3. **mfe-checkout boot cần export root `.env`** (ít nhất `VITE_STRIPE_PUBLISHABLE_KEY`) — đã restart trong phiên này; lần boot rig sau cần nhớ (snapshot lúc chết: "thiếu VITE_STRIPE_PUBLISHABLE_KEY").
4. Seed-drift đã sửa trong phiên: partner key deterministic được INSERT lại vào db_partner (row id cố định như seed.sh). Giá trị dịch vụ khác KHÔNG đụng tới; KHÔNG chạy make seed.
5. Data mutated trong phiên (cho phép): partner key row + orders do suite tạo (golden/cod/saga/admin-coupon) + coupon test của admin-coupon; WELCOME10 giữ ACTIVE; GIAM50K không đụng. Cart probe rác của curl đã DELETE.
