# FI-400 Walkthrough & Acceptance Evidence — SF-3 dev-one-origin-entry

Date: 2026-09-09 · Entry verify: `http://localhost:3600` (rig +600 — :3000 đang bị stack session khác giữ, topology giống hệt, chỉ khác hằng số port — xem plan R3)
Rig: Next :3600 (rewrites entry) · shell :5773 · checkout :5775 (bake VITE_STRIPE_PUBLISHABLE_KEY) · account :5776 · admin :5777 · skeleton :5778 · gateway :8080 (shared stack)

## ACCEPTANCE (context pack §30-39) — từng dòng

| # | Acceptance | Evidence | Verdict |
|---|---|---|---|
| 1 | 1 URL đi hết golden path: home→PLP→PDP→cart→checkout→confirmation→account, actions hoạt động | Browser walkthrough 09-09: `/` → click `/c/dien-tu` (h1 Điện Tử, 12 SP) → click `/p/…` (PDP render) → THÊM VÀO GIỎ → header link `/cart` (item hiện, badge 1 cross-app) → `/checkout` 3 bước → `/order/confirmation` "Cảm ơn bạn đã mua hàng!" (đơn 9900d80c, COD) → `/account` (Tài khoản render). Screenshots: `fi400-gp-1..6-*.png`. E2E golden-path 8/8 (bao gồm register UI + coupon + Stripe PAID + Mailpit + admin CONFIRMED) | **PASS** |
| 2 | `/admin` mở được AdminApp LAYOUT RIÊNG (sidebar/topbar admin, không chrome wrap) | `:3600/admin` → RBAC redirect `/login` khi guest → login qua entry → AdminApp sidebar riêng (TỔNG QUAN/SẢN PHẨM/ĐƠN HÀNG/…) + topbar admin, full-bleed ngoài main 960; shell Header giữ cho auth widget = đúng hiện trạng base (App.tsx:154-155 — SF-4 sẽ swap, ngoài scope SF-3). Screenshot: `fi400-rig-admin.png` | **PASS** |
| 3 | HMR sống 2 phía: sửa file Next → hot update; sửa file remote → hot update (clientPort ws trực tiếp) | Probe: Next = Fast Refresh KHÔNG reload (window marker persist); shell host = Fast Refresh không reload; remote checkout = **auto full-reload qua relay** (marker wipe + text mới, log `[vite] hmr update` + metadata `wsUrl: ws://localhost:5775/...` clientPort + round-trip revert). Chi tiết: `docs/superpowers/evidence/fi400-probe.md` Gate 2 | **PASS** (remote = auto-reload theo thiết kế plugin — ADR 0008) |
| 4 | remoteEntry 3 remotes load qua entry, không CORS/404 | Performance entries (trang /cart qua :3600): `/remotes/{skeleton,account,checkout,admin}/remoteEntry.js` **4/4 → 200 same-origin, 0 port khác trong URL**, deps + /@fs bọc theo prefix. Probe Gate 1 | **PASS** |
| 5 | Links shellUrl() ra same-origin `/cart` (không `//cart`, không absolute) | DOM header trang Next: `<a href="/cart">` ×2 (Giỏ hàng) — relative; unit test site.test.ts (default `''`, env override, không protocol-relative); e2e nav-honesty footer links 7/7 | **PASS** |
| 6 | e2e subset (golden-path, nav-honesty) XANH env defaults mới; auth-cookie qua entry proxy | 09-09 trên rig: golden-path **8/8** (full Stripe PAID, checkout :5775 bake VITE_ key) + nav-honesty **7/7** + auth-cookie **4/4** (Set-Cookie xuyên NEXT proxy nguyên vẹn: HttpOnly, SameSite=Lax, Path=/api/identity — FI-337 lock chuyển mục tiêu như ADR) — **19/19** | **PASS** |

## Screenshots

- `fi400-gp-1-home.png` — home qua entry (hero + flash sale)
- `fi400-gp-2-plp.png` — PLP Điện Tử
- `fi400-gp-3-pdp.png` — PDP + CTA
- `fi400-gp-4-cart.png` — cart item + badge 1 cross-app
- `fi400-gp-5-confirmation.png` — đơn COD CONFIRMED
- `fi400-gp-6-account.png` — account page
- `fi400-rig-admin.png` — AdminApp layout riêng qua entry
- `fi400-rig-cart.png` — cart render đầu probe

## Đã fix trong lúc walkthrough (dev-repo nếu phát hiện)

- `next.config.mjs`: thêm rewrite `/index.html` → shell (module html-proxy của shell index — 404 làm checkout submit đứng). Commit kèm SF.

## Phạm vi KHÔNG verify ở đây (thuộc SF khác)

- Session-sync tức thì 2 tab (SF-2) · chrome rendering/labels (SF-1/SF-4) · layout swap (SF-4) · e2e FULL 14 specs + docker regression (SF-5).
