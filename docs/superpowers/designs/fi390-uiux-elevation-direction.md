# FI-390 UI/UX Elevation v2 — Design Direction — FINAL

> **USER ĐÃ CHỌN: Hướng B — "Chợ Sôi Động 2.0" (Kinetic Marketplace)** (gate designer resolved · 2026-09-08)
> Prototype: https://share.onorca.dev/a/gC6MhrOKNmS_
> File nguồn (tự chứa, mở trực tiếp): `docs/superpowers/designs/fi390-drafts/huong-b.html`
> Record 2 hướng không dùng: A "Lưới Kỷ Luật" https://share.onorca.dev/a/OW1ZkOhkx5lU (`huong-a.html`) · C "Phòng Trưng Bày" https://share.onorca.dev/a/7m7fqFivQ8L0 (`huong-c.html`)
> Đối tượng hand-off: SF-1 (tokens v2 + primitives) → SF-2…SF-5 inherit (Design: none) → SF-6 sweep.
> Nền tảng: kế thừa nguyên văn FI-310 "Chợ Sôi Động" (`fi310-storefront-direction.md`) — mọi hex/color token FI-310 GIỮ NGUYÊN; elevation bổ sung motion/depth/density/state.
> Mọi giá trị dưới đây trích từ prototype B, không suy đoán.

---

## 1. Tokens

### 1.1 Giữ nguyên (không đổi value — Q1)

Toàn bộ color/spacing/radius/typography hiện có trong `frontend/packages/ui-kit/src/styles/tokens.css`:
`--c-primary #F53D2D` · `--c-primary-hover #CB1B00` · `--c-bg #F5F5F5` · `--c-surface #FFFFFF` ·
`--c-text #212121` · `--c-text-muted #757575` · `--c-border #EEEEEE` · `--c-danger #D0011B` ·
`--c-warning #FE9C08` · `--c-success #26AA99` · `--c-accent #FFD839` · `--c-on-accent #212121` ·
`--c-link` · tint `--tint-*` · wash `--wash-*` · `--star-track` · 6 cặp `--pill-*-bg/text` ·
`--space-1..8` · `--radius-sm 2 / md 4 / lg 8 / full` · `--text-xs..3xl` · `--font-sans`.
Block `[data-theme='dark']` hiện có: GIỮ NGUYÊN toàn bộ value (dark dùng đúng bảng này).

### 1.2 Token MỚI — motion (thêm additive vào tokens v2)

```css
/* Motion durations — nhịp B */
--dur-fast: 140ms;      /* hover nhỏ: màu chữ/icon, border-color, arrow rotate */
--dur-base: 180ms;      /* hover mặc định: lift, shadow cascade, nút */
--dur-slow: 260ms;      /* drawer, backdrop, toast, reveal */
--dur-carousel: 450ms;  /* hero track translateX */
--dur-kb: 16s;          /* ken-burns mỗi slide */
--dur-shimmer: 1.3s;    /* skeleton */
--dur-float: 6s;        /* (chỉ home hero art, optional) */

/* Easing — chữ ký motion của hướng B */
--ease-out: cubic-bezier(.22, .61, .36, 1);      /* mặc định mọi transition */
--ease-pop: cubic-bezier(.34, 1.4, .4, 1);       /* toast, icon press, stepper dot — overshoot nhẹ */
--ease-drawer: cubic-bezier(.32, .72, .3, 1.08); /* drawer trượt — overshoot cuối */

/* Z-index scale */
--z-header: 100;
--z-dropdown: 200;
--z-drawer: 300;
--z-toast: 400;

/* Breakpoints (CSS mq + JS) — prototype dùng 960; SF-2 bổ nghĩa <600 theo spec §4.4 */
--bp-sm: 600px;
--bp-md: 960px;
--bp-lg: 1240px; /* container 1240 + padding 16 */
```

(Ghi chú: prototype khai tạm tên `--motion-fast/base/slow` — map 1-1 sang `--dur-*` ở trên khi dán vào tokens.css.)

