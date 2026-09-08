# SF-3 shell-checkout-elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate luồng tiền (shell header → cart → mini-cart drawer → checkout 3 bước → confirmation) lên design language B "Chợ Sôi Động 2.0" — compose primitives SF-1 + cart state hiện có, zero backend, zero fetch path mới, zero dep mới.

**Architecture:** Presentation-only quanh logic checkout đã verify-GA. Drawer mini-cart nằm TRONG mfe-checkout (contract P0 — CartBadge khu vực), đọc giỏ qua `useCart`/`cartApi` hiện có (1 nguồn cart state duy nhất). Header shell lắp components vào HeaderSlots (contract left|center|right KHÔNG đổi) — shell tự đăng ký ShellSearch + ShellMiniNav, remote giữ nguyên pattern đăng ký. i18n additive-only, anchor `checkout:`+`shell:` NGAY SAU block `auth:` cả vi+en (chống merge war SF-4/5).

**Tech Stack:** React 18 + TS, CSS thuần tokens-only (var(--*), cấm hex mới ngoài family đã duyệt), vitest (mfe-checkout — KHÔNG có @testing-library, dep freeze → test logic-level + SSR `renderToStaticMarkup` từ react-dom/server), pnpm workspace. KHÔNG thêm dependency.

**Linear Issue:** FI-393 · **Worktree:** sf-3-shell-checkout-elevation · **Đích merge:** `story/fi390-uiux-elevation` (KHÔNG main) · Merge sequence: SF-2 → **SF-3** → SF-4 → SF-5 (coordinator-owned).

**Nguồn sự thật:**
- `docs/superpowers/contexts/fi390-sf-3.md` (spec slice + ACCEPTANCE + boundary)
- `docs/superpowers/designs/fi390-uiux-elevation-direction.md` (hướng B — §2.1 header, §2.4 cart/checkout/stepper/summary, §2.6 drawer, §3.1 shadow cascade, §3.2 timing, §5 cấm)
- E2E contract (READ-ONLY — phải giữ xanh): `frontend/e2e/tests/{golden-path,cod-checkout,saga-fail}.spec.ts`

---

## 0. Root cause analysis (WHY)

### Root cause
Cart/checkout/confirmation được build ở SF-6 như harness UI chức năng (hand-roll qty stepper, stepper `role=button` không keyboard, hex cứng trong page.css, summary text-only, emoji icon) — TRƯỚC khi tồn tại design language. SF-1 (FI-391, đã merge) giờ cung cấp tokens v2 + primitives (Drawer/Stepper/QuantityStepper/Icon/IconButton/Modal/EmptyState/Skeleton) — surfaces chưa tiêu thụ. Header shell chỉ là text "ecommerce" + 3 slot trống trong khi storefront đã có header 2 hàng chuẩn FI-310.

### Current state (before)
- `Header.tsx` 54 dòng: 3 Slot trống + ShellNav text; `main.tsx` chỉ đăng ký ShellNav(left) + ThemeToggle(right).
- CartBadge: emoji 🛒, fetch riêng `fetchCart` (không qua useCart), click → /cart luôn.
- CartPage: qty stepper hand-roll (`.qty-stepper`), xóa line ngay không confirm, KHÔNG có coupon input.
- CheckoutPage: stepper hand-roll `<li role=button>` không onKeyDown; validate chỉ on-submit; không inputMode/autocomplete; shipping = label radio thô; summary text-only; không skeleton.
- ConfirmationPage: hero `✓/!` text glyph; CTA "Tiếp tục mua sắm" → `/cart`.
- page.css: `.pay-warning` 3 hex cứng #fff7e6/#ffd591/#874d00; `.stepper-item--active .stepper-num` color #fff; vài hex trong fallback var().
- i18n catalogs: checkout hard-code tiếng Việt trong JSX toàn bộ 3 page + CartBadge + ThemeToggle.

### Expected outcome
6 dòng ACCEPTANCE của context pack (header đúng tầm storefront + drawer; cart stepper/keyboard + confirm + coupon; checkout realtime validate + keyboard stepper + summary ảnh; dark mode sạch + icon SVG; confirmation CTA về trang chủ + polling nguyên vẹn; e2e subset + unit xanh).

### Constraints & hardships
- `packages/ui-kit/**`, `packages/auth/**`, `apps/mfe-account/**` (file AuthWidget), `storefront-web/**`, `contracts/**`, `backend/**` — READ-ONLY.
- KHÔNG fetch path cart mới; KHÔNG nguồn cart state thứ 2; KHÔNG đụng saga/coupon-validate backend/point cap/GA4 exactly-once/polling.
- KHÔNG sổ địa chỉ; KHÔNG key i18n ngoài `checkout.*` (+`shell.*`); KHÔNG dep mới (→ không RTL trong mfe-checkout); pnpm-lock freeze.
- E2E selector contract (specs READ-ONLY phải xanh — danh mục đầy đủ §3.5).

### High-level strategy
i18n keys trước (mọi component tiêu thụ) → shell header → mfe-checkout (drawer → cart → coupon → checkout → confirmation) → css sweep tổng → tests+walkthrough+e2e. Tuần tự (cùng file CheckoutPage/page.css nhiều task). Mỗi task = 1 atomic commit = rollback unit.

## 1. Problem
Luồng tiền demo "guest vào cart → drawer preview → checkout 3 bước → confirmation CTA về trang chủ" còn rớt cấp so storefront: thiếu mini-cart, control hand-roll kém a11y, dark mode vỡ ô màu, header trống trải — phá trải nghiệm thương mại end-to-end của epic FI-390.

