# FI-310 Storefront Design Direction — FINAL

> **USER ĐÃ CHỌN: Hướng A — "Chợ Sôi Động"** (gate SF-2 resolved · 2026-09-06)
> Prototype: https://share.onorca.dev/a/TCHvVvOBONi6
> File nguồn (tự chứa, mở trực tiếp được): `/tmp/fi310-design-312/a.html` (bản b/c lưu tại `/tmp/fi310-design-312/{b,c}.html` — KHÔNG dùng, chỉ record)
> Đối tượng hand-off: task-executor hoàn thiện `frontend/packages/ui-kit/src/styles/tokens.css`
> Mọi giá trị hex/px dưới đây trích CHÍNH XÁC từ file prototype A (không suy đoán).

---

## 1. Tokens

### 1.1 Mapping tên biến (prototype → ui-kit)

| Prototype (`a.html :root`) | ui-kit (`tokens.css`) | Giá trị |
|---|---|---|
| `--color-primary` | `--c-primary` | `#F53D2D` |
| `--color-primary-dark` | `--c-primary-hover` | `#CB1B00` |
| `--color-bg` | `--c-bg` | `#F5F5F5` |
| `--color-surface` | `--c-surface` | `#FFFFFF` |
| `--color-text` | `--c-text` | `#212121` |
| `--color-text-secondary` | `--c-text-muted` | `#757575` |
| `--color-border` | `--c-border` | `#EEEEEE` |
| `--color-danger` | `--c-danger` | `#D0011B` |
| `--color-warning` | `--c-warning` | `#FE9C08` |
| `--color-success` | `--c-success` | `#26AA99` |
| (không có trong prototype — `:focus-visible` dùng outline primary) | `--c-focus` | `#F53D2D` |
| `--color-accent` (dùng riêng flash-deal/cart-badge) | `--c-accent` | `#FFD839` |

### 1.2 Spacing scale (giữ nguyên tên)

```
--space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
--space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;
```

### 1.3 Radius

```
--radius-sm: 2px;   /* nút, chip, badge, search bar — góc gần vuông */
--radius-md: 4px;   /* card, dropdown, price-block, KPI */
--radius-lg: 8px;   /* hero, flash section, cat-tile, admin shell, gallery */
--radius-full: 999px; /* pill trạng thái admin, swatch dùng 50% */
```

### 1.4 Shadow

```
--shadow-1: 0 1px 2px rgba(0,0,0,.08);   /* header, card tĩnh, KPI */
--shadow-2: 0 2px 8px rgba(0,0,0,.12);   /* hover lift, dropdown, hero */
--shadow-3: 0 8px 24px rgba(0,0,0,.16);  /* (dự phòng modal/drawer) */
```

### 1.5 Typography

- Google Fonts: **Be Vietnam Pro** — weights `400;500;600;700;800` (subset vietnamese).
- `--font-sans: 'Be Vietnam Pro', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;`
- (prototype có `--font-display` và `--font-body` trùng nhau — ui-kit chỉ cần 1 biến `--font-sans`.)

Font size scale — chuẩn hóa từ các cỡ THỰC DỤNG trong prototype:

```
--text-xs:  11px;  /* dd-title, kpi-label, badge phụ, hot-tag (10-11px) */
--text-sm:  12px;  /* caption, meta, giá gạch, breadcrumb */
--text-md:  14px;  /* body mặc định (prototype body = 14px/1.5) */
--text-lg:  16px;  /* giá card flash, sub hero */
--text-xl:  18px;  /* countdown số, tên variant */
--text-2xl: 24px;  /* section title flash, sec-title (21px→24 chuẩn hóa), admin logo */
--text-3xl: 34px;  /* price-now PDP */
```

Trường hợp đặc biệt (giữ đúng prototype, không đưa vào scale): hero title `44px/800/1.12`, PDP h1 `23px/700`, logo wordmark `26px/800`, PLP h1 `28px/800`, KPI value `23px/800`, tên card `13px/600` (clamp 2 dòng, height cố định 37px), số review `44px/800`.

### 1.6 Tint palette (dẫn xuất từ tokens — dùng cho badge/pill/hover tint)