### 1.3 Token MỚI — gradient + shadow CTA (dẫn xuất hex FI-310 §1.8 — additive, không hex mới ngoài family)

```css
--grad-cta: linear-gradient(90deg, #F53D2D, #FF7A45);        /* nút Mua ngay/Đặt hàng (FI-310 §3) */
--grad-flash: linear-gradient(180deg, #FFD839, #FFB800);     /* flash section (FI-310 §2.2) */
--grad-hero-1: linear-gradient(120deg, #F53D2D, #FF7A45);    /* hero slide 1 */
--grad-hero-2: linear-gradient(120deg, #CB1B00, #F53D2D);    /* hero slide 2 */
--grad-hero-3: linear-gradient(120deg, #FF512F, #DD2476);    /* hero slide 3 */
--grad-cat-dientu:    linear-gradient(140deg, #EAF3FF, #D9E9FF);
--grad-cat-thoitrang: linear-gradient(140deg, #FFEEE8, #FFDFD2);
--grad-cat-nhacua:    linear-gradient(140deg, #E9F7EE, #D8F0E1);
--grad-cat-sach:      linear-gradient(140deg, #FFF7DC, #FFEFBC);
--grad-cat-lamdep:    linear-gradient(140deg, #F4EBFC, #EBDCF8);
/* Swatch variant PDP (FI-310 §1.8) */
--grad-swatch-den:   linear-gradient(140deg, #4a4a4a, #1a1a1a);
--grad-swatch-trang: linear-gradient(140deg, #ffffff, #ededed);
--grad-swatch-navy:  linear-gradient(140deg, #33507f, #22355c);
--grad-swatch-be:    linear-gradient(140deg, #e6d6b8, #d9c7a7);
/* Shadow CTA (duy nhất 2 chỗ rgba primary được phép — qua token) */
--shadow-cta: 0 4px 12px rgba(245, 61, 45, .35);
--shadow-cta-hover: 0 6px 18px rgba(245, 61, 45, .45);
```

### 1.4 Dark mode — 2 thay đổi value CÓ CHỦ ĐÍCH (cập nhật token-regression + §1 doc CÙNG commit, §4.2)

```css
[data-theme='dark'] {
  /* thêm: shadow đậm hơn cho nền tối (prototype B demo) */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, .4);
  --shadow-2: 0 2px 8px rgba(0, 0, 0, .5);
  --shadow-3: 0 8px 24px rgba(0, 0, 0, .6);
}
```

### 1.5 Theme tổ hợp admin × dark — 4-trạng-thái (§4.7)

Thêm giá trị theme thứ 4 vào tokens v2 (prototype demo ở khung 5). Khuyến nghị giữ attribute đơn,
giá trị `'admin-dark'` là hợp lệ (block cuối file, cùng specificity pattern admin):

```css
[data-theme='admin-dark'] {
  --c-bg: #0F0F0F;              /* hex MỚI duy nhất của elevation — nền admin tối phân tầng với surface #1E1E1E */
  --c-surface: #1E1E1E;  --c-text: #F5F5F5;  --c-text-muted: #9E9E9E;  --c-border: #2C2C2C;
  --c-primary: #F53D2D;  --c-primary-hover: #FF6B54;  --c-link: #FF6B54;  --c-focus: #FF6B54;
  --c-danger: #FF5A5A;   --c-warning: #FE9C08;  --c-success: #2FD5BE;
  --c-accent: #FFD839;   --c-on-accent: #212121;
  /* tint/pill/wash/star = copy đúng block dark hiện có */
  --tint-primary-bg: #3A1B17;  --tint-primary-text: #FF8A73;  --tint-primary-border: #5C2A22;
  --tint-success-bg: #11302B;  --tint-success-text: #4CD0BC;  --tint-success-border: #1F5148;
  --tint-new-bg: #33270E;      --tint-new-text: #F2C14E;      --tint-new-border: #57431A;
  --wash-price-bg: #2A1512;    --wash-hover: #262626;         --star-track: #3D3D3D;
  /* 6 pill = copy đúng block dark hiện có */
  /* shadow = bộ dark §1.4 */
}
```