## 2. Scope
- **In:** 12 mục spec slice context pack (header slots elevation, mini-cart drawer in-mfe-checkout, CartPage stepper/confirm/coupon/polish, CheckoutPage Stepper primitive/realtime form/shipping cards/summary ảnh/skeleton, dark-mode hex sweep, ConfirmationPage hero+CTA home, icon swap, page.css motion, i18n checkout.*/shell.*, walkthrough + e2e subset + unit xanh).
- **Out:** ui-kit/auth/mfe-account/storefront-web/contracts/backend files; sổ địa chỉ cascading; FULL e2e (SF-6); server-side gì mới; merge main; logic saga/coupon-validate/point-cap/GA4/polling.
- **Success criteria:** từng dòng ACCEPTANCE §context pack verify được user-visible qua browser walkthrough 3 tầng (DOM → screenshot → flow).

## 3. Touch map

### 3.1 Files sửa/tạo
```
frontend/packages/i18n/src/catalogs/vi.ts          (chèn checkout: + shell: sau auth:)
frontend/packages/i18n/src/catalogs/en.ts          (song song vi)
frontend/apps/shell/src/header/Header.tsx           (layout 2 hàng, Slot giữ nguyên contract)
frontend/apps/shell/src/header/ShellSearch.tsx      (MỚI — form GET /search?q=, đơn giản hóa từ storefront SearchBar)
frontend/apps/shell/src/header/ShellMiniNav.tsx     (MỚI — 3 link /c/dien-tu variants như SF-2)
frontend/apps/shell/src/header.css                  (MỚI — anatomy §2.1: 2 hàng, search viền 2px primary, mini-nav nền primary)
frontend/apps/shell/src/main.tsx                    (register ShellSearch center + ShellMiniNav + import css)
frontend/apps/shell/src/ThemeToggle.tsx             (Icon sun/moon + i18n shell.*)
frontend/apps/mfe-checkout/src/CartBadge.tsx        (Icon cart + mở drawer thay navigate cứng)
frontend/apps/mfe-checkout/src/MiniCartDrawer.tsx   (MỚI — ui-kit Drawer + useCart)
frontend/apps/mfe-checkout/src/pages/CartPage.tsx   (QuantityStepper + Modal confirm + coupon + polish)
frontend/apps/mfe-checkout/src/pages/CheckoutPage.tsx (Stepper primitive + realtime + shipping cards + summary ảnh + skeleton + auto-apply coupon)
frontend/apps/mfe-checkout/src/pages/ConfirmationPage.tsx (hero SVG + CTA '/')
frontend/apps/mfe-checkout/src/page.css             (hex sweep + motion + keyframes surface + drawer/shipping-card/summary-img styles)
```

### 3.2 Env mới (1 var, Vite bake VITE_*)
- `VITE_STOREFRONT_URL` (shell only) — fallback `http://localhost:3000`. Mirror convention `NEXT_PUBLIC_SHELL_URL` của storefront `lib/site.ts:16`. ShellSearch + ShellMiniNav + logo trỏ storefront origin qua `<a>` thật (cross-origin — KHÔNG SPA navigate).

### 3.3 Cross-origin / MF notes
- Drawer portal (createPortal → document.body) chạy dưới shell: React singleton đã pin `window.__shellReact__`, ui-kit là shared dep — browser-verify bắt buộc (Tier 3 flow).
- page.css của mfe-checkout đã import ở cả main.tsx (standalone) lẫn bootstrap.tsx (MF) — thêm css mới vào cùng file, không import point mới.
- HeaderSlots: shell thêm đăng ký từ main.tsx (pattern `HeaderSlots.register('center','shell-search',ShellSearch)`) — KHÔNG đổi HeaderSlots.ts.

### 3.4 Regression candidates
- CartBadge listeners (event + authStore subscribe) — giữ nguyên logic refresh, chỉ đổi render.
- Guest gate checkout / cart guest read (cookie port-agnostic) — không đụng.
- `.pay-panel` / `.pay-error` / `.coupon-applied` classes — e2e truy cập trực tiếp.
- GA4 purchase exactly-once + polling ConfirmationPage — KHÔNG đụng useEffect polling/gtag.

### 3.5 E2E selector contract (BẢO TOÀN — specs READ-ONLY)
| Selector | Nguồn spec | Ghi chú |
|---|---|---|
| `getByLabel('Họ tên người nhận'|'Số điện thoại'|'Số nhà + đường'|'Phường/xã'|'Quận/huyện'|'Tỉnh/thành phố')` | golden/cod/saga | label step-1 GIỮ NGUYÊN CHỮ (i18n vi value đúng chuỗi này) |
| `getByRole('button', {name: /Tiếp tục — chọn vận chuyển/})` | cả 3 | giữ text nút |
| `getByRole('button', {name: /Tiếp tục — thanh toán/})` | cả 3 | giữ text nút |
| `getByLabel('Mã giảm giá')` + `/Áp dụng/` + `.coupon-applied` chứa code | golden/saga | coupon step-3 giữ |
| `/Kiểm tra & tạo đơn/`, `/Đặt hàng COD/` | golden/saga/cod | giữ |
| `.pay-panel iframe`, `.pay-error`, `data-testid: payment-method-{stripe,cod}, cod-note` | cả 3 | giữ class/testid (load-bearing cho subset specs) |
| `data-testid: place-order-btn, order-status, data-status-code, pending-order-id, summary-points, cart-badge` | KHÔNG nằm trong 3 spec subset (grep-verified — critic P2) | vẫn GIỮ cho SF-6 e2e-full + walkthrough selectors |

## 4. Design