| Tint | Nền | Chữ | Viền | Dùng cho |
|---|---|---|---|---|
| primary tint | `#FDEEEE` | `#CB1B00` (hoặc `--c-primary`) | `#FBC8C2` | badge Chính hãng, badge bảo hành, hover nút outline, nav active admin, rank tròn |
| success tint | `#E5F5F3` | `#197A6D` | `#BCE4DF` | badge Freeship, badge "Mua đã xác nhận" |
| new tint | `#FFF4DC` | `#9A6B00` | `#F7E3AC` | badge Hàng mới |
| price wash | `#FFF1F0` | `--c-danger` | `#FBC8C2` | khối giá PDP |
| hover wash | `#FAFAFA` | — | — | dropdown item hover, row hover, qty hover |
| star track | `#D8D8D8` | fill `--c-warning` | — | sao rating (track + fill) |

### 1.7 Hai theme (`data-theme`)

**`data-theme="storefront"`** = bảng giá trị §1.1–1.5 nguyên vẹn (mặc định `:root`).

**`data-theme="admin"`** — override (theo ghi chú TOKENS-NOTE của chính prototype A + CSS màn 4):

```css
[data-theme="admin"] {
  --c-bg: #EFEFEF;        /* xám hơn storefront một bậc cho khối dữ liệu dày */
  --c-surface: #FFFFFF;
  /* shadow khối dữ liệu dùng --shadow-1 thay --shadow-2 (giảm độ nổi) */
}
```

Giữ nguyên family màu A (primary/danger/warning/success/accent không đổi). Các surface trong admin (KPI card, chart-block, table-block, topbar) = `--c-surface` + `1px solid --c-border` + `--shadow-1`, bo `--radius-md`; khung admin shell bo `--radius-lg`.

**Status pill palette (admin — dùng cho enum đơn hàng, đúng spec §3.6):**

| Trạng thái | Nền | Chữ |
|---|---|---|
| PENDING | `#FFF4E0` | `#9A5B00` |
| PAID | `#E3F0FF` | `#1677FF` |
| CONFIRMED | `#E3F5F2` | `#1B8476` |
| SHIPPED | `#EEF0FB` | `#4A4AC8` |
| DELIVERED | `#E7F6EC` | `#1F7A45` |
| CANCELLED | `#FDEBEC` | `#C0151F` |

Pill: `font-size 11px/800, letter-spacing .5px, padding 3px 9px, border-radius --radius-full`. (PAID là tint xanh dương ngoài tokens gốc — chấp nhận theo directive prototype, ghi chú đây là 1 exception có chủ đích.)

### 1.8 Gradient ảnh placeholder (theo danh mục — tint theo tokens)

```
Điện tử:  linear-gradient(140deg,#EAF3FF,#D9E9FF)
Thời trang: linear-gradient(140deg,#FFEEE8,#FFDFD2)
Nhà cửa:  linear-gradient(140deg,#E9F7EE,#D8F0E1)
Sách:     linear-gradient(140deg,#FFF7DC,#FFEFBC)
Làm đẹp:  linear-gradient(140deg,#F4EBFC,#EBDCF8)
```

Hero carousel 3 slide: `120deg #F53D2D→#FF7A45` · `120deg #CB1B00→#F53D2D` · `120deg #FF512F→#DD2476`. Flash section: `180deg #FFD839→#FFB800`. Nút Mua ngay: `90deg #F53D2D→#FF7A45`. Thumbnail PDP theo màu variant: Đen `#4a4a4a→#1a1a1a` · Trắng `#ffffff→#ededed` · Xanh Navy `#33507f→#22355c` · Be `#e6d6b8→#d9c7a7`.

---

## 2. Structure

Container: `max-width 1280px`, `margin 0 auto`, `padding 0 16px`.