Token-regression test: THÊM block/var mới = an toàn; §1.4 đổi 3 shadow value = phải cập nhật test + doc cùng commit.

### 1.6 Font

Be Vietnam Pro weights 400;500;600;700;800 subset vietnamese+latin, `display: swap`, self-host
(Google Fonts OFL) cho 4 app Vite + cả 2 biên MF; storefront-web đã có qua `next/font`.
`--font-sans` giữ nguyên giá trị hiện có.

---

## 2. Structure (5 khung — anatomy chính xác từ prototype B)

Container: `max-width 1240px`, `padding 0 16px`.

### 2.1 Header storefront — 2 hàng (ngôn ngữ FI-310, polish elevation)

- **Hàng 1** (`padding 12px 16px`, gap 24): logo wordmark `26px/800` primary + chấm đỏ 9px + ticker
  `9px/800` tracking .08em nền `--tint-primary-bg` chữ `--tint-primary-text` padding 3×7 → **search bar**
  `flex 1 1 auto; max-width 760px; margin 0 auto`: viền **2px solid `--c-primary`** (luôn sẵn, FI-310),
  input padding 9×12 font 14, nút "Tìm kiếm" nền `--c-primary` trắng padding 0 22px `700`, hover
  `--c-primary-hover`; focus-within = ring `0 0 0 4px --tint-primary-bg` + `--shadow-2` → actions:
  icon-btn 42×42 radius-md (account/wishlist/cart), hover nền `--wash-hover` + chữ `--c-link`.
- **Cart badge**: nền `--c-accent` chữ `--c-on-accent`, min 18×18, font 10.5/800, border 2px surface,
  đè góc trên-phải.
- **Hàng 2 — mini-nav** nền `--c-primary` full-width: link trắng `13px/600` padding `8px 14px`, hover
  nền `--c-primary-hover`; mục hot ("Deal sốc", "Hàng mới") màu `--c-accent`; scroll-x khi hẹp.
- `z-index: --z-header`; shadow `--shadow-1` khi sticky.
- Shell header (Q6) LẮP CÙNG anatomy này vào HeaderSlots: logo + search + mini-nav + cart-badge +
  account menu + theme-toggle — không viết logic auth/cart mới.

### 2.2 Home

1. **Hero carousel**: cao **380px**, `--radius-lg`, `--shadow-2`, 3 slide gradient `--grad-hero-1/2/3`;
   slide padding ngang 8%; mỗi slide có lớp ken-burns (`inset:-4%`, scale 1→1.09, `--dur-kb`
   ease-in-out alternate) + 2 vòng glow alpha trắng/đen; kicker `13px/700` tracking .3em uppercase;
   h2 `44px/800` lh 1.12; nút "MUA NGAY" nền `--c-accent` chữ `--c-on-accent` `800` 15px padding
   12×32 `--radius-md` `--shadow-2`, hover translateY(−2px) scale(1.02) + `--shadow-3`; ribbon "-38%"
   nền surface chữ primary `18px/800` rotate −8deg top 26 right 8%; arrows tròn 38px nền trắng .92;
   dots 9px (active rộng 22px bo 6px); track `translateX` `--dur-carousel` ease; auto-rotate 6s
   (pause on hover + nút pause a11y + dừng hẳn khi reduced-motion).
2. **Flash deal**: khối `--grad-flash` `--radius-lg` padding 16 `--shadow-2`; h3 `24px/800` uppercase
   `--c-on-accent` + icon sét `--c-primary`; **countdown** 3 hộp 36×36 nền `--c-text` chữ `--c-accent`
   `18px/800` tabular-nums tick 1s format hh:mm:ss; link "Xem tất cả" pill nền trắng .4 hover .65;
   **fcard** ngang scroll-x rộng 186px (thumb 150px): badge −% nền primary 12/800 góc trên-trái,
   tên clamp 2 dòng 13/600 cao 37, giá `--c-danger` 16/800 + gạch 12, **progress bar** 5px
   `--grad-cta` + "Đã bán 212/300" 11px muted.