- **Approach (đã chọn — context pack chốt):** compose-only. Drawer = ui-kit Drawer; confirm delete = ui-kit Modal; qty = QuantityStepper; bước = Stepper; icon = Icon. Coupon carry = `sessionStorage['ecommerce.coupon']` (precedent `ecommerce.last_order`); CheckoutPage auto-validate on mount, fail → hiện lỗi hiền (không crash). Shell cross-link = env `VITE_STOREFRONT_URL`.
- **Alternatives loại:** cart store mới (P0 cấm); drawer ở shell (P0); query-param carry (lộ code trên URL/history, dễ mất qua pushState); modal confirm bằng window.confirm (vỡ design language).
- **Edge cases:** drawer cart loading → skeleton rows; cart null/0 → empty state + CTA xem giỏ; unavailable item trong drawer → tint + không cộng subtotal (như CartPage); coupon hết hạn/invalid lúc auto-apply → `couponError` hiển thị, không chặn; qty input gõ dở → QuantityStepper đã guard NaN; drawer mở khi guest (read guest cart — merge-on-login giữ nguyên); step quay lại bằng Stepper chỉ cho step < current (primitive disable future — đúng semantics cũ); reduced-motion: drawer/keyframes qua global reduced-motion của SF-1 (tokens ui-kit.css đã có).
- **Non-functional:** a11y — Stepper/QuantityStepper keyboard có sẵn, drawer focus-trap/ESC/restore qua useOverlay, autocomplete attr chuẩn, inputMode tel; i18n — vi+en song song anchor `auth:`; perf — Drawer render-on-open (portal khi open), skeleton summary; security — không input mới ngoài coupon (validate server-authoritative), React escape mặc định, không dangerouslySetInnerHTML; dark mode — mọi màu qua var(--*), tint-new cho pay-warning.

## 5. Implementation outline

**Execution order (11 tasks; tuần tự — CheckoutPage/page.css/shared catalogs đụng nhiều):**

| # | Bracket task (mapping) | Files chính |
|---|---|---|
| 1 | i18n-checkout-hardcode-to-keys (phần catalogs) | catalogs vi/en |
| 2 | shell-header-slots-logo-search-cart-account-mininav + cartbadge-themetoggle-icon-swap (nửa ThemeToggle) | Header.tsx, ShellSearch.tsx*, ShellMiniNav.tsx*, header.css*, main.tsx, ThemeToggle.tsx |
| 3 | mini-cart-drawer-in-mfe-checkout-existing-cart-state + cartbadge-themetoggle-icon-swap (nửa CartBadge) | CartBadge.tsx, MiniCartDrawer.tsx* |
| 4 | cartpage-quantitystepper-line-polish-confirm-delete | CartPage.tsx |
| 5 | coupon-in-cart-carry-to-checkout (exit riêng: áp cart → checkout vẫn áp) | CartPage.tsx, CheckoutPage.tsx |
| 6 | checkoutpage-stepper-primitive-keyboard | CheckoutPage.tsx |
| 7 | checkout-step1-form-ux-realtime-inputmode-no-addressbook | CheckoutPage.tsx |
| 8 | checkout-step23-shipping-cards-payment-summary-images | CheckoutPage.tsx |
| 9 | confirmation-hero-cta-home-timeline-polish | ConfirmationPage.tsx |
| 10 | pay-warning-hex-tokenize-dark-fix + page-css-elevation-motion-tokens-skeleton-summary | page.css (2 app) |
| 11 | walkthrough-tests-green | tests + browser + e2e subset |

(* = file mới)

**Key design values (từ direction — KHÔNG sáng tạo thêm):**
- Header: hàng 1 `padding 12px 16px gap 24` — logo wordmark `26px/800` primary + chấm đỏ 9px; search `flex 1 1 auto max-width 760px margin auto` viền `2px solid --c-primary`, nút "Tìm kiếm" nền primary trắng `700`; actions icon-btn 42×42 radius-md hover wash-hover; cart badge accent `--c-accent`/`--c-on-accent` min 18×18 border 2px surface. Hàng 2 mini-nav nền `--c-primary` full-width, link trắng `13px/600 padding 8px 14px`, hover primary-hover, mục hot `--c-accent`; `z-index: var(--z-header)`; sticky + shadow-1.
- Drawer: panel phải `390px` max `92vh`; head nền primary trắng; items ảnh 64px + qty badge; foot banner Freeship tint-success + "Tạm tính" `24/800 --c-danger` + 2 CTA cao 44 (outline 2px + solid `--grad-cta` + `--shadow-cta`). Backdrop rgba(0,0,0,.45) — đã có trong uk-overlay (verify, không override nếu đã đúng).
- Stepper primitive: `steps=[Địa chỉ, Vận chuyển, Thanh toán]`, `current=step-1`, `onStepClick=(i)=>setStep(i+1)` chỉ khi i<current (primitive tự disable future).
- Shipping card: border 1.5 padding 16, hover −2px + shadow-1; selected: border primary + nền tint-primary-bg + check tròn 20px góc trên-phải.
- Summary line item: ảnh vuông 56px + qty badge nền primary (−6,−6, border 2 surface) + tên 13/600 + giá 700 phải; coupon input border dashed + nút "Áp dụng" tint; Tổng `26/800 --c-danger` border-top 2px; nút đặt `--grad-cta` cao 52 `--shadow-cta`.
- Confirmation hero: gradient `--grad-hero-1`, kicker + h2 + CTA accent; icon `Icon check/alert` SVG trong vòng tròn.
- Motion: hover/press 140–260ms qua `--dur-*`/`--ease-*`; page.css chỉ surface keyframes (shimmer có sẵn ui-kit — KHÔNG copy).

