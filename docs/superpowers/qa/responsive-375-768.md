# T4 — Responsive Sweep 375×667 + 768×1024 (FI-396 / SF-6 convergence-qa)

- **Ngày chạy:** 2026-09-09 · rig live như T3 · script `scripts/qa/responsive.mjs` (Playwright, viewport context, full-page screenshots)
- **Phạm vi:** read-only sweep. Ngoại lệ duy nhất: seed đúng 1 item vào guest cart (POST `/api/cart/items`, cart-only, KHÔNG đặt order) để checkout form render được kiểm.
- **Kết quả tổng: 41/50 PASS · 9 FAIL** — trong đó **3 FAIL là 1 bug layout thật (shell tràn ngang 375)**, **6 FAIL bị chặn bởi 1 nguyên nhân auth (login không tạo session dùng được)**.

## Verdict theo surface

### Storefront Next :3101 (SF-2) — 375 & 768: PASS TOÀN BỘ

| Check | 375 | 768 | Bằng chứng |
|---|---|---|---|
| home / PLP / PDP / search / coupons — không tràn ngang | PASS | PASS | `scrollWidth == innerWidth` (375/375, 768/768) mọi route |
| header + hero/grid hiển thị | PASS | PASS | `.site-header` 375×152 (768: 768×164), `.hero` 343×260 |
| PLP grid 2-col mobile | PASS | PASS | `grid-template-columns` 2 cột (163.5px×2 @375; 360px×2 @768) |
| PDP sticky ATC bar <600px | PASS | PASS | `.pdp-cta-row` `position=fixed` @375 (box 375×67, bám đáy); `static` @768 (đúng thiết kế <600px) |
| Category grid co 3-col @375 | PASS | — | `.cat-grid` 3 cột 106.3px, 2 hàng (childTops 908×3, 1010×3) — hợp lý |
| Mobile nav @375 | PASS (INFO) | — | Không có hamburger; `.mini-nav` persistent vẫn hiển thị + header actions (search/theme). Thiết kế nav tĩnh — **không phải fail**, note cho SF-2 nếu direction yêu cầu hamburger |

### Shell + Checkout :5703 (SF-3)

| Check | 375 | 768 | Bằng chứng |
|---|---|---|---|
| **shell home — tràn ngang** | **FAIL +311px** | PASS | `scrollWidth=686` vs 375 — xem fail-list F1 |
| **shell /cart — tràn ngang** | **FAIL +311px** | PASS | cùng scrollWidth 686 |
| **shell /checkout — tràn ngang** | **FAIL +311px** | PASS | cùng scrollWidth 686 |
| Header wrap gọn + cart badge còn thấy | PASS | PASS | `.shell-header` 359×104 (wrap 2 hàng, không overflow), `[data-testid="cart-badge"]` 22×22 visible |
| Checkout form 1-col | INCONCLUSIVE | INCONCLUSIVE | Cart đã seed (POST 200, item trong giỏ) nhưng checkout page không render form fields — trang dừng ở bước yêu cầu đăng nhập. Bị chặn bởi F2 |

### Account :5706 (SF-4) — BỊ CHẶN bởi auth

| Check | 375 | 768 | Ghi chú |
|---|---|---|---|
| login → /orders | **FAIL** | **FAIL** | F2 — token không effective |
| side-nav collapse | SKIPPED | SKIPPED | không đăng nhập được |

### Admin :5707 (SF-5) — BỊ CHẶN bởi auth

| Check | 375 | 768 | Ghi chú |
|---|---|---|---|
| login → dashboard/products + sidebar co/ẩn | **FAIL** | **FAIL** | F2 — không đăng nhập được; chưa verify được responsive T9 (sidebar ≤900px) |

## Fail-list + fix-task proposal

### F1 — Shell tràn ngang +311px @375 (3 pages: home, /cart, /checkout) · **SF-3 sở hữu**

- **Symptom:** `document.documentElement.scrollWidth = 686` tại viewport 375 trên cả 3 route shell (768 sạch).
- **Surface/file:** shell header cluster — culprit đo được (elements có right-edge > viewport):
  - `form.shell-search` — box 250px, right=461 (search form không co/ẩn ở 375)
  - `.um-guest` (user-menu guest block: "Đăng nhập/Đăng ký") — box 201px, right=686 — chính là cạnh 686px của scrollWidth
  - Nghi vấn CSS: `apps/shell/src/header.css` + slot layout `shell-header__row1/row2` thiếu `flex-wrap`/`min-width:0`/media query ≤480px cho 2 khối này.
- **Hành vi sai:** tại 375 trang có scrollbar ngang + khoảng trắng bên phải 311px; nội dung header guest bị cắt.
- **Fix-task đề xuất:** cho SF-3 — media query mobile cho `.shell-search` (co full-width xuống hàng) và `.um-guest` (icon-only hoặc wrap); thêm `min-width: 0` cho flex children row1/row2. Verify lại bằng chính `scripts/qa/responsive.mjs` (check RS-375-16/20/22).

### F2 — Login UI không tạo session dùng được (account + admin + checkout-form bị chặn) · **cross-cutting: packages/auth — surface ở SF-4/SF-5/SF-3, cần coordinator mapping ownership**

- **Symptom (đo được, debug `/tmp/qa-debug-t4.mjs`):**
  1. `POST /api/identity/auth/login` (qua Vite proxy) → **200 + JWT body hợp lệ** (sub, role CUSTOMER, email user@demo.vn) nhưng response **KHÔNG có Set-Cookie** (refresh cookie vắng mặt).
  2. `AuthStore.setToken()` chỉ giữ token **in-memory** (`packages/auth/src/AuthStore.ts:64-70` — `private accessToken`), không persist localStorage/cookie (đo: `localStorage=[]`, `document.cookie=""` sau login).
  3. Hệ quả: sau login, protected route (account `/orders`) vẫn hiển thị trang Đăng nhập khi điều hướng; full-reload đương nhiên mất session; checkout form (yêu cầu auth) không render fields.
- **Hành vi sai:** UX login thực tế: user đăng nhập xong, mở tab/mua hàng tiếp là rơi lại trạng thái khách — ngoài việc chặn QA responsive account/admin.
- **Fix-task đề xuất:** (a) gateway/identity phải Set-Cookie refresh (httpOnly) trên login response đi qua proxy; (b) hoặc AuthStore hydrate token từ cookie/sessionStorage lúc boot. Cần spec-critic/coordinator xác nhận thiết kế auth hiện tại (in-memory + refresh-cookie) trước khi sửa — có thể đây là known-gap của seam SF-3↔identity.
- **Sau khi F2 xong:** chạy lại `responsive.mjs` để bới 6 check còn SKU: account side-nav collapse @375, admin sidebar ≤900px, checkout form 1-col.

## Bằng chứng ảnh (16 full-page)

- `docs/superpowers/qa/walkthrough/responsive/sf-{home,plp,pdp,search,coupons}-{375,768}.png`
- `docs/superpowers/qa/walkthrough/responsive/shell-{home,cart}-{375,768}.png` (375: thấy rõ overflow)
- `docs/superpowers/qa/walkthrough/responsive/checkout-{375,768}.png`

Kết quả JSON thô: `/tmp/rs-results.json` (50 records).