3. **Danh mục**: grid 6 cột gap 12; tile gradient `--grad-cat-*` border + `--shadow-1` `--radius-lg`
   padding `16px 12px`; emoji 30px; tên 13/700; count 11 muted; hover translateY(−2px) + `--shadow-2`;
   tile "Xem thêm" border dashed shadow-none.
4. **Grid đề xuất**: 4 cột gap 12; sec-title = thanh dọc primary 5×22 + h3 `21px/800` uppercase + "Xem thêm ›" link.
5. **Product card** (dùng chung home/PLP/related/wishlist): surface + 1px border + `--radius-md` +
   `--shadow-1`; thumb cao 190px gradient danh mục emoji 52px; badge −% primary 12/800 (8,8);
   **pbadges** dưới-trái gap 5: pill 10/700 padding 2×6 — Chính hãng tint-primary · Freeship
   tint-success · Hàng mới tint-new; body padding 12: tên 13/600 clamp 2 (hover `--c-link`), giá
   17/800 `--c-danger` + gạch 12, meta stars 13px (track `--star-track` fill `--c-warning`) + count;
   **atc-mini** "＋ Thêm vào giỏ" cao 34 viền 1px primary, hover NỀN primary chữ trắng (`--dur-base`).

### 2.3 PDP buy-area

- Grid `minmax(380px, 45%) + 1fr` gap 32; breadcrumb 13px.
- **Gallery**: ảnh chính aspect 1/1 `--radius-lg` border; badge −% nền primary `18px/800` góc trên-trái;
  **zoom-lens** (Q2): lớp `radial-gradient(160px at var(--mx) var(--my), trắng .35 → transparent 70%)`
  hiện khi hover + ảnh scale **1.18** với `transform-origin` = vị trí con trỏ (mousemove set 2 var),
  transition .25s `--ease-out`; 4 thumbs 72×72 `--radius-md` border 2 transparent — active border primary.
- **Info**: h1 `23px/700/1.35` → meta (stars + link đánh giá + đã bán) → **price-block** nền
  `--wash-price-bg` border `--tint-primary-border` `--radius-md` padding `12px 16px`: giá
  `34px/800 --c-danger`, gạch 15, pill −% nền `--c-danger` trắng 14/800, note "Giá độc quyền online"
  12/600 `--tint-primary-text` margin-left auto → variant swatch 38px (active viền primary + ring 3px
  tint) + size chip min 46×38 → **qty stepper** (nút 36, input 44, cao 50) + CTA đôi cao 50 uppercase
  15/800: outline 2px primary (hover tint-bg) + solid `--grad-cta` chữ trắng `--shadow-cta` (hover
  translateY(−1px) + `--shadow-cta-hover`) + wishlist 50×50 (hover `--c-danger`) → **perks row**
  border-top dashed: icon tròn 30 nền tint-primary → stock-note 12/600 `--c-success`.
- **Buy-sticky mobile** (<600px): bar sticky bottom nền surface border-top + `--shadow-2`, 2 nút cao 44
  (outline + solid) — demo mini-viewport 390px trong prototype khung 3.

### 2.4 Cart / Checkout — Stepper 3 bước

- **Stepper**: nút tròn 34px border 2 — done: nền `--c-success` trắng "✓" · current: nền `--c-primary`
  trắng + ring `0 0 0 5px --tint-primary-bg` + scale 1.08 (`--ease-pop`) · chưa: surface border;
  connector 3px `--radius-full`, đoạn xong fill `--c-success` scaleX transition .35s.
- Grid `1fr + 380px` gap 24; panel surface border `--radius-lg` `--shadow-1` padding 24.
- Form: input cao 44 border 1.5 `--radius-sm`, focus ring 4px tint; error border `--c-danger` + msg
  11px hiện realtime; `inputmode=numeric` cho SĐT.