**Testing strategy:**
- Unit (mỗi task): `cd frontend/apps/mfe-checkout && pnpm test` (vitest) — logic tests (coupon carry key read/write/invalid, validate mapping, format) + SSR smoke `renderToStaticMarkup` cho MiniCartDrawer (initI18n + provider, Drawer closed → null) — KHÔNG RTL (dep freeze). Shell: `pnpm lint` (tsc) + existing shell tests nếu có.
- Packages: `cd frontend/packages/i18n && pnpm vitest run` sau Task 1.
- Browser (Rule 0 — 3 tầng): alt-ports rig nếu port war (shell 5273, checkout 5275, storefront 3300, `REMOTE_*_URL` env; `curl -6` verify — vite bind ::1). Walkthrough: guest→cart→drawer→checkout (3 bước, guest gate)→login→checkout hết→confirmation→CTA về `/`; dark mode toàn flow; screenshot mỗi màn; DOM eval đo (stepper aria-current, inputMode attr, summary img) + screenshot so direction §2.1/§2.4/§2.6.
- E2E subset (Task 11): golden-path, cod-checkout, saga-fail XANH trên stack sống (make dev hoặc isolated rig, port base +100 nếu war). Serial, retries theo config.

## 6. Risks & unknowns
- **Must verify:** Drawer portal qua MF boundary (Task 3 xong → browser smoke ngay); Stepper primitive ↔ e2e không reference `.stepper-item` (đã grep — specs KHÔNG dùng); label i18n vi phải exact chuỗi e2e (Task 1 truyền chuỗi đó vào catalogs); sessionStorage coupon đọc được cả standalone lẫn shell-mounted (same-origin — OK).
- **Unverified assumptions (giảm thiểu):** `uk-overlay` backdrop đã rgba(0,0,0,.45) (đọc ui-kit.css Task 3 trước khi override); QuantityStepper input width 44px khớp layout cart line (css mới `.uk-qty` đã có ở ui-kit — chỉ cần mount); shell chạy được khi storefront URL env chưa set (fallback :3000 chỉ là href — không fetch).
- **Port war** khi walkthrough/e2e → recipe alt-ports + lsof trước; **docker chết** → mock-gateway recipe cho e2e FE-only; saga-fail/golden-path cần backend thật — nếu stack chết: nói THẬT kết quả (không fake xanh).

---

## Tasks

### Task 1: i18n catalogs — `checkout.*` + `shell.*` (anchor sau `auth:`)

**Files:** `frontend/packages/i18n/src/catalogs/vi.ts`, `frontend/packages/i18n/src/catalogs/en.ts`

- [x] **Step 1:** Chèn block `checkout:` NGAY SAU đóng block `auth:` (vi: sau dòng `},` của auth — dòng ~20; en: ~18) — CẢ HAI file cùng vị trí tương đối. **P0 critic: MỘT block `checkout:` duy nhất — mọi nhóm lồng trong nó (`checkout.cart.*`, `checkout.confirmation.*`, `checkout.drawer.*`) — KHÔNG tạo top-level namespace khác (boundary: chỉ `checkout.*` + `shell.*`).** Keys tối thiểu (vi value = CHUẨN e2e §3.5, en song song):
  - `checkout`: `title` (Thanh toán), `stepper.address|shipping|payment` (Địa chỉ/Vận chuyển/Thanh toán), `step1.title` (Địa chỉ nhận hàng), fields `fullName|phone|line1|ward|district|city` + `.*.label` (CHUẨN e2e: 'Họ tên người nhận','Số điện thoại','Số nhà + đường','Phường/xã','Quận/huyện','Tỉnh/thành phố') + `.*.placeholder` + `.*.error` (5 message validate hiện có), `continueShipping` (Tiếp tục — chọn vận chuyển), `continuePayment` (Tiếp tục — thanh toán), `backAddress` (← Quay lại địa chỉ), `backShipping` (← Quay lại vận chuyển), `step2.title` (Phương thức vận chuyển), `eta` (Dự kiến {{days}} ngày), `ghnNote`, `flatNote`, `coupon.title/label` (Mã giảm giá), `coupon.apply` (Áp dụng), `coupon.checking` (Đang kiểm tra…), `coupon.applied` (giảm {{amount}}), `coupon.remove` (Gỡ), `coupon.invalid`, `points.*` (title/label ngắn gọn 1 dòng/use/remove/none/noPoints/notEligible), `payment.title` (Thanh toán), `payment.stripe` (Thẻ quốc tế (Stripe)), `payment.cod` (COD — Thanh toán khi nhận hàng), `codNote`, `payUnavailable.*` (prefix + suffix — chuỗi chứa JSX link/code tách 2-3 key ghép lại, KHÔNG nhồi JSX vào catalog), `placeOrder.card` (Kiểm tra & tạo đơn — {{total}}), `placeOrder.cod` (Đặt hàng COD — {{total}}), `payingCard`, `payByCard`, `summary.*` (title Đơn hàng, subtotal Tạm tính, discount Giảm giá, points ({{points}}), shipping Phí vận chuyển (phí tiêu chuẩn), total Tổng cộng, shipTo Địa chỉ:), `empty.title/description/back`, `guestGate.*` (prefix + ctaLink + middle — ghép JSX), `noAvailableItems`, `loadingFee`, `feeLoadFail`
  - `checkout.cart`: `titleCount` (Giỏ hàng ({{count}} sản phẩm)), `line.removeFromCart` (Xóa), `line.total` (Thành tiền), `removeConfirm.title/description/cancel/confirm` (Xóa sản phẩm/Bỏ {{name}} khỏi giỏ?/Giữ lại/Xóa), `summary.title` (Thông tin đơn hàng), `summary.available` (Tạm tính ({{count}} sản phẩm khả dụng)), `summary.note`, `checkout` (Thanh toán), `empty.title/description/home` (Giỏ hàng trống/…/Về trang chủ), `noAvailable` (Không có sản phẩm khả dụng để thanh toán.), coupon block REUSE `checkout.coupon.*`
  - `checkout.confirmation`: `hero.ok` (Cảm ơn bạn đã mua hàng!), `hero.fail` (Rất tiếc, đơn hàng chưa thành công), `received` (Đơn hàng {{id}} đã được ghi nhận.), `ctaHome` (Tiếp tục mua sắm), `myOrders` (Xem Đơn hàng của tôi), `failedNote`/`cancelledNote`, `emailNote`, `notFound.title/description` (Không tìm thấy đơn hàng/…), status labels `status.CONFIRMED|SHIPPED|DELIVERED|PENDING|PAID|CANCELLED|FAILED`, `detail` (Chi tiết đơn), `pollError`, `kicker` (ĐƠN HÀNG)
  - `checkout.drawer`: `title` (Giỏ hàng của bạn), `empty` (Chưa có sản phẩm trong giỏ), `continueShopping` (Tiếp tục mua sắm), `viewCart` (Xem giỏ hàng), `checkout` (Thanh toán), `subtotal` (Tạm tính), `freeship` (Miễn phí vận chuyển cho đơn từ {{amount}}), `unavailable` (Không còn khả dụng), `close` (Đóng)