### 2.1 Header storefront (sticky)
- `position: sticky; top: 0; z-index: 100; background: --c-surface; box-shadow: --shadow-1`.
- **Hàng 1** (flex, gap 24px, padding-y 12px): logo (wordmark 26px/800 màu primary + chấm đỏ 9px + ticker "CHÍNH HÃNG · FREESHIP" 9px nền primary-tint) → **search bar trung tâm** (`flex: 1 1 auto; max-width: 760px; margin: 0 auto`) → actions (cart icon 22px + account menu, gap 16px).
- **Search bar**: viền `2px solid --c-primary`, `--radius-sm`; input padding `9px 12px` 14px; nút search nền primary chữ trắng `0 22px` 700, hover `--c-primary-hover`. Dropdown autocomplete: absolute `top calc(100% + 4px)`, full-width, surface, border, `--radius-md`, `--shadow-2`; nhóm gợi ý có title uppercase 11px letter-spacing 1px `--c-text-muted`; item hover nền `#FAFAFA` + chữ primary; tag "ĐANG HOT" nền `--c-danger`.
- **Cart badge**: nền `--c-accent` (vàng) chữ `--c-text`, min 18×18, border `2px solid --c-surface`, đè góc trên phải icon.
- **Hàng 2 — mini-nav**: full-width nền `--c-primary`, link trắng 13px/600 padding `8px 14px`, hover nền `--c-primary-hover`; mục "Hàng mới/Bán chạy" màu `--c-accent`.
- Breakpoint `≤900px`: hàng 1 wrap — search xuống dòng riêng full-width (order 3); mini-nav chuyển scroll-x.

### 2.2 Home
1. **Hero carousel**: `--radius-lg`, `--shadow-2`, cao 300px, padding ngang 8%; kicker uppercase 13px letter-spacing 3px; title 44px/800 line-height 1.12; nút "Mua ngay" nền `--c-accent` chữ đen 800 padding `12px 32px` `--radius-md`; ribbon trắng "50% OFF" xoay `-8deg` góc phải; arrows tròn 38px nền trắng alpha .92; dots 9px tròn trắng alpha .5, active rộng 22px bo 6px. Track translateX `transition: transform .45s ease`.
2. **Flash deal**: khối nền gradient vàng `180deg #FFD839→#FFB800`, `--radius-lg`, padding 16px; h2 24px/800 uppercase + **đếm ngược** 3 hộp 36×36 nền `#212121` chữ vàng 18px/800 `font-variant-numeric: tabular-nums`, format `hh:mm:ss`; hàng ngang scroll-x, card 186px (thumb 150px, badge -% nền primary góc trên trái 12px/800, tên clamp 2 dòng, giá `--c-danger` 16px/800 + giá gạch 12px line-through `--c-text-muted`).
3. **Danh mục**: grid **6 cột** gap 12px; tile gradient nhạt theo danh mục (§1.8), border + `--shadow-sm`, `--radius-lg`, padding `16px 12px`, center; hover `translateY(-2px)` + `--shadow-2`; tile "Xem thêm" border dashed.
4. **Grid sản phẩm đề xuất**: grid **4 cột** gap 12px; header section = thanh dọc primary 5×22px + title 21px/800 uppercase + link "Xem thêm" primary bên phải.
5. Footer: nền `#212121`, 4 cột gap 32px, link 13px `#bbb` hover `--c-accent`.

### 2.3 Product card (anatomy — dùng chung home/PLP/related)
```
.p-card: surface + 1px border --c-border + --radius-md + --shadow-1; hover: --shadow-2 + translateY(-2px)
├─ .p-thumb (cao 190px, gradient theo danh mục, emoji/icon center)
│  ├─ badge -% : nền --c-primary chữ trắng 12px/800, góc trên-trái (8,8), padding 2px 7px, --radius-sm
│  └─ .p-badges (góc dưới-trái, gap 5px): tint pill 10px/700 padding 2px 6px — Chính hãng/Bảo hành = primary tint · Freeship = success tint · Hàng mới = new tint (§1.6)
└─ .p-body (padding 12px, gap 6px)
   ├─ tên 13px/600, clamp 2 dòng, hover chữ primary
   ├─ giá: --c-danger 17px/800 + giá gạch 12px line-through
   └─ meta: sao (track #D8D8D8 + fill --c-warning, 13px) + (số lượt) 12px --c-text-muted
```
Related: grid **5 cột**, thumb 150px.