- **Payment cards** (bước 2): grid 2 cột — thẻ border 1.5 padding 16, hover −2px + `--shadow-1`;
  selected: border primary + nền `--tint-primary-bg` + check tròn 20px góc trên-phải.
- **Summary có ảnh** (bắt buộc theo SF-3 What): line item = ảnh vuông 56px gradient + qty badge nền
  primary (−6,−6, border 2 surface) + tên 13/600 + giá 700 phải; coupon input **border dashed** + nút
  "Áp dụng" tint; tạm tính/giảm/ship 13.5; **Tổng cộng** 26/800 `--c-danger` border-top 2px;
  nút "ĐẶT HÀNG" cao 52 `--grad-cta` `--shadow-cta` hover −2px + `--shadow-cta-hover`.
- Confirmation (SF-3): hero gradient `--grad-hero-1` thu nhỏ (kicker + h2 34/800 + CTA accent) — theo
  pattern hero §2.2.

### 2.5 Admin (theme `admin` / `admin-dark`)

- Shell grid `222px + 1fr`; sidebar: logo `17px/800` primary; group label 11px uppercase tracking
  .12em muted; nav item `14px/600` padding `10px 16px` **border-left 3px transparent** — hover
  `--wash-hover`, active: chữ `--c-link` + nền `--tint-primary-bg` + border-left `--c-primary` +
  count-badge nền primary; user block border-top.
- **KPI cards** 4 cột: label 11/700 uppercase tracking .08em muted · value `23px/800` tabular ·
  delta 12/700 `--c-success`/`--c-danger`; card surface + border + `--radius-md` + `--shadow-1`.
- **Table**: block surface border `--radius-md` `--shadow-1`; **thead sticky top 0** nền surface,
  11/700 uppercase tracking .08em muted, shadow `0 1px 0 border`; **sort cột** (client-side — Q5):
  th.sortable hover `--c-link`, mũi tên 9px, asc/desc màu primary (desc rotate 180); row hover
  `--wash-hover` `--dur-fast`; mã đơn `--c-link` 700 tabular; tiền phải 700 tabular; action link;
  **pill 6 trạng thái** đúng token `--pill-*` (11/800 ls .05 padding 3×9 full).
- **Page-size selector**: nhóm nút 3/5/8 padding 5×11 — active nền primary trắng.
- Pagination: nút 30×30 (active nền primary) — dùng primitive Pagination.
- **Skeleton**: hàng 38px `--radius-md` shimmer `--dur-shimmer` (gradient wash→border→wash
  background-size 240%, quét 120%→−120%); dùng TableSkeleton/ProductCardSkeleton composition (SF-1).

### 2.6 Mini-cart drawer (trong mfe-checkout — Drawer contract P0 của spec)

- Panel phải rộng **390px** max 92% cao full; **head nền `--c-primary`** trắng (title 18/800 + count
  13 + close hover `--c-primary-hover`); items: ảnh 64px + qty badge; **foot**: banner Freeship tint-
  success 12.5/700 + "Tạm tính" 24/800 `--c-danger` + 2 CTA cao 44 (outline 2px + solid grad).
- Backdrop `rgba(0,0,0,.45)` fade `--dur-slow`; panel `translateX(103%)→0` `--dur-slow`
  `--ease-drawer` (overshoot cuối); focus về nút close khi mở, ESC đóng, restore focus (useOverlay).
- State: ĐỌC cart hiện có qua cartApi/authStore — KHÔNG tạo nguồn cart song song (spec SF-3 P0).

---

## 3. Behavior / Motion spec

### 3.1 Shadow cascade (ngôn ngữ depth của B — state → cấp)

| State | Cấp shadow |
|---|---|
| Resting: card, fcard, KPI, tbl-block, panel | `--shadow-1` |
| Resting: hero, flash block, price-tag nổi | `--shadow-2` |
| Resting: drawer, toast, modal, popover | `--shadow-3` |
| Hover card/fcard: translateY(−3px) + shadow-1→**3** | `--dur-base` `--ease-out` |
| Hover cat tile: −2px + shadow-1→**2** | `--dur-base` |
| Hover nút thường (tbtn): −1px + shadow-1→**1 đậm hơn** (border primary) | `--dur-fast` |
| Hover CTA grad (btn-buy, cta.solid, btn-order): −1..−2px + `--shadow-cta`→`--shadow-cta-hover` | `--dur-base` |
| Search/field focus: ring tint 4px + shadow-2 | `--dur-base` |
| Press (active): scale .92 (icon) / .97-.98 (nút) | `--dur-fast` `--ease-pop` |