- [x] **Step 2:** Block `shell:` ngay SAU block `checkout:` (cùng anchor vùng): `shell`: `search.placeholder` (Tìm sản phẩm, thương hiệu...), `search.submit` (Tìm kiếm), `mininav.categories` (Danh mục), `mininav.new` (Hàng mới), `mininav.best` (Bán chạy), `theme.toDark` (Chuyển giao diện tối), `theme.toLight` (Chuyển giao diện sáng), `theme.dark` (Tối), `theme.light` (Sáng), `cart.aria` (Giỏ hàng — {{count}} sản phẩm)
- [x] **Step 3:** vi+en SONG SONG (mỗi key có ở cả 2). Verify: `cd frontend/packages/i18n && pnpm vitest run` XANH.
- [x] **Step 4:** Commit `feat(i18n): checkout.* + shell.* catalogs — anchor sau auth: cả vi/en (FI-393 T1)`.

### Task 2: Shell header elevation — 2 hàng + ShellSearch + ShellMiniNav + ThemeToggle icon

**Files:** `Header.tsx`, `ShellSearch.tsx` (mới), `ShellMiniNav.tsx` (mới), `header.css` (mới), `main.tsx`, `ThemeToggle.tsx`

Ghi chú critic-P2: Slot wrapper `[data-slot='center']` hiện không grow — header.css thêm rule `[data-slot='center'] { flex: 1 1 auto; justify-content: center; }` để search chiếm giữa. Env helper: `sfUrl()` (shell) và `storefrontUrl()` (mfe-checkout T4) CÙNG env `VITE_STOREFRONT_URL`, CÙNG fallback `http://localhost:3000`.

- [x] **Step 1:** `ShellSearch.tsx` — form GET đơn giản hóa (không suggest): `<form role="search" action={`${sfUrl()}/search`} method="get">` + input `name="q"` type="search" + button submit "Tìm kiếm" — native GET = full navigation tới storefront (cross-origin đúng chỗ). `sfUrl()` = `import.meta.env.VITE_STOREFRONT_URL ?? 'http://localhost:3000'` (helper nhỏ trong ShellSearch export). KHÔNG fetch suggest (đơn giản hóa theo spec).
- [x] **Step 2:** `ShellMiniNav.tsx` — 3 link như SF-2: Danh mục → `${sfUrl()}/c/dien-tu`, Hàng mới (accent) → `${sfUrl()}/c/dien-tu?sort=newest`, Bán chạy (accent) → `${sfUrl()}/c/dien-tu?sort=rating`; `<nav aria-label>`; target cùng tab.
- [x] **Step 3:** `Header.tsx` — giữ Slot components NGUYÊN (registry contract): Row1 `<div className="shell-header__row1">` = Slot(left) + Slot(center) + Slot(right); Row2 `<div className="shell-header__row2">` = Slot 'left' riêng? — KHÔNG: mini-nav là shell-owned render TRỰC TIẾP `<ShellMiniNav/>` trong row2 (không qua registry — nó không phải remote widget). Header sticky top + `z-index var(--z-header)` + shadow-1. ShellNav (left) đổi thành logo wordmark: `ecommerce` 26px/800 primary + chấm đỏ 9px (::after) — click về `/` (Link shell).
- [x] **Step 4:** `main.tsx` — `HeaderSlots.register('center','shell-search',ShellSearch)`; import `./header.css`. (ShellNav/ThemeToggle đã đăng ký sẵn.)
- [x] **Step 5:** `header.css` — anatomy §2.1: row1 padding 12/16 gap 24 flex; search wrap flex-1 max-760 margin auto, viền 2px primary radius-sm, input padding 9×12 font 14, button nền primary trắng padding 0 22px 700 hover primary-hover, focus-within ring `0 0 0 4px var(--tint-primary-bg)` + shadow-2; slot right icon-btn 42×42 (áp cho nút ThemeToggle/cart qua class); row2 nền primary, link 13/600 trắng padding 8×14 hover primary-hover, accent `--c-accent`; container 1240 padding 0 16. Motion `--dur-fast/base`. Tokens-only.
- [x] **Step 6:** `ThemeToggle.tsx` — emoji ☀️/🌙 → `<Icon name={dark?'sun':'moon'}/>`; text Sáng/Tối → `t('shell.theme.dark'|'shell.theme.light')`; aria-label/title → `t('shell.theme.toLight'|'shell.theme.toDark')`. Style icon-btn 42×42 theo header.css class.
- [x] **Step 7:** Verify: `pnpm -C frontend/apps/shell lint` (tsc) XANH; browser smoke standalone shell (header 2 hàng render, search submit điều hướng đúng storefront origin).
- [x] **Step 8:** Commit `feat(shell): header 2 hàng — logo/search/mininav slots + ThemeToggle Icon (FI-393 T2)`.

