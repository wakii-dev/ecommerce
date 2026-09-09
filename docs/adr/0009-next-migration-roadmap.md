# ADR 0009 — Roadmap migrate account → checkout sang Next (roadmap (b), story FI-397)

Date: 2026-09-09 · Status: Proposed (chờ epic duyệt — SF-5 viết theo ủy quyền §1 Q1 epic spec) · Owner: story tương lai (post-FI-397)

## Context

Q1 epic FI-397 chọn hướng **(A) hybrid**: chrome + session-sync + dev 1-origin entry trong story này; migrate `mfe-account` + `mfe-checkout` (Vite MF remotes) sang Next app là **story RIÊNG sau**, đăng ký roadmap. Nhánh đích FI-397 hợp nhất xong: chrome là 1 nguồn layout (Next consume qua `transpilePackages`, shell Vite qua MF + `SHARED_SINGLETONS`), session sync tức thì same-origin, dev entry :3000 bao cả shell-routes qua rewrites. Bài học rollback chi phí: Vite remote HMR cần `dev.remoteHmr: 'full-reload'` + `hmr.clientPort` riêng (ADR 0008-dev-one-origin-entry) — lớp phức tạp chỉ tồn tại để Vite còn sống cạnh Next.

**Mục tiêu end-state**: 1 app Next duy nhất (storefront-web) render TẤT CẢ trang khách hàng; shell Vite + MF remote retire dần; admin giữ riêng (trừ khỏi story — AdminApp full-bleed đã ổn).

## Decision — thứ tự migrate: ACCOUNT TRƯỚC, CHECKOUT SAU

