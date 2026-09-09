# SF-5 unit tests monorepo (FI-402)

> Chạy: `pnpm turbo run test` (repo root — turbo scope 13 packages) · 2026-09-09 · nhánh đích `be9962c` + artifacts SF-5.
> Full log: `.run/sf5-unit-tests.log` (máy).

## Kết quả per package

| Package | Files | Tests | Verdict |
|---|---|---|---|
| @ecommerce/i18n | 1 | 6 | ✅ |
| @ecommerce/config | 1 | 5 | ✅ (vite-preset: SHARED_SINGLETONS + redirect plugin contracts giữ nguyên) |
| @ecommerce/contracts | 1 | 6 | ✅ |
| @ecommerce/ui-kit | 7 | 89 | ✅ (tokens regression gồm) |
| @ecommerce/auth | 6 | 42 | ✅ (session-sync-race 11 tests + ssr-guard + guest-cart-key — FI-399 nguyên trạng xanh) |
| @ecommerce/chrome | 13 | 78 | ✅ (SSR renderToStaticMarkup + theme canonical + singleton contracts) |
| @ecommerce/mfe-checkout | 6 | 41 | ✅ |
| storefront-web | 19 | 174 | ✅ (host-redirect 5 tests xanh — level unit; fail chỉ ở integration middleware URL construction, xem gateway-regression.md finding #4) |
| @ecommerce/mfe-account | 9 | 61 | ✅ |
| **@ecommerce/mfe-admin** | **1 failed / 8 passed** | **2 failed / 69 passed** | ❌ FINDING #6 (dưới) |

**Tổng: 502/504 pass — 10/11 package xanh toàn bộ.**

## FINDING #6 — mfe-admin `tests/mount.smoke.test.tsx` 2/71 fail (sweep fail → fix-task SF-2)

```
× guest standalone (refresh fail) → hiện hướng dẫn, KHÔNG render layout (1024ms timeout)
  TestingLibraryElementError: Unable to find element with text 'Không có quyền'
× mount 2 lần khi refresh đang treo → chia sẻ ĐÚNG 1 boot-refresh (25ms)
  AssertionError: expected +0 to be 1 (refreshCount === 0 khi assert)
```

**Root cause (đọc code, không guess):** SF-2 (FI-399) wrap `refresh()` qua `createSessionSync` — Web Locks `navigator.locks.request('ecommerce.auth-refresh')` primary; **jsdom KHÔNG có `navigator.locks`** → unit test chạy fallback path (ADR 0008 §3/§4): jitter 50-150ms TRƯỚC POST + 401-refresh retry ĐÚNG 1 lần sau backoff 400ms + handshake chờ remote tối đa 5s. Timing assumption của 2 test (viết thời FI-390: refresh post NGAY + 401 → logout NGAY) hết đúng:
- Test 1 (401→guest screen): 401 → backoff 400ms → retry → 402 → logout — chuỗi fallback vượt waitFor 1s.
- Test 2 (shared boot-refresh): POST bị hoãn bởi jitter 50-150ms → refreshCount vẫn 0 lúc assert 25ms.

**Không phải bug production** — browser thật có `navigator.locks` → fast path (serialize trong lock, không jitter/backoff cho boot-refresh thường). Là **test staleness** sau đổi seam.

**Fix-task (epic FI-397 → gán SF-2 owner auth seam):** update `frontend/apps/mfe-admin/tests/mount.smoke.test.tsx` — mock `navigator.locks` (fast path) hoặc fake-timers cho jitter/backoff; giữ case fallback như test riêng có timeout tương ứng. Test-only, không đụng surface.

## Verdict T8

**PARTIAL** — 502/504 (99.6%); 2 fail có root cause rõ + fix-task gán owner; không block các task khác (mfe-admin runtime là không/unit-only surface — e2e admin specs chạy thật sẽ xác minh hành vi production T4).
