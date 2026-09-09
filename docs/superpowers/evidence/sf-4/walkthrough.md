# SF-4 walkthrough evidence (PT7 — coordinator, Rule 0)

Rig: entry :3100 · shell :5273 · remotes checkout :5185 / account :5186 / admin :5187 (TẤT CẢ từ worktree này) · backend share main checkout :8080. Ngày 09-09.

## Rule 0 — 3 tầng nhận thức

- **T1 DOM (hỗ trợ):** `curl :3100/vi` chứa `aria-label="Trang chủ"` (chrome.header.aria DỊCH từ HTML đầu — SSR pass của ChromeShell sync-init i18n trước children; claim "raw keys trong SSR" từ PT6 KHÔNG đúng, đã sửa comment theo review P2). Footer labels (`Giỏ hàng`, `Đánh giá của tôi`) có trong HTML đầu. `/vi/p/unknown` → not-found render CÓ `chrome-header` + `chrome-site-footer` (1+1).
- **T2 Visual (bằng chứng):** BEFORE (`before-home-vi.png` — main stack, layout chrome identical base) vs AFTER (`after-home-vi.png`): header 2 hàng — logo wordmark+dot+ticker ✓, search viền primary ✓, EN switch ✓, Giỏ hàng/Tài khoản icon+label ✓, mini-nav 3 link ✓. **Delta duy nhất: theme toggle icon-only** (chrome `.chrome-icon-btn` — FI-390 direction §2.1 "icon-btn 42×42" — label `Tối/Sáng` cũ → sr-only, delta CHẤP NHẬN theo direction). Footer (`after-home-footer.png`): chrome Footer 2 cột (5+5 links) + newsletter cùng band #212121 — **delta: newsletter chuyển từ cột 3 → full-width dưới 2 cột** (chrome không render newsletter — chrome.css track-3 rỗng chủ đích; direction không định nghĩa footer).
- **T3 Flow (chuẩn đo):** click "Giỏ hàng" storefront → `/cart` shell host render (chrome-header ✓, không 404) → `/account` guest → redirect `/login` + `auth-guest` testid ✓ (chrome AuthMenu guest links) → back ✓. Theme: toggle storefront → `dark` + localStorage `ecommerce.theme=dark` → `/cart` shell **cùng dark** (cùng key, 2 app đồng bộ) ✓.

## ACCEPTANCE evidence

| # | ACCEPTANCE | Evidence |
|---|---|---|
| 1 | Header/Footer render từ chrome, giống FI-390; markup cũ không còn | `after-home-vi.png` + `after-home-footer.png`; grep 2.1 = 0 import; Header/Footer/ThemeToggle.tsx + lib/theme.ts đã xóa (commit 85f9e5c) |
| 2 | Sửa 1 nhãn `chrome.*` → CẢ 2 app đổi | Sửa `chrome.footer.linkCart` vi → "GIỎ DEMO 1 CHỖ" (1 dòng trong `packages/i18n/src/catalogs/vi.ts`, KHÔNG sửa app nào): storefront :3100/vi HTML count=1; shell :3100/cart (CSR, browser) count=1 — `label-demo-storefront.png` + `label-demo-shell-cart.png`. ĐÃ REVERT ✓ |
| 3 | Theme 1 nguồn; GA/livechat bắn đúng; cart-badge + account menu hoạt động | Theme: dark sync 2 app (`theme-dark-storefront.png` + `theme-dark-shell-cart.png`, cùng key `ecommerce.theme`). GA: `NEXT_PUBLIC_GA_ID=G-TEST123` → gtag.js script tag + network REQ/DONE googletagmanager + dataLayer 6 entries (config + page_view theo SPA nav) trên Next phụ :3101 (đã tắt); env trống → 0 request, 0 lỗi console (guard đúng — `:3100` capture). LiveChat env trống → không load gì, không lỗi (giống shell app-owned pattern). Cart-badge: shell /cart header badge = 2 (số thật từ cart service — chrome CartBadge đăng ký trực tiếp PT3); account menu: `auth-guest` visible trên /login, badge counter chạy |
| 4 | Cross-app nav mượt; locale giữ path; e2e XANH | Flow storefront→cart→account→back ✓ (`flow-*.png`); `/en` → chrome aria "Home", `/cart` link giữ `en cart label: Cart`, path vi không prefix ✓; nav-honesty **7/7** + golden-path **8/8** (live Stripe payment + admin) — `e2e-subset.txt` |
| 5 | Unit tests storefront + shell xanh | 402/402 xanh 6 suites (storefront 174 · chrome 78 · i18n 6 · auth 42 · account 61 · checkout 41) — `unit-sweep.txt`; shell: **0 unit test tồn tại** (probe), 0 file shell bị đụng (`git diff --name-only` trống) |

## /admin smoke (7.6)

`/admin` sau login admin → **AdminApp render layout riêng** (sidebar + topbar riêng, full-bleed — `admin-smoke.png`), data thật (doanh thu, tồn kho LIVE). Guest → redirect `/login?next=/admin` (RBAC guard đúng). **Ghi nhận (không phải surface SF-4 — shell không đổi file nào):** shell chrome-header vẫn render phía trên admin ở trạng thái base — SF-3 acceptance ghi "KHÔNG chrome wrap" → flag cho SF-5 convergence QA điều tra (không phải regression SF-4: `git diff story/fi397-unify-frontend` = 0 file apps/shell).

## not-found cặp (7.7)

- `/vi/p/unknown` (notFound() TRONG [locale]) → **CÓ** chrome header+footer (`notfound-with-chrome.png`) ✓ expected sau swap.
- `/vi/route-khong-ton-tai` (không match route nào) → root `app/not-found` KHÔNG chrome — behavior Next chuẩn, unchanged từ trước SF-4.

## en + mobile (7.8)

- `/en`: chrome aria "Home", footer/labels EN, storefront labels "Cart" (static dict) — changeLanguage theo URL locale hoạt động (`en-home.png`).
- 375px: header wrap — slot center (search) xuống dòng theo bridge ≤900px, gap co ≤600px (`mobile-375-home.png`).
