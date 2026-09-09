# SF-5 chrome cross-host visual consistency + theme legacy-key (FI-402)

> Script: `scripts/qa/visual-consistency.mjs` (Playwright, executablePath pinned) · Screenshots: `walkthrough/chrome-consistency/` · Coordinator TỰ NHÌN ảnh (Rule 0) · Chạy: 2026-09-09, entry :3400.

## Verdict: PASS 8/8 (với 2 finding thiết kế đưa epic — #9, #10)

| # | Check | Kết quả |
|---|---|---|
| 1 | Theme ban đầu 2 host đồng bộ (storefront/light) | ✅ |
| 2 | Toggle storefront → shell đồng bộ ON-LOAD (boot script đọc cùng key) | ✅ sf light→dark, sh(reload)→dark |
| 3 | Toggle về dark 2 host đồng bộ | ✅ |
| 4 | Chrome scaffolding cùng nguồn 2 host (theme-toggle chrome class/aria khớp) | ✅ sf=1 sh=1 |
| 5 | Toggle ghi canonical key `ecommerce.theme` | ✅ value=dark |
| 6 | Storefront authed: static account link (DESIGN SF-4) | ✅ |
| 7 | Shell authed: auth-user island | ✅ |
| 8 | Badge single-instance: add từ storefront → shell (reload) đếm đúng | ✅ badge=1 |

## Phát hiện thiết kế khi xác minh (không phải fail — đã đối chiếu code)

1. **Storefront header KHÔNG có islands (auth-menu/badge) — BY DESIGN**: `ChromeShell.tsx` `SlotActions` (dòng 43-67, comment "markup cũ .header-actions giữ nguyên", nav-honesty) render chrome scaffolding (logo/search/theme/locale) + STATIC action links (`Giỏ hàng`/`Tài khoản` → shell routes). AuthMenu/CartBadge islands CHỈ render trên shell routes (đăng ký từ mfe-account/mfe-checkout remotes — Next không load remotes). Người dùng đã login vẫn thấy link "Tài khoản" (không phải user menu) trên trang storefront — hành vi FI-390 giữ nguyên.
2. **Theme sync = ON-LOAD thôi** — xem finding #9.

## Finding #9 (epic ratify — design-intent gap): theme sync KHÔNG có live cross-tab

`packages/chrome/src/ThemeToggle.tsx` `toggle()` (dòng 38-51): ghi `localStorage['ecommerce.theme']` + set DOM **của tab mình**; KHÔNG có BroadcastChannel/storage-event listener trong chrome (theme.ts pure, boot script chỉ chạy lúc load). Epic FI-397 §SF-4 demo ghi "theme toggle 1 app → cả 2 đồng bộ" — nếu ý là LIVE sync (tab B đổi NGAY không reload) thì THIẾU cơ chế; hiện chỉ đồng bộ khi tab B reload (boot script đọc lại key). E2E này chứng minh on-load sync hoạt động 2 chiều 2 host. **Nếu epic muốn live sync: fix nhỏ SF-1 (storage listener trong ThemeToggle — vài dòng, không cần BC).**

## Finding #10 (visual consistency gap — epic quyết): brand + actions khác nhau giữa 2 host

Screenshots `guest-light-{storefront,shell}.png` đặt cạnh:

| Element | Storefront (Next) | Shell (Vite) |
|---|---|---|
| Logo | **ShopVN.** + badge "CHÍNH HÃNG · FREESHIP" (brand FI-390) | **ecommerce.** (brand cũ) |
| Actions | `Giỏ hàng` + `Tài khoản` (link có icon+label) | `Đăng nhập` `Đăng ký` + icon giỏ trần |
| Locale switch | `EN` link | (không thấy trên shell header) |
| Search + button đỏ + nav row + typography/height | **GIỐNG NHAU** (chrome scaffolding 1 nguồn) | same |

Chrome scaffolding (search/nav/theme-toggle/spacing) đồng nhất đúng 1 nguồn; KHÁC biệt nằm ở nội dung host-slot. Brand lệch "ShopVN vs ecommerce" là gap nhận thức thương hiệu hữu hình nhất — **epic quyết**: (a) shell SlotLogo đổi sang ShopVN (SF-4-style slot content fix) hoặc (b) chấp nhận per-host brand (ghi ADR).

## Theme legacy-key migration check (pack item 7)

- **grep proof**: `ecommerce.theme` là key DUY NHẤT trong monorepo (chrome theme.ts:15 THEME_STORAGE_KEY; boot script literal khớp — chrome/__tests__/theme.test.ts:11,43 khoá contract; không có key theme nào khác trong apps/*/src — find+xargs grep).
- Probe FI-398 (theme.ts:8-10): FI-390 KHÔNG giới thiệu key khác → **read-order migration N/A** (không có key cũ để migrate).
- Functional: toggle ghi đúng canonical key (check #5, value=dark/light/null-theo-system); boot script đọc canonical — 2 host.

## Kết luận T7

**PASS** — chrome 1 nguồn chứng minh được (scaffolding + toggle + key canonical + badge single-instance); 2 finding (#9 live-sync intent, #10 brand/actions gap) đưa epic quyết — không phải regression code của SF-1..4 (hành vi khớp code đã merge, chỉ kỳ vọng demo/brand cần epic đối chiếu lại).
