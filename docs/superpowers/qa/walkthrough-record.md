# SF-5 walkthrough record (FI-402)

> Rule 0: coordinator TỰ mở browser đi flow + TỰ NHÌN screenshots (không tin report agent). Evidence: `docs/superpowers/qa/walkthrough/` · Rig: dev entry :3400 (FE worktree) → gateway isolated :8480. Script: `scripts/qa/golden-path-walkthrough.mjs` (executablePath pinned headless_shell-1234).

## 1. One-origin golden path (T2) — entry :3400, KHÔNG đổi port — ✅ 11/11 BƯỚC

Flow: home → PLP → PDP → add-to-cart → cart → login → checkout 3 bước (COD) → confirmation → account → /admin. Kết quả từng bước (`t2-results.json`):

| # | Bước | Evidence | Kết quả (coordinator TỰ nhìn) |
|---|---|---|---|
| 1 | Home SSR chrome | t2-01-home.png | ✅ chrome header + cat-grid render |
| 2 | PLP | t2-02-plp.png | ✅ |
| 3 | PDP (áo-thun-nam-uniqlo-dry-ex — có variant) | t2-03-pdp.png | ✅ giá/rating/ATC |
| 4 | Add-to-cart (badge đếm) | t2-03b-added.png | ✅ |
| 5 | /cart qua entry (shell route) | t2-04-cart.png | ✅ CTA Thanh toán |
| 6 | Login (fresh user) | — | ✅ auth-user hiện |
| 7 | /checkout | t2-05-checkout.png | ✅ stepper 3 bước |
| 8 | Fill địa chỉ 6 trường + 3 bước tới COD | t2-05b..05f | ✅ |
| 9 | Confirmation | t2-06-confirmation.png | ✅ hero + order id `ba1d39e5…` + 410.000đ |
| 10 | /account (authed) | t2-07-account.png | ✅ |
| 11 | /admin (ADMIN user) | t2-08-admin.png | ✅ AdminApp layout RIÊNG full-bleed (aside QUẢN TRỊ + topbar riêng) — dashboard số THẬT (786.000đ hôm nay, top product = đơn walkthrough); shell chrome header phía trên = shell host header (kiến trúc /admin là shell route — AdminApp KHÔNG bị bọc trong `<main>` nội dung, tự render layout riêng — khớp walkthrough SF-4 đã verify) |

**DB cross-check**: order `ba1d39e5-7457-4109-910a-86bd205b9230` = **CONFIRMED · 410.000đ · COD** (db_ordering isolated) — saga trọn vòng stock→order→payment→confirmation.

**Lưu ý trung thực**: walkthrough ban đầu dùng product KHÔNG variant (Máy Xay) → đặt hàng 400 `items[0].variantId must not be null` = **finding #8** (bug product thật, file epic) — luồng chính được chứng minh bằng product có variant như golden-path e2e.

## 2. HMR re-verify (T2 mục 9) — ✅ PASS

remoteEntry + `__mf_hmr` **200 qua entry :3400**; ws `vite-hmr` (subprotocol bắt buộc — memory FI-400): shell :5573 `/` OPEN · checkout :5585 `/remotes/checkout/` OPEN · account :5586 `/remotes/account/` OPEN.

## 3. Sync demo (T1) — video + evidence

- **Video**: `.run/sf5-sync-video/sf5-sync-{1-login,2-logout,3-2fa-challenge,4-oauth-callback-error,5-rotate-race}-*-tab{A,B}.webm` (10 files — 5 case × 2 tab, recordVideo Playwright)
- Bảng case × verdict: `docs/superpowers/qa/sync-matrix.md` — rig A **5/5 PASSED** (login A→B ≤1 POST no-reload · logout · 2FA challenge 0-broadcast · OAuth error-path · 20-run race 0 spurious)
- Rig B (:8480 prod) RED — finding #7 (shell prod thiếu route `/remoteEntry.js`) — fix-task epic

## 4. Chrome cross-host consistency (T7)

Screenshots 4 trạng thái × 2 host + results.json: `walkthrough/chrome-consistency/` — verdict `visual-consistency.md`.

## 5. Chuẩn bị STORY-COMPLETE

Epic cần: link artifacts (mục này) + ADR 0009 + findings epic comment + merge hash.
