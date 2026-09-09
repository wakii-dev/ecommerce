# SF-5 perf sanity — chrome double-inclusion binary gate (FI-402)

> Build: `vite build` shell ✅ (1.62s, exit 0) + `next build` storefront ✅ (exit 0) — cả hai chạy SAU khi rig A dừng (plan P0: next build phá next dev) · Chạy: 2026-09-09 · Logs: `.run/sf5-build-{shell,next}.log`.

## Precondition (marker ≥1 mỗi app — chống pass-vacuous)

| Marker (string literal sống qua minify) | shell dist | next .next/static/chunks |
|---|---|---|
| `ecommerce:header-slots-changed` | 2 files | 0 (storefront không dùng slots registry) |
| `ecommerce:cart-changed` | 1 file | 1 file (chunk 678-…) |
| `ecommerce.theme` | 1 file | 1 file (chunk 678-…) |

✅ Marker đếm ≥1 ở CẢ HAI app.

## Kết quả quét

**Shell (Vite MF + SHARED_SINGLETONS):**
- Toàn bộ chrome module (theme + cart-badge + header-slots + lang + `chrome-header` markup classes) nằm trong **ĐÚNG 1 shared chunk**: `index-D6p8_wvg.js` (tất cả marker cùng xuất hiện ở đây).
- `index-Barn5yQK.js` chứa duy nhất string `ecommerce:header-slots-changed` (×2) — đây là **string literal bị inline** vào chunk host nơi shell tự đăng ký/lắng nghe slots — KHÔNG phải bản chrome thứ hai (0 hit cho mọi marker chrome khác trong file này).
- Guest-cart/auth tokens (packages/auth) không nằm trong shell host dist — auth cũng là shared singleton, remote tự tham chiếu qua shareScope ✅.

**Storefront (Next transpilePackages):**
- `ecommerce:cart-changed` + `ecommerce.theme` cùng nằm trong **ĐÚNG 1 client chunk** (`678-1c980ecd29a536e9.js`) — 1 bản chrome client-side ✅.

## Verdict: **PASS (binary gate)**

Không app nào có ≥2 bản chrome độc lập trong bundle:
- Shell: host + remotes chia sẻ 1 chrome chunk qua MF shareScope (SHARED_SINGLETONS config SF-1 hoạt động đúng ở prod build).
- Next: transpilePackages dedupe về 1 client chunk.
- Bonus: 2 build prod đều XANH trên nhánh đích (bài học FI-401 "xóa file exposed MF mà quên xóa expose → vite build vỡ" không tái diễn).