### Task 3: Mini-cart drawer trong mfe-checkout + CartBadge icon

**Files:** `CartBadge.tsx`, `MiniCartDrawer.tsx` (mới), `page.css` (block drawer — declared, không drive-by)

- [x] **Step 1:** Override instance drawer trong page.css (READ-ONLY ui-kit — override qua hook class có sẵn, đã verify deviate): `.uk-overlay--drawer { background: rgba(0,0,0,.45); animation: --dur-slow }`, `.uk-drawer { width: min(390px, 92vw); animation-duration: var(--dur-slow); animation-timing-function: var(--ease-drawer); }` (scope bằng wrapper class `.mini-cart` của riêng drawer này để không đụng Modal overlay), `.mini-cart .uk-drawer__header { background: var(--c-primary); color: var(--c-surface); }` + close hover primary-hover. Reduced-motion: global ui-kit đã chặn — không duplicate.
- [x] **Step 2:** `MiniCartDrawer.tsx` — component nhận `{open, onClose}`; `useCart()` đọc state hiện có (KHÔNG fetch mới — hook đã listen event + auth). Render: Drawer `side="right"` title=`t('checkout.drawer.title')` className wrapper `mini-cart`; body: cart loading → 2 Skeleton rows; cart null/empty → EmptyState `checkout.drawer.empty` + note; items → ảnh 64px (fallback svg như CartLine) + qty badge góc ảnh (nền primary border 2 surface) + tên (clamp 2) + đơn giá + unavailable tint `badge-unavailable` + `checkout.drawer.unavailable`; footer: banner freeship tint-success `checkout.drawer.freeship` + `Tạm tính` `24/800 --c-danger` (`cart.subtotal`) + 2 CTA: outline `checkout.drawer.viewCart` → `appNavigate('/cart')`, solid `--grad-cta` `checkout.drawer.checkout` → `appNavigate('/checkout')`; cả 2 `onClose` trước navigate.
- [x] **Step 3:** `CartBadge.tsx` — bỏ emoji 🛒 → `<Icon name="cart" size={22}/>`; đổi `<a href="/cart">` thành `<button>` mở drawer (`onClick={() => setOpen(true)}`, giữ `data-testid="cart-badge"` + aria-label `t('shell.cart.aria', {count})`); **mount điều kiện `{open && <MiniCartDrawer open onClose={...}/>}`** (critic-P1: tránh useCart fetch GET /api/cart thêm 1 lần ở MỌI shell boot khi drawer đóng). Count logic giữ nguyên (fetchCart + event + auth subscribe — CartBadge fetch + useCart trong Drawer = 2 SUBSCRIBER của cùng nguồn sự thật server khi drawer mở, không phải 2 nguồn state — ghi chú comment). Badge count accent style §2.1 (`--c-accent`/`--c-on-accent` border 2 surface).
- [x] **Step 4:** Verify: unit mfe-checkout `pnpm test` XANH (vitest env = **jsdom** — SSR smoke `renderToStaticMarkup` cho MiniCartDrawer + logic test thuần); browser smoke qua shell (click badge → drawer trượt, items đúng, ESC/overlay đóng, CTA navigate).
- [x] **Step 5:** Commit `feat(checkout): mini-cart drawer trong CartBadge — ui-kit Drawer + useCart (FI-393 T3)`.

### Task 4: CartPage — QuantityStepper + confirm delete + polish

**Files:** `CartPage.tsx`

- [x] **Step 1:** Swap hand-roll `.qty-stepper` → `<QuantityStepper value onChange={(q)=>onChangeQty(item.id,q)} min={1} max={99} />` (keyboard + aria có sẵn).
- [x] **Step 2:** Confirm delete: state `pendingRemove: CartItem|null`; nút Xóa → `setPendingRemove(item)`; `<Modal open title={t('checkout.cart.removeConfirm.title')} footer=[Giữ lại (secondary)|Xóa (primary)]>` — confirm → `await remove(item.id)` + đóng; ESC/overlay = hủy.
- [x] **Step 3:** Line polish: ảnh 80px radius-sm border; tên clamp 2 hover link; giá `--c-danger` 700; unavailable tint (giữ `badge-unavailable` + opacity); line hover wash.
- [x] **Step 4:** Empty state elevate: EmptyState icon cart + title/desc/CTA "Về trang chủ" → `window.location.assign(storefrontUrl())` (trang chủ STOREFRONT — quyết định chốt, trùng semantics T9 CTA; helper `lib/appUrls.ts` mới: `storefrontUrl()` = `import.meta.env.VITE_STOREFRONT_URL ?? 'http://localhost:3000'` — cùng env + fallback với shell `sfUrl()`).
- [x] **Step 5:** i18n hóa mọi string CartPage qua keys Task 1 (`useT`). Verify unit + browser smoke (stepper +/-, keyboard arrows, confirm delete, empty state).
- [x] **Step 6:** Commit `feat(checkout): CartPage QuantityStepper + confirm delete + polish + i18n (FI-393 T4)`.

### Task 5: Coupon áp được từ cart → carry sang checkout (exit riêng)

**Files:** `CartPage.tsx`, `CheckoutPage.tsx`