Quy tắc: **không bao giờ nhảy cóc 1→3 ở hover tile nhỏ** (tile thường chỉ lên 2); card sản phẩm là
điểm nhấn thương mại nên được lên 3.

### 3.2 Timing đầy đủ

- Hover/press/toast/skeleton (nền): **140–260ms** — `--dur-fast` 140 (màu, mũi tên), `--dur-base` 180
  (lift, cascade, nút), `--dur-slow` 260 (drawer/backdrop/toast/reveal) — đúng dải 120–250ms của Q2,
  260ms chỉ dùng cho overlay/reveal.
- Carousel track: `--dur-carousel` 450ms ease. Ken-burns: 16s alternate. Shimmer: 1.3s linear.
- **Toast**: nền `--c-text` chữ `--c-bg`, `--radius-full`, padding 10×18, 13/700 — mở: opacity +
  translateY(12px→0) `--dur-slow` `--ease-pop`, tự đóng 2.2s.
- **Reveal on scroll** (điểm nhấn, CHỈ home sections): translateY(18px→0) + fade .5s `--ease-out`,
  stagger **70ms/card**, IntersectionObserver threshold .12, unobserve sau khi hiện.
- Drawer: `--dur-slow` + `--ease-drawer` (overshoot 1.08 cuối đường cong).
- Stepper current: scale 1.08 + ring bằng `--ease-pop`.
- Zoom-lens gallery: transition .25s `--ease-out`, transform-origin theo chuột (chỉ transform).

### 3.3 prefers-reduced-motion — fallback TỪNG hiệu ứng (bắt buộc §4.7)

Global: `animation-duration: .01ms !important; animation-iteration-count: 1 !important;
transition-duration: .01ms !important; scroll-behavior: auto`. Cụ thể:
- Ken-burns/float: tắt hẳn (frame tĩnh đầu tiên).
- Hero auto-rotate: KHÔNG auto — chỉ bấm arrows/dots (+ nút pause luôn hiển thị khi autoplay).
- Reveal: hiện ngay trạng thái cuối (opacity 1, transform none) — không depend vào scroll.
- Drawer/toast/carousel: đổi state tức thời (không slide) — vẫn hoạt động đầy đủ.
- Shimmer skeleton: giữ màu tĩnh (không quét).

### 3.4 A11y đi kèm motion

Focus-visible outline 2px `--c-focus` offset 2 toàn cục; drawer/modal focus-trap + ESC + restore
focus (useOverlay có sẵn); stepper/tabs keyboard (primitive SF-1); carousel arrows/dots/pause đều
button thật có aria-label; icon trang trí `aria-hidden`.

---

## 4. Rule extrapolation — surfaces KHÔNG nằm trong 5 khung

Áp cùng ngôn ngữ B: **density marketplace + shadow cascade + nhịp 140/180/260 + tint badge**.

- **Coupons page**: grid card 3-4 cột dùng product-card shell (shadow-1, hover −3px shadow-3); mã
  coupon = khối border **dashed** `--radius-md` + nút "Lưu mã" cta-outline; badge hết hạn = tint-new,
  badge "Đã lưu" = tint-success; bấm copy → toast pop (không alert).
- **Search results (PLP)**: giữ nguyên layout FI-310 (sidebar filter + toolbar + grid 3 cột) — chỉ
  thay card bằng anatomy §2.2 (badge + atc-mini) và SortSelect → primitive Pagination/Select style
  token, cơ chế URL-driven GIỮ NGUYÊN (§4.6); empty state: emoji 48px muted + eyebrow + nút outline
  "Xóa bộ lọc"; loading: 6 ProductCardSkeleton shimmer.
