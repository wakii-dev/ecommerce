# SF-6 T10 — Visual walkthrough record (FI-396, Rule 0)

- Ngày: 2026-09-09 · Record: `scripts/qa/walkthrough-record.mjs` + re-shoot admin qua shell login · Video: `walkthrough/video/*.webm` · Manifest: `walkthrough/manifest.json` (25 shots desktop+mobile)
- **Coordinator TỰ mở + tự nhìn từng screenshot chính** (không tin report agent) — Rule 0.

## Surfaces đã record (5/5)

| Surface | Shots | Verdict nhìn bằng mắt |
|---|---|---|
| storefront (home/PLP/PDP/search/coupons) | sf-*.png ×11 | Đúng direction B: hero ken-burns + kicker + CTA accent; flash sale countdown; PLP 2-col @375; PDP sticky ATC <600 |
| shell + cart/checkout | shell-*.png ×8 | Header §7.8 ĐỦ: logo + search (viền 2px primary) + cart-badge + account menu ("Nguyen ∨" logged-in shot `keyboard/13-checkout-s3.png`, "Admin ∨" `admin-dashboard-*.png`); mini-cart drawer guest hoạt động (§7.11) |
| checkout 3 bước (keyboard walkthrough T5) | `keyboard/11-15.png` | Stepper ✓✓3; payment card selected; summary CÓ ảnh sản phẩm + Tổng đỏ; đặt đơn COD 201 → confirmation + CTA về home |
| account | account-orders-*.png ×2 + `keyboard/03.png` | Orders render, side-nav layout |
| admin (login qua shell /login → shell-mounted) | admin-*-admin(-dark).png ×6 | Sidebar group + icon + active state §2.5; KPI tabular; charts dark sạch; 4 trạng thái theme đủ |

## 4 trạng thái theme (storefront/admin × light/dark)
Đủ matrix: `sf-*-light/dark`, `admin-*-admin/admin-dark` — dark sạch trên home/flash/admin dashboard (trừ real-bug đã adjudicate: theme-toggle chip sáng — thấy đúng trong `sf-home-dark.png` góc header).

## Mobile 375
`mobile-sf-home-375.png`, `mobile-sf-pdp-375-sticky.png` (sticky ATC bar ✓), `mobile-shell-cart-375.png` (F1 overflow shell đã adjudicate FAIL SF-3 — ảnh `rule0-shell-home-375.png`).

## Sign-off notes
- Video webm lưu tại `walkthrough/video/` (context chính: storefront → shell/cart/drawer/checkout → account → admin, light+dark).
- 18 ảnh keyboard-flow (`walkthrough/keyboard/`) = bằng chứng bổ sung flow mua hàng + focus states.
- Các bug nhìn thấy trong record = ĐÚNG những gì đã adjudicate (theme-toggle dark, uk-btn dark label ở login, shell @375 overflow) — không phát hiện thêm visual mới ngoài notes P2 (breadcrumb separator '>' raw @375, shell header Arial controls).
- Kết luận: **walkthrough PASS với known-bugs đã fix-task** — user xem video + shots để sign-off cuối (STORY-COMPLETE).