- [x] **Step 1:** CartPage summary card: thêm coupon block TRƯỚC nút Thanh toán — input border dashed + nút "Áp dụng" (tint) + trạng thái: checking/ok (pill tint-success, nút Gỡ)/error (`.coupon-error`). Validate qua `validateCoupon(code, cart.subtotal)` (orderingApi hiện có — server-authoritative).
- [x] **Step 2:** Carry: áp OK → `sessionStorage.setItem('ecommerce.coupon', code)`; gỡ → remove; lib `lib/couponCarry.ts` (mới, 3 hàm set/get/clear + key const) — test được không DOM.
- [x] **Step 3:** CheckoutPage mount: đọc carry → nếu có + `couponDiscount===null` → tự `applyCoupon(code)` (điền `couponCode`, validate). **Semantics auto-apply fail (chốt):** invalid lúc mount → hiện `couponError` HIỀN + **clear carry key ngay** (code stale không re-error mỗi lần vào checkout; user sửa trực tiếp trong input checkout). User gỡ thủ công ở checkout → clear key. Đặt hàng THÀNH CÔNG → clear key (finalize).
- [x] **Step 4:** Exit criteria riêng: áp mã ở cart → sang checkout mã vẫn áp dụng (verify walkthrough + unit logic test carry set/get/clear).
- [x] **Step 5:** Commit `feat(checkout): coupon áp từ cart + carry sessionStorage sang checkout (FI-393 T5)`.

### Task 6: CheckoutPage — Stepper primitive

**Files:** `CheckoutPage.tsx`

- [ ] **Step 1:** Bỏ `<ol class="stepper">` hand-roll → `<Stepper steps={[{key:'address',label:t('checkout.stepper.address')},{key:'shipping',...},{key:'payment',...}]} current={step-1} onStepClick={(i)=>{ if(i+1<step) setStep((i+1) as 1|2|3); }} label={t('checkout.title')} />` — primitive disable future + keyboard roving. (Click step hiện tại: primitive cho phép onStepClick mọi i≤current; guard i+1<step tránh re-set state.)
- [ ] **Step 2:** Xóa css `.stepper*` cũ trong page.css (Task 10 sẽ không giữ). e2e đã grep — không spec nào reference `.stepper`.
- [ ] **Step 3:** Verify: keyboard Tab/Arrow/Enter quay lại step trước; browser smoke.
- [ ] **Step 4:** Commit `feat(checkout): Stepper primitive keyboard thay hand-roll (FI-393 T6)`.

### Task 7: Checkout step-1 form UX realtime + inputMode + autocomplete

**Files:** `CheckoutPage.tsx`

- [ ] **Step 1:** Touched map state `touched: Partial<Record<keyof Address,boolean>>`; onBlur field → set touched + validate riêng field đó (`validateField(name, value)` tách từ validateAddress); onChange → nếu touched rồi thì validate realtime. Submit giữ validate toàn bộ (set touched all).
- [ ] **Step 2:** `field()` helper: thêm `inputMode` (phone→'tel'), `autoComplete` map: fullName→'name', phone→'tel', line1→'address-line1', ward→'address-level3', district→'address-level2', city→'address-level1'. Label i18n — GIỮ EXACT chuỗi e2e.
- [ ] **Step 3:** Label điểm thưởng (dòng 491) ngắn 1 dòng: `points.label` = "Dùng điểm (tối đa {{max}} ≈ {{value}})" — chi tiết balance đưa xuống summary-note dưới input.
- [ ] **Step 4:** Inline error per field: Input primitive đã hỗ trợ `error` prop — hiện khi touched (không chờ submit). Verify: gõ SĐT sai → blur → lỗi ngay; mobile inputMode=tel.
- [ ] **Step 5:** Commit `feat(checkout): step-1 realtime validate + inputMode + autocomplete (FI-393 T7)`.

### Task 8: Checkout step 2-3 — shipping cards + summary ảnh

**Files:** `CheckoutPage.tsx`

- [ ] **Step 1:** Shipping options: label radio → card `shipping-card` — border 1.5 padding 16 radius-md, hover −2px shadow-1, selected: border primary + nền tint-primary-bg + check tròn 20px góc trên-phải (Icon check trong vòng). Fee + ETA (Dự kiến {{days}} ngày) + note GHN/flat. Radio input vẫn trong label (a11y giữ, visually-hidden style).
- [ ] **Step 2:** Summary sidebar: line item thêm ảnh vuông 56px (fallback svg) + qty badge nền primary góc (−6,−6 border 2 surface) + tên 13/600 + giá phải 700; coupon-applied pill style tint; Tổng `--summary-row--total` 26/800 danger border-top 2px; nút đặt `--grad-cta` cao 52 `--shadow-cta` (class `btn-order`).
- [ ] **Step 3:** Payment section: giữ logic Stripe/COD + testid + `.pay-panel`; style pay-method card hoá nhẹ (border, selected tint) — radio native giữ.
- [ ] **Step 4:** Skeleton summary khi cart loading: `useCart()` loading → summary card render 4 Skeleton row (thay vì list trống). Panel chính cũng skeleton khi loading.
- [ ] **Step 5:** Verify browser: step2 cards select, step3 summary ảnh đúng, skeleton lúc load chậm (throttle).
- [ ] **Step 6:** Commit `feat(checkout): shipping cards + summary ảnh + skeleton + pay polish (FI-393 T8)`.

### Task 9: ConfirmationPage — hero SVG + CTA về trang chủ

**Files:** `ConfirmationPage.tsx`

- [ ] **Step 1:** Hero: gradient `--grad-hero-1` radius-lg shadow-2 padding; icon vòng tròn: `<Icon name={terminalBad?'alert':'check'} size={30}/>` trong `.confirm-check` (nền trắng alpha/success); kicker "ĐƠN HÀNG" + h2 status; giữ testid order-id/order-status/data-status-code + email note + failed note + link my-orders.
- [ ] **Step 2:** Status timeline polish: pill status tint (giữ tint-success ok / tint-new pending / cancelled-danger) + note đã có — polish pill + spacing; KHÔNG đụng polling/gtag.
- [ ] **Step 3:** CTA "Tiếp tục mua sắm" → `window.location.assign(storefrontUrl())` — trang chủ **STOREFRONT** (context pack item 8: "về trang chủ storefront"; cross-origin nên full navigation, không appNavigate).
- [ ] **Step 4:** i18n hóa strings (keys Task 1). Verify browser: hero renders 2 trạng thái (CONFIRMED/FAILED — COD + saga-fail path), CTA về `/`.
- [ ] **Step 5:** Commit `feat(checkout): confirmation hero gradient + Icon SVG + CTA về trang chủ (FI-393 T9)`.