### 2.4 PLP
- Nền `--c-surface`; breadcrumb 13px `--c-text-muted`; h1 28px/800 uppercase + count 14px.
- Layout: grid **`256px + 1fr`**, gap 24px; sidebar `border-right 1px --c-border`, block ngăn cách `border-bottom`.
- Sidebar blocks: (1) cây danh mục — parent 14px/600 + count 11px, child active = chữ primary 700 + `border-left 2px primary`; (2) giá — checkbox 15×15 `accent-color: --c-primary`; (3) rating; (4) thương hiệu; nút "Xóa tất cả" outline primary full-width, hover primary-tint.
- Toolbar: kết quả 13px trái + sort select (border, `--radius-sm`, padding `7px 10px`, 13px) + view-toggle 32×30 (active nền primary-tint chữ primary) phải, `border-bottom` dưới toolbar.
- Grid **3 cột** gap 16px (dùng chung .p-card). Pagination: nút 34×34 border `--radius-sm`, hover viền+chữ primary, active nền primary chữ trắng; dots `--c-text-muted`.

### 2.5 PDP
- Layout: grid **`minmax(380px, 45%) + 1fr`**, gap 32px.
- **Gallery trái**: ảnh chính `aspect-ratio 1/1`, border, `--radius-lg`; flag -% nền primary góc trên trái; 4 thumbs 72×72 `--radius-md` border `2px transparent`, active `border-color primary`.
- **Info phải**: h1 23px/700/1.35 → meta (đã bán + link sao `--c-warning` 700) → **price-block** nền `#FFF1F0` border `#FBC8C2` `--radius-md` padding `12px 16px`: giá `34px/800 --c-danger`, giá gạch 15px line-through, pill -% nền `--c-danger` chữ trắng 14px/800, note dưới 12px primary-dark → **variants**: swatch tròn 38px border 2px (active: viền primary + ring 3px primary-tint), size chip min 46×38 `--radius-sm` (active chữ primary nền primary-tint) → **qty stepper** (nút 36px, input 44px, cao 42px, border) + tồn kho 12px + wishlist 46×46 (hover viền+chữ `--c-danger`) → **CTA**: 2 nút flex-1 cao 50px uppercase 15px/800 letter-spacing .5px `--radius-sm` (xem §3 Button) → perks row `border-top dashed` (icon tròn 30px primary-tint).
- **Tabs**: gap 24px, `border-bottom 2px --c-border`; tab 15px/700 `--c-text-muted`, active chữ primary + gạch chân 3px primary. Bảng spec: th 220px nền `#FAFAFA`, cell border, padding `10px 14px`.
- **Reviews**: layout **`280px + 1fr`** gap 32px. Trái: card điểm (border, `--radius-md`, số 44px/800 `--c-warning`) + 5 bar (cao 7px, track `#F0F0F0`, fill `--c-warning`) + nút "Viết đánh giá" outline primary. Phải: review item `border-bottom`, sao 13px `--c-warning`, badge "Mua đã xác nhận" success-tint 11px/700.
- Related: 5 cột.

### 2.6 Admin dashboard (`data-theme="admin"`)
- Shell: grid **`222px + 1fr`**, surface, border, `--radius-lg`, `--shadow-1`, min-height 760px.
- Sidebar: border-right; logo 17px/800 primary; nav item `11px 16px` 14px/600 `--c-text-muted`, `border-left 3px transparent` — hover chữ primary + `#FAFAFA`; active nền primary-tint + chữ primary + `border-left-color primary`. Cuối: user block `border-top`.
- Main: nền `--c-bg` (admin: `#EFEFEF`), padding `16px 24px`, gap 16px.
- Topbar: surface border `--radius-md` padding `12px 16px`; search min 220px; bell 36×36 + dot `--c-danger` 7px; nút "Xuất CSV" outline primary.
- **KPI**: grid **4 cột** gap 16px; card surface + border + `--radius-md` + `--shadow-1` padding 16px; label 11px/700 uppercase letter-spacing 1px `--c-text-muted`; value 23px/800; delta 12px/700 `--c-success`; mini-list item `border-bottom dashed` + rank tròn 18px (primary-tint / low-stock: `#FDEBEC` + `--c-danger`).
- **Chart**: khối surface + border + `--radius-md` + `--shadow-1`; SVG line chart stroke `--c-primary`, grid ngang `--c-border`, nhãn trục 11-12px `--c-text-muted`, legend dot 10px primary.
- **Bảng orders**: khối surface + border + `--radius-md`, head `12px 16px border-bottom`; thead nền `#FAFAFA` uppercase 11px letter-spacing .8px `--c-text-muted`; td `11px 14px border-bottom`; row hover `#FAFAFA`; mã đơn 700 primary `tabular-nums`; tiền right-aligned 700 `tabular-nums`; action link primary (hover underline); pill trạng thái §1.7.

