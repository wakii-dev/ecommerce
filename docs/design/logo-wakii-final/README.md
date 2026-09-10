# Wakii store — Logo final · hand-off spec (Direction B · Túi W)

> **Decision record**: 3 hướng draft đã trình tại `docs/design/logo-wakii-3directions.html`
> — user **CHỌN HƯỚNG B · TÚI W** (mark + wordmark: nếp gấp trước túi chính là chữ W,
> góc gần-vuông bo 5px theo radius system, palette giữ nguyên CTA `#F53D2D→#FF7A45`).
> Asset dưới đây hoàn thiện đúng hướng B, **không đổi thiết kế** — chỉ outline wordmark
> thành path và phái sinh các biến thể sử dụng.

Wordmark đã chuyển thành **outline path** (font Be Vietnam Pro 700/500, OFL) — asset
render đúng trên mọi máy, **không cần cài font**. Chữ không sửa trực tiếp được; muốn
đổi text phải gen lại từ font.

---

## 1 · File manifest

| File | ViewBox | Nội dung | Dùng khi |
|---|---|---|---|
| `logo-horizontal-light.svg` | `0 0 198.2 48` | mark + "Wakii" (#212121) + "store" (#757575) | Nền sáng (surface #FFFFFF) |
| `logo-horizontal-dark.svg` | `0 0 198.2 48` | mark + "Wakii" (#F5F5F5) + "store" (#9E9E9E) | Nền tối (surface #1E1E1E) |
| `mark.svg` | `0 0 48 48` | symbol standalone (túi gradient + W trắng), nền trong suốt | App icon / avatar / ghép linh hoạt |
| `favicon.svg` | `4 2.25 40 40` | mark, crop khít nội dung (đọc rõ hơn ở 16px) | Favicon trình duyệt |
| `icon-192.png` / `icon-512.png` | 192²/512² px | mark full màu, **nền trong suốt** | PWA manifest `purpose: "any"` |
| `maskable-192.png` / `maskable-512.png` | 192²/512² px | túi trắng + W knockout gradient trên nền gradient full-bleed | PWA manifest `purpose: "maskable"` |

Tỉ lệ chung lockup: mark : chữ = 48 : 198.2 (≈ 1 : 4.13). Render bằng `height`, để `width: auto`.

## 2 · Tokens (nguồn: `frontend/packages/ui-kit/src/styles/tokens.css`)

| Token | Giá trị | Vai trò trong logo |
|---|---|---|
| `--grad-cta` | `#F53D2D → #FF7A45`, góc 140° (SVG: `x1=0 y1=0 x2=48 y2=48` userSpaceOnUse) | Thân túi + quai |
| `--c-surface` | `#FFFFFF` | Nếp W (trắng, mọi theme) |
| `--c-text` | `#212121` (light) / `#F5F5F5` (dark) | "Wakii" |
| `--c-text-muted` | `#757575` (light) / `#9E9E9E` (dark) | "store" |

Radius: thân túi `rx=5` trên lưới 48 — **tỉ lệ với kích thước render** (5/48 ≈ 10.4%),
không fix px. Đây là radius gần-vuông của system (2/4/8px) — **không bo mềm hơn**.

Wordmark: "Wakii" 34/48 mark-height, Be Vietnam Pro **700**, tracking `-.01em`;
"store" 9.4/48, Be Vietnam Pro **500**, tracking `.28em`; cùng baseline.
Khe mark→chữ 11.4/48, chữ→"store" 8.8/48. Baseline y = 34.83 (tâm optical chữ trùng tâm ink của mark, y=22.25).

## 3 · Quy tắc dùng light/dark

- Mark **giữ nguyên ở cả 2 theme** (gradient + W trắng đọc tốt trên #FFFFFF lẫn #1E1E1E) — chỉ wordmark đổi màu.
- Chọn file theo **nền đặt logo**, không theo media query của trang: header/toolcard nền trắng → light; dropdown/header dark → dark.
- Không đặt logo light lên nền tối và ngược lại (mất contrast "store").
- Cấm: đổi màu gradient, thêm stroke/shadow, xoay, kéo giãn không đều, đặt W trắng lên nền trắng (W tan vào nền).

## 4 · Khoảng cách an toàn & kích thước tối thiểu

- **Clear space**: mỗi phía ≥ **12 units / 48** (25% chiều cao mark) — không đặt text/icon khác xâm nhập.
- Mark standalone: ≥ 16px. Lockup ngang: ≥ 32px chiều cao (dưới 32px → chuyển dùng `mark.svg` đơn thân).
- Favicon: 16px (đã crop khít, verify bằng tab mockup light + dark).
- Maskable: đã chốt trong safe-zone (circle 80%) ở cả 192 và 512 — **không thêm padding nữa**.

## 5 · Ghép vào chrome header (`frontend/packages/chrome` SiteHeader)

SiteHeader là slot-based: logo nằm trong **slot `left`**.

1. **storefront-web** — `frontend/apps/storefront-web/components/ChromeShell.tsx`, component `SlotLogo`
   (hiện là text `.logo-word` + `.logo-dot` + `.logo-ticker`):
   - Thay nội dung bằng `<img src="/logo-horizontal-light.svg" alt="Wakii store" />`,
     height khuyến nghị **28–32px** (cân theo `chrome.css` row1), đặt tại `public/`.
   - Dark mode: swap theo theme class/attr hiện có của site (ui-kit tokens) — cách swap
     (CSS `content:` hay 2 img toggle) Dev tự quyết.
2. **shell app** — `frontend/apps/shell/src/header/Header.tsx`, `.shell-logo` (slot `left`,
   đăng ký từ `main.tsx`): thay text bên trong `<Link>` bằng `<img>` tương ứng.
3. Giữ nguyên `aria-label` / link về `/` hiện có; logo là link home — không bọc thêm nút.

## 6 · Favicon — storefront-web (`frontend/apps/storefront-web`)

- Copy `favicon.svg` → `public/favicon.svg`.
- `app/layout.tsx` metadata hiện chỉ khai `icons.apple` → thêm:
  `icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' }`
  (Next sẽ sinh `<link rel="icon" type="image/svg+xml">`).
- Không có `favicon.ico` cũ trong `app/` — không cần dọn; nếu muốn tương thích browser cũ,
  xuất thêm .ico ngoài scope bộ này.

## 7 · PWA manifest (`frontend/apps/storefront-web/app/manifest.ts`)

Thay 3 icon cũ (`public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`) bằng file mới
cùng tên, **thêm** entry còn thiếu:

```ts
{ src: '/icons/icon-192.png',     sizes: '192x192', type: 'image/png' },
{ src: '/icons/icon-512.png',     sizes: '512x512', type: 'image/png' },
{ src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }, // mới
{ src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
```

- `apple-touch-icon.png` (hiện 585B, hình cũ): dùng lại `icon-192.png` (iOS tự resize)
  hoặc xuất riêng 180px từ `mark.svg` — một trong hai, khỏi giữ file cũ.
- Maskable dùng biến thể **knockout trắng** (đã encode trong PNG) — đừng tự đặt `mark.svg`
  vào ô maskable (mark gốc trong suốt sẽ cheét nền khi mask tròn).

## 8 · Ngoài scope thiết kế (Dev tự quyết)

- Cơ chế swap light/dark trong header (class/media/2 img).
- Height chính xác của logo trong row1 header (theo `chrome.css` hiện hành).
- Xuất .ico / apple-touch 180px nếu cần.
- Preload/cache header của SVG icon (sw.js đã có — giữ chiến lược hiện tại).