### Task 10: page.css elevation — hex sweep + motion + dark fix (2 app)

**Files:** `frontend/apps/mfe-checkout/src/page.css`, `frontend/apps/shell/src/header.css` (nếu còn hex sót)

- [ ] **Step 1:** Sweep checkout page.css: `#fff7e6/#ffd591/#874d00` (pay-warning) → `var(--tint-new-bg)/var(--tint-new-border)/var(--tint-new-text)`; mọi hex còn lại trong fallback var() → bỏ fallback hex hoặc giữ fallback CHỈ khi var có thể undefined (kiểm tokens đã declare — nếu có, bỏ fallback). `#fff` stepper cũ đã xóa cùng Task 6. `color: #fff` chỗ khác → `var(--c-surface)`/token trắng phù hợp.
- [ ] **Step 2:** Motion: hover/press dùng `--dur-fast/base` + `--ease-out/pop`; card lift hover translateY(−3px) shadow-1→3 cho cart-line/summary panel (shadow cascade §3.1 — panel resting shadow-1); nút CTA `--shadow-cta(-hover)`; focus ring tint.
- [ ] **Step 3:** Surface keyframes ĐƯỢC PHÉP ở page.css (không copy keyframes primitive): chỉ thêm nếu cần (drawer slide đã có uk-drawer-in; skeleton shimmer đã có uk-skeleton) — ưu tiên reuse; keyframes mới phải gate `@media (prefers-reduced-motion: reduce)` (ui-kit global đã chặn — verify không cần duplicate).
- [ ] **Step 4:** Sweep shell header.css — tokens-only (Task 2 viết chuẩn từ đầu, check lại).
- [ ] **Step 4b:** Checkout grid theo direction §2.4: `1fr + 380px` (hiện 320px — critic P2) — sửa `.checkout-grid` + `.cart-layout` (cart summary 320→340 tùy balance, giữ responsive 800px collapse).
- [ ] **Step 5:** Verify: `grep -nE '#[0-9a-fA-F]{3,8}' page.css header.css` → 0 hit (trừ hex trong gradient tokens đã declare ở tokens.css — không được xuất hiện ở page.css). Dark mode: bật data-theme=dark → toàn flow không ô lệch.
- [ ] **Step 6:** Commit `feat(checkout): page.css hex sweep + motion tokens + dark fix (FI-393 T10)`.

### Task 11: Walkthrough + tests + e2e subset xanh

**Files:** tests mới (mfe-checkout lib tests), không sửa specs

- [ ] **Step 1:** Unit: mfe-checkout `pnpm test` (mới: couponCarry logic test; SSR smoke MiniCartDrawer/CheckoutPage skeleton); i18n suite; ui-kit suite (không đụng — chạy confirm không vỡ).
- [ ] **Step 2:** Browser walkthrough 3 tầng (Rule 0) full flow: guest thêm hàng (storefront) → shell cart → drawer (ESC/overlay/CTA) → checkout guest-gate → login → checkout 3 bước (keyboard stepper, realtime lỗi SĐT blur, inputMode, coupon từ cart, summary ảnh, shipping card) → đặt COD → confirmation → CTA về `/`. Dark mode toàn flow + screenshots mỗi màn. Lưu ảnh `docs/superpowers/walkthroughs/fi393/`.
- [ ] **Step 3:** E2e subset: golden-path, cod-checkout, saga-fail — XANH trên stack sống. **Prerequisite (P0 critic): Stripe webhook path** — golden-path test 0 hard-assert `hasStripe()` + test 5 cần webhook-only PAID→CONFIRMED: (a) keys thật trong `.env` (`STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`); (b) `make stripe-listen` ĐANG CHẠY (Makefile target riêng — `make dev` KHÔNG bật forwarding; whsec ổn định theo recipe FI-310). Thiếu (a) → specs tự skip `[PENDING-STRIPE-KEYS]` (không phải fail — ghi rõ trong report); thiếu (b) khi CÓ keys → deterministic false-fail, KHÔNG chạy. Port war → alt-ports +100 recipe (rig của session này: shell 5283, checkout 5275, account 5276 + `E2E_SHELL_URL`/`E2E_STOREFRONT_URL` override); docker chết → nói THẬT, mock-gateway chỉ đủ nav-asserts.
- [ ] **Step 4:** Commit `test(checkout): unit coupon-carry + walkthrough evidence (FI-393 T11)`.

---

## Acceptance ↔ Task mapping (Phase 5 verifier dùng)

| ACCEPTANCE (context pack) | Task | Verify |
|---|---|---|
| 1. Header logo+search+cart+account; badge → drawer line items + tổng; guest + logged-in; ESC/outside đóng | T2, T3 | Browser walkthrough + screenshot |
| 2. Cart: stepper keyboard; xóa confirm; coupon ở cart → checkout vẫn áp | T4, T5 | Browser + unit carry |
| 3. Checkout: stepper keyboard nhảy bước; SĐT sai lỗi khi blur; mobile inputMode; summary ảnh | T6, T7, T8 | Browser DOM eval + screenshot |
| 4. Dark mode toàn flow không ô lệch; icon SVG hết emoji | T2, T3, T10 | Browser dark sweep + grep hex |
| 5. Confirmation CTA về trang chủ; polling hoạt động | T9 | Browser (COD → CONFIRMED) |
| 6. e2e subset XANH + unit mfe-checkout xanh | T11 | playwright + vitest output |