---

## 3. Behavior

- **Hover lift (card/tile)**: `translateY(-2px)` + `--shadow-2`. Prototype NHẢY tức thời (không có transition) — khuyến nghị khi implement: `transition: box-shadow .12s ease, transform .12s ease` (cải thiện cảm giác, không đổi design).
- **Button variants (mapping ngôn ngữ A)**:
  - `primary` = nút "MUA NGAY": gradient `90deg --c-primary → #FF7A45`, chữ trắng, shadow `0 4px 12px rgba(245,61,45,.35)`, hover `--c-primary-hover`. (Biến thể phẳng: nền `--c-primary`, hover `--c-primary-hover` — nút search.)
  - `secondary` (outline) = "THÊM VÀO GIỎ" / "Xóa tất cả" / "Viết đánh giá" / "Xuất CSV": nền surface, `border 2px --c-primary` (CTA chính) hoặc `1px` (nút phụ), chữ primary, hover nền `#FDEEEE`.
  - `ghost` = account/cart action, tab, pagination thường: không viền, hover chữ primary (ghost trên nền tối mini-nav: hover nền `--c-primary-hover`).
  - `danger`: không có nút danger riêng trong prototype — giá, badge -%, dot thông báo, pill CANCELLED dùng `--c-danger`. Nút hủy admin (đề xuất theo ngôn ngữ pill): outline 1px, chữ `#C0151F`, nền `#FDEBEC`.
- **Focus**: `:focus-visible { outline: 2px solid --c-primary; outline-offset: 2px }` (toàn cục).
- **Carousel**: track `transform` transition `.45s ease`; dots + 2 arrow; auto-rotate không bắt buộc.
- **Countdown**: format `hh:mm:ss`, `tabular-nums`, tick 1s, hộp nền `#212121` chữ `--c-accent`.
- **Search dropdown**: mở khi focus input (prototype demo ở state mở tĩnh); đóng khi blur/click-outside.
- **Tabs PDP**: click đổi pane; active = chữ primary + underline 3px.
- **Badge**: giảm % luôn nền đặc chữ trắng (primary trên card, danger trên PDP); badge phụ tint nền + viền (§1.6) — không dùng badge đặc cho Chính hãng/Freeship.
- **Giá**: luôn `--c-danger` 800, format VND `1.290.000 ₫` (dấu chấm ngăn nghìn, khoảng trắng trước ₫) — khớp primitive `Price` vi-VN.

## 4. Out of design scope (Dev tự quyết)

- Transition duration hoàn chỉnh (chỉ khuyến nghị .12s cho hover lift, .45s cho carousel — phần còn lại tự chọn nhất quán).
- Logic autocomplete (debounce, API suggest) — chỉ visual pattern.
- Responsive dưới 900px chi tiết hơn mức cơ bản trong prototype (grid 2 cột, sidebar xuống dưới, admin sidebar → scroll-x ngang).
- Icon set cụ thể (prototype dùng SVG stroke 1.8px + emoji placeholder) — Dev chọn icon library, giữ stroke-weight 1.8 và kích thước 18-22px.
- Ảnh thật thay emoji (SF-4 dùng ảnh upload MinIO) — giữ gradient placeholder làm fallback.
- Dark mode (SF-15) — tokens hiện chỉ ánh xạ 2 theme sáng.
- Skeleton/EmptyState/Toast primitives — chưa xuất hiện trong prototype; Dev dựng theo cùng ngôn ngữ (tint + border + radius-md).

## 5. Ghi chú protocol

- Hướng B, C không dùng — lưu record `/tmp/fi310-design-312/{b,c}.html` (artifact B: https://share.onorca.dev/a/uA-51_VnQSdR · C: https://share.onorca.dev/a/6Y6kYwwbwGjj).
- Hướng này là GLOBAL choice: các SF sau (4/6/7/8/9…) implement mọi screen theo direction này.
- Tokens doc này là NGUỒN cho `frontend/packages/ui-kit/src/styles/tokens.css` — task-executor map đúng §1, không tự đổi hex.