- **Account (side-nav + orders + OrderDetail)**: side-nav = pattern admin sidebar §2.5 (border-left 3px
  active tint) bề rộng 240 icon 16; order list = card shadow-1 `--radius-md`, pill đúng 6 `--pill-*`,
  skeleton khi tải; OrderDetail timeline = chấm tròn 10px + đường 1px `--c-border`, mốc hoàn thành
  nền `--c-success`; thay 42 khối inline-style bằng token — KHÔNG thêm depth mới (giữ shadow-1).
- **Wishlist**: grid 4 cột product-card §2.2 + nút xóa icon hover `--c-danger`; empty state card
  border dashed + eyebrow "Chưa có sản phẩm yêu thích"; hover cascade chuẩn; loading = card skeleton.
- **Reviews (tab + modal)**: layout `280px + 1fr` FI-310 giữ; modal = ui-kit Modal overlay
  `rgba(0,0,0,.45)` + panel `--radius-lg` `--shadow-3`, mở bằng `--ease-pop` 260ms, focus-trap/ESC;
  sao fill `--c-warning` track `--star-track`; badge "Mua đã xác nhận" tint-success 11/700.
- **Affiliate / Loyalty**: stats = KPI pattern §2.5 (label uppercase 11 + value 23/800 tabular + delta
  xanh/đỏ); ledger = table pattern (tabular-nums, row hover wash, pill loại giao dịch tint);
  rank/tier = pill tint-primary; rút tiền CTA = `--grad-cta` + `--shadow-cta`.
- **SearchBar autocomplete (storefront + shell)**: dropdown absolute top calc(100%+4px) full-width
  surface border `--radius-md` `--shadow-2`; nhóm label 11 uppercase tracking 1px muted; item hover
  `--wash-hover` chữ `--c-link`; tag "ĐANG HOT" nền `--c-danger` — mở/đóng bằng `--dur-fast`.

---

## 5. Cấm (vi phạm = sai direction)

1. KHÔNG đổi bất kỳ hex brand/tint/pill/wash hiện có (Q1). Hex mới duy nhất được phép: `#0F0F0F`
   (`--c-bg` của `admin-dark`, §1.5) + gradient family FI-310 §1.8 đã liệt kê §1.3.
2. Màu trong CSS chỉ qua `var(--*)` — cấm hex trực tiếp; rgba primary CHỈ qua `--shadow-cta(-hover)`.
3. KHÔNG logic mới: sort/page-size/filter client-side hoặc URL-driven như hiện trạng; drawer đọc cart
   state hiện có; không server-side pagination/bulk (Q5); shell chỉ lắp components có sẵn (Q6).
4. KHÔNG thêm dependency — animation CSS-only (§4.10).
5. Motion điểm nhấn (ken-burns, reveal, zoom-lens, drawer-overshoot) CHỈ ở: home/hero, PDP gallery,
   drawer — không rải reveal vào PLP/admin/account (Q2). Mọi keyframes mới gate reduced-motion.
6. Primitive keyframes CHỈ trong `ui-kit.css`; surface keyframes (hero kb, shimmer dùng chung phải ở
   ui-kit) theo §4.4 — 4 file page.css chỉ được có surface-specific keyframes.

## 6. Out of design scope (Dev tự quyết)

- Icon set cụ thể (prototype dùng SVG stroke 1.8 + emoji placeholder) — giữ stroke 1.8, kích thước
  18–22px; emoji thay bằng Icon theo task icon-svg-set.
- Ảnh thật thay gradient/emoji placeholder — gradient là fallback bắt buộc giữ lại.
- Chi tiết responsive <600px beyond §2.3 buy-sticky (SF-2 sở hữu, tuân `--bp-sm`).
- Debounce autocomplete, auto-rotate timing thực tế (6s là đề xuất), số slide hero thật.
- Text copy marketing (kicker/slide) — placeholder tiếng Việt, SF-2 thay theo i18n keys.