| Tiêu chí | account | checkout |
|---|---|---|
| Trang / route | /account, /orders, /order/**, /login, /register, /2fa, /affiliate — chủ yếu auth-gated, SEO thấp | /cart, /checkout, /order/confirmation — doanh thu-critical, SEO thấp |
| State phức tạp | form + profile + 2FA + orders list (read-mostly) | cart state + Stripe Elements + coupon carry (sessionStorage) + saga events |
| Rủi ro doanh thu | thấp (lỗi = user đăng nhập lại) | cao (lỗi giữa checkout = mất đơn) |
| Chrome surface | AuthMenu widget đã chrome-owned; mount 3 trang form | CartBadge + mini-cart drawer + PaymentElement |
| e2e phủ sẵn | rbac/review-flow/password-reset | golden-path/cod-checkout/saga-fail/admin-coupon |
| Session-sync | chính là chủ nhân flow login/2FA/OAuth — migrate chung entry → BC same-origin tự nhiên | phụ thuộc authReady timing với auth |

⇒ **Account mang ít rủi ro, cho phép team học pattern migrate (RSC + chrome islands + session boot) trên surface an toàn; checkout làm sau khi pattern đã chín.** Mỗi app = 1 giai đoạn riêng, không big-bang.

## 7 blockers (điều kiện tiên quyết — liệt kê theo epic spec; mỗi blocker có exit criteria)

1. **appNavigate injection** — `lib/site.ts` `shellUrl()`/navigate hiện same-origin relative string; app Navigate/Link phải inject router của host (shell dùng history API, Next dùng next/router). Migrate = chrome/navigation layer nhận router abstraction (prop/context) thay vì hardcode.
   *Exit*: 0 import trực tiếp window.location/history trong app code; nav qua abstraction unit-tested trên cả 2 host.
2. **authReady timing** — app boot hiện `initAccountShell → refresh` rồi mới render route-protected UI; Next SSR render trước hydration → chớp "guest" (FOUC auth) nếu không có authReady gate. Cần `authStore.authReady` promise + SSR-safe skeleton.
   *Exit*: reload trang auth-gated (orders) không hiện guest-flash (e2e assert + mắt); `/login` SSR HTML đúng trạng thái chưa-biết (skeleton, không sai quyết định).
3. **Singleton instance per origin** — chrome/auth/i18n là `SHARED_SINGLETONS` MF shared khi host+remote; sau migrate chỉ còn Next transpilePackages — 1 instance tự nhiên, NHƯNG thời kỳ chuyển tiếp (1 trang vẫn qua shell) phải giữ singleton để badge/menu không biến mất (bài học BUG-04/i18next dual-instance).
   *Exit*: perf-sanity marker gate (SF-5 `docs/superpowers/qa/perf-sanity.md` recipe) PASS trong suốt chuyển tiếp; badge đăng ký từ app nào cũng 1 instance.
4. **page.css** — trang Vite import page-scoped css riêng; Next App Router cần layout/page.css tương ứng (không double-import tokens; FI-390 đã chuẩn hóa `--grad-cat-*` tokens — giữ).
   *Exit*: mỗi migrated route có page.css tương đương; grep 0 keyframes lạc chỗ (pattern FI-396 consistency sweep); visual parity screenshot 2 trạng thái theme.
5. **gateway/nginx routing** — routes `/account,/cart,/checkout,/order/confirmation,/login…` hiện trỏ `frontend-web` (nginx shell SPA); migrate từng route = chuyển destination sang storefront-web service + rebuild nginx layout. DEV entry rewrites mirror tương ứng (SF-3 pattern).
   *Exit*: route matrix curl (SF-5 gateway-regression.md format) khớp bảng routes mới; prod 1-origin nguyên trạng :8080; dev entry :3000 không đổi URL.
6. **e2e re-verify** — 14 specs + sync-matrix chạy trên surface mới: selector/testid giữ (semantic classname/testid song song — constraint story); SPA-nav race pattern `toHaveURL` giữ; thêm smoke cho route đã migrate.
   *Exit*: FULL suite xanh trên nhánh migration TRƯỚC khi flip gateway route; nav-honesty không regress.
7. **GA/theme boot contracts** — `window.gtag` pageview + livechat double-inject guard + theme boot anti-FOUC chạy qua chrome boot (SF-4 wiring); Next app router cần boot client-island tương đương (không mất purchase event exactly-once, không double-inject livechat).
   *Exit*: golden-path giữ GA events (purchase 1 lần/đơn); livechat script inject ĐÚNG 1 lần (eval window marker); theme boot script 1 nguồn chrome — 0 FOUC reload dark mode.

## Exit criteria TỪNG GIAI ĐOẠN

**Giai đoạn A — account → Next:**
1. A1 chuẩn bị: blockers 1-4 xong ở mức pattern (navigation abstraction + authReady + singleton gate + page.css khung) — unit xanh.
2. A2 migrate pages: /account+/orders+/order/**+auth pages render Next (chrome layout), shell giữ bản mirror cho fallback flag.
3. A3 flip: gateway routes nhóm account → storefront-web; e2e re-verify (blocker 6) xanh; dev entry :3000 OK.
4. A4 dọn: xóa mfe-account route khỏi shell + MF expose; STRIPE/GA/theme contracts verify (blocker 7); perf gate PASS.
5. Signoff: walkthrough record (pattern SF-5) + verifier từng dòng acceptance.

**Giai đoạn B — checkout → Next:** (chỉ start khi A xong trọn vẹn)
1. B1: cart state + guest token contract giữ nguyên (`ecommerce.guest_cart_token` localStorage same-origin); PaymentElement mount trong Next (SSR-off island) — probe Stripe 3-gates recipe.
2. B2: migrate /cart + /checkout + /order/confirmation; coupon carry sessionStorage same-tab flow verify.
3. B3: flip routes + e2e golden-path FULL (Stripe PAID) + saga-fail; A4-equivalent dọn shell.
4. B4: retire shell host Vite (admin quyết: giữ mfe-admin tách host hoặc nhét admin route riêng standalone); update ADR này sang Accepted-complete.

**Rủi ro lớn nhất giai đoạn B**: Stripe Elements trong Next hydration + webhook-only PAID flow — cần probe riêng trước B2 (SF-1 recipe 3-gates: hasStripe/payment-env/whsec phải khớp cả 3).

## Liên kết

- Epic spec: `docs/superpowers/specs/2026-09-08-frontend-unification-design.md` §1 Q1, §8
- ADR 0008 (session-sync contract) + ADR 0008-dev-one-origin-entry (HMR/rewrites)
- Evidence convergence: `docs/superpowers/qa/` (SF-5 FI-402) — perf-sanity recipe là blocker-3 exit tool
