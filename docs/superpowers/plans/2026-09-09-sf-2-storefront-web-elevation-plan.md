# SF-2 storefront-web-elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shopper đi hết home→PLP→PDP→search→coupons KHÔNG reload trắng (next/link + prefetch thay 24 chỗ `<a>` thô), mọi route có skeleton + error page đẹp, PDP tabs/modal chuẩn a11y (bỏ hack `:target`), motion điểm nhấn (hero ken-burns, scroll-reveal home, gallery zoom) reduced-motion safe, mobile <600px dùng được trơn, i18n gom 12+ COPY object + aria-label hardcoded — toàn bộ theo design direction B "Chợ Sôi Động 2.0" đã duyệt.

**Architecture:** SF-2 = CONSUMER thuần của nền SF-1 (tokens v2 + primitives 'use client' + skeleton compositions + useReveal — đã merge trên `story/fi390-uiux-elevation` @ f36e5c7). Zero backend/contracts change; storefront là app Next 14 App Router `[locale]` (vi không prefix, en prefix `/en` qua middleware rewrite). Server components giữ server; client boundary qua shim `components/ui-kit.ts` (per-primitive deep import — các primitive stateful đã có `'use client'` từ SF-1 nên import từ RSC an toàn). Motion CSS-only (dep freeze) — surface keyframes nằm trong `app/app.css` (direction §5.6 cho phép), primitive keyframes đã sẵn trong ui-kit.css.

**Tech Stack:** Next 14 App Router + React 18 + TypeScript, CSS thuần qua `var(--*)` (cấm hex literal mới — brand lock #F53D2D), vitest + @testing-library (jsdom), pnpm workspace. KHÔNG thêm dependency.

**Linear Issue:** FI-392 · **Worktree:** sf-2-storefront-web-elevation · **Đích merge:** `story/fi390-uiux-elevation` (KHÔNG main)

**Nguồn sự thật:**
- `docs/superpowers/contexts/fi390-sf-2.md` — spec slice 15 item + ACCEPTANCE 5 dòng + Boundary (read-only nhưng bind)
- `docs/superpowers/designs/fi390-uiux-elevation-direction.md` — NGUỒN DUY NHẤT mọi giá trị visual/motion (§2.1 header, §2.2 home, §2.3 PDP, §3 motion, §4 surface mở rộng, §5 cấm, §6 dev-tự-quyết)
- `packages/ui-kit/src/components/*` — primitive APIs (đọc trước khi wire; KHÔNG sửa)
- Commit convention hiện có: `<type>(<scope>): <imperative summary> (FI-392)` — 1 task = 1 atomic commit

---

## 0. Root cause analysis (WHY)

### Root cause
Storefront build trước SF-1 không có nền design language: navigation dùng `<a>` thô (full document reload 24 chỗ), không có loading/error UI ( trắng trang khi chậm/lỗi), PDP tabs dùng hack CSS `:target` (jump-scroll + không keyboard), modal review tự viết 210 dòng thiếu focus-trap/ESC/restore, motion không có, i18n COPY object copy-paste rải rác 12+ file + ~10 aria-label hardcoded tiếng Việt. SF-1 đã cung cấp nền (tokens v2 + primitives + skeleton + useReveal) nhưng storefront chưa tiêu thụ — và token gradient bị RENAME (`--grad-electronics` → `--grad-cat-dientu`…) khiến `categoryGradient()` ở `lib/catalog-api.ts` đang trả tên var CHẾT (placeholder mất nền gradient — regression có sẵn SF-2 phải fix với tư cách consumer).

### Current state (before)
- 24 `<a href>` thô trong 13 file (grep xác nhận); SortSelect `window.location.assign` (SortSelect.tsx:29); AddToCart buyNow `window.location.assign` (cross-origin shell — GIỮ, không phải internal nav).
- 0 `loading.tsx`/`error.tsx` — chậm mạng/lỗi SSR → trắng hoặc trang lỗi mặc định Next.
- not-found text-only trộn vi/en, không design.
- Header: mini-nav 3 link đều trỏ `/c/dien-tu`, actions chưa chuẩn icon-btn 42×42, search chưa focus ring §2.1.
- HeroCarousel: auto-rotate 5s KHÔNG pause, không ken-burns, không nút pause (a11y fail theo direction §3.3).
- Home: FlashDeal/CategoryTiles/featured đúng xương nhưng chưa đạt mật độ §2.2 (fcard 186px + progress bar, tile gradient + count, sec-title thanh dọc), chưa scroll-reveal.
- ProductCardView: giá + strikethrough tự render (L100-105), GRADIENT_VARS dùng token tên cũ (chết).
- PLP: Pagination tự viết (`<a>` thô — reload); Sidebar checkbox giả span-trong-`<a>` (L74-76) không expose state cho AT.
- PDP: tabs `:target` (page.tsx:267-273); "Đã bán {ratingCount}" (L242 — nói dối); Gallery không zoom; AddToCart toast `.pdp-toast` tự viết; WriteReviewModal 210 dòng không focus-trap/ESC.
- Search/coupons: empty state cơ bản; CopyButton L59 `locale === 'en' ? 'Copy' : 'Copy'` (vi sai — phải "Sao chép").
- NewsletterForm hex cứng 6 chỗ; RecentlyViewed inline-style toàn bộ + hex.
- Responsive: chưa có mobile pass <600px (nav/grid/sticky ATC).

### Expected outcome
5 ACCEPTANCE user-visible của context pack (§2 Scope dưới). Demo: bấm sort/filter/pagination không trắng trang; thu hẹp <600px vẫn mua được.

### Constraints & hardships
- Brand lock: KHÔNG đổi hex/tint/pill/wash hiện có; màu trong css CHỈ qua `var(--*)`; rgba primary CHỈ qua `--shadow-cta(-hover)`; hex mới = 0 (khác SF-1 — SF-2 không có ghích hex mới nào).
- `packages/ui-kit/**` READ-ONLY (SF-1 own) — primitive thiếu gì → flag coordinator, không tự sửa.
- KHÔNG đổi: routes/URL pattern, canonical/hreflang hiện có (chỉ CỘNG BreadcrumbList), logic AddToCart/wishlist/coupon/review (presentation quanh chúng thôi — honesty logic giữ nguyên), middleware, e2e specs.
- KHÔNG scroll-reveal ngoài home sections; motion điểm nhấn CHỈ hero/gallery (direction §5.5).
- KHÔNG thêm dependency; animation CSS-only.
- contracts/**, backend/**, shell/MFEs (SF-3/4/5 own) — không đụng.
- e2e FULL là SF-6 — SF-2 chỉ chạy subset 4 spec.

### High-level strategy
Tuần tự 16 task theo lớp phụ thuộc: (1) routing nền (Link migration) → (2) loading/error state → (3-4) chrome + hero → (5-6) home + card → (7) PLP → (8a-9) PDP → (10-11) search/coupons/footer → (12) i18n consolidate (cuối cùng để gom cả copy mới) → (13) responsive → (14) SEO cộng → (15) walkthrough + e2e. Serialize toàn bộ (1 worktree, chung `app/app.css` + chung nhiều file page — không parallel worker, precedent SF-1). Mỗi task = 1 atomic commit = rollback unit. Rolling review theo nhóm 4 task (FI-190 pattern).

## 1. Problem
Shopper trên storefront (surface lớn nhất hệ thống) mỗi ngày: bấm link/filter bị reload trắng, mạng chậm thấy trang trắng, PDP tab nhảy scroll + modal không chặn focus, mobile nhỏ vỡ layout, tiếng Anh lộ chữ Việt (aria-label, CopyButton) — trải nghiệm "thô" so với standard marketplace dù backend/SEO đã tốt.

## 2. Scope
- **In:** 16 task dưới (bracket FI-390 block SF-2, t8 tách 2 theo context pack Boundary) — Link migration, loading/error/not-found, header/hero/home/card/PLP/PDP/search/coupons/footer elevation, review modal → ui-kit Modal, toast → ui-kit Toast, i18n consolidate, responsive <600px, BreadcrumbList JSON-LD + fix label "Đã bán", walkthrough + e2e subset.
- **Out:** `packages/ui-kit/**` (SF-1), shell/mfe-* (SF-3/4/5), backend/contracts, e2e specs (read-only chạy subset), FULL e2e (SF-6), merge main, đổi URL/SEO hiện có, đổi logic cart/wishlist/coupon/review, scroll-reveal ngoài home.
- **Success criteria:** từng dòng ACCEPTANCE context pack — verify Phase 5 bằng browser 3 tầng (DOM/visual/flow), không chỉ process-pass.

## 3. Touch map
Chi tiết trong context pack (nguồn chính xác). Tóm tắt theo task:

| Task | Files chính |
|---|---|
| T1 | 13 file có `<a>`: `app/[locale]/{page,c/[slug]/page,p/[slug]/page,search/page,coupons/page,not-found}.tsx`, `app/not-found.tsx`, `components/{Footer,Header,ProductCardView}.tsx`, `components/home/{CategoryTiles,FlashDealSection,HeroCarousel}.tsx`, `components/plp/Sidebar.tsx`, `components/reviews/WriteReviewModal.tsx`, `components/plp/SortSelect.tsx` |
| T2 | mới `app/[locale]/{page,c/[slug],p/[slug],search}/{loading,error}.tsx` ×8 + elevate `app/[locale]/not-found.tsx` + `app/not-found.tsx` + css |
| T3 | `components/Header.tsx`, `components/SearchBar.tsx` (polish), css header |
| T4 | `components/home/HeroCarousel.tsx`, css hero (+keyframes kb trong app.css) |
| T5 | `components/home/*`, `app/[locale]/page.tsx`, css home, client wrapper `components/Reveal.tsx` (mới) |
| T6 | `components/ProductCardView.tsx`, `lib/catalog-api.ts` (categoryGradient token mới), css p-card |
| T7 | `components/plp/{Pagination,Sidebar,Toolbar,SortSelect}.tsx`, client wrapper `components/plp/PaginationLink.tsx` (mới) hoặc inline, css plp |
| T8a | `components/pdp/Gallery.tsx`, css gallery (+keyframes nếu cần) |
| T8b | `components/pdp/{AddToCart,PdpBuyBox}.tsx`, `app/[locale]/p/[slug]/page.tsx` (tabs), `app/[locale]/layout.tsx` (ToastProvider), shim `components/ui-kit.ts`, css pdp |
| T9 | `components/reviews/{WriteReviewModal,WriteReviewControl,MyPendingReviewPanel}.tsx` (modal host), shim, css rv |
| T10 | `app/[locale]/search/page.tsx`, `app/[locale]/coupons/page.tsx`, `components/coupons/CopyButton.tsx`, css |
| T11 | `components/{Footer,NewsletterForm,RecentlyViewed}.tsx`, css footer |
| T12 | mới `lib/i18n.ts` (+ test), 12+ component COPY → import |
| T13 | css responsive <600px (header/mini-nav/hero/grid/pdp sticky đã T8b), `components/Header.tsx` nếu cần markup |
| T14 | `lib/pdp.ts` (breadcrumbJsonld + test), `app/[locale]/p/[slug]/page.tsx` + `app/[locale]/c/[slug]/page.tsx` (script tag), label L242 |
| T15 | không code mới (trừ fix phát hiện) — walkthrough + e2e subset + screenshots |

READ-ONLY: `packages/ui-kit/**`, `packages/i18n/**`, `contracts/**`, `backend/**`, `apps/{shell,mfe-*}/**`, `e2e/**`, `middleware.ts`, `lib/plp-params.ts` (URL logic giữ nguyên), `lib/format.ts`.

Consumers/regression: e2e subset 4 spec (selectors `data-testid="related-products"` / `"recently-viewed"` / `newsletter-*` GIỮ; classname semantic GIỮ), unit tests hiện có 10 file (`addtocart.test.ts` import COPY/buildAddItemPayload — giữ export), PWA manifest, GA pageview, `lib/seo.ts` hreflang (không đổi).

**Shared surfaces:** không API/DB/env mới. Env hiện có giữ: `SITE_URL`, `NEXT_PUBLIC_SHELL_URL`, `GATEWAY_URL`.

## 4. Design

- **Approach:** Direction B đã duyệt — SF-2 áp nguyên văn giá trị §2/§3 (không sáng tạo token mới). Task t8 tách 2 theo context pack. Ưu tiên: mechanism mới bọc cái cũ (Link bọc href, wrapper delegation bọc Pagination, Modal bọc form của WriteReviewModal) — không viết lại logic.
- **Alternatives loại:** (a) Pagination button-mode `onPageChange` — loại: vỡ no-JS pagination (ACCEPTANCE 1 yêu cầu GET href thật); chọn delegation wrapper giữ `<a>` + `router.push`. (b) Sticky ATC duplicate component riêng — loại: 2 nguồn state; chọn CSS sticky `.pdp-cta-row` <600px (1 instance, cùng handler). (c) i18n ép qua `@ecommerce/i18n` — loại: storefront dùng `[locale]` routing + COPY pattern đã vận hành; chọn module nội bộ `lib/i18n.ts` type-safe (đúng spec item 12). (d) EmptyState icon emoji — thay bằng SVG inline/Icon primitive (chrome không emoji; tile/thumb placeholder emoji GIỮ — direction §2.2 thiết kế intentionally).
- **Edge cases / second-order:**
  - Link chỉ cho INTERNAL (`localePath`); link cross-origin shell (`shellUrl()/cart|account`) GIỮ `<a>` (different origin — next/link vô ích + prefetch sai origin).
  - Links filter/sort tham số dài → `prefetch={false}` (tránh prefetch storm); link thường prefetch mặc định.
  - `error.tsx` không nhận params → parse `usePathname()` segment `[locale]`; không resolve được → bilingual (pattern not-found hiện có).
  - BreadcrumbList JSON-LD escape `<` → `<` (stored XSS qua tên danh mục admin-enter — cùng pattern PDP L201).
  - Hero ken-burns: lớp inset -4% scale 1→1.09 16s alternate; reduced-motion → tắt hẳn + KHÔNG auto-rotate (chỉ arrows/dots/pause button); pause button luôn hiện khi autoplay.
  - Tabs client wrapper: panels là children server-rendered (reviews section là RSC) — wrapper nhận `children` theo key, panel `hidden` khi không active; bỏ css `:target`/`:has`; giữ id panel (`#tab-desc`…) — kiểm e2e có reference hash không trước khi đổi.
  - Price primitive dùng Intl vi-VN — output khớp `formatVnd` ("1.290.000 ₫" — doc format.ts xác nhận đã align); card badge -% nằm trên thumb → suppress badge của Price trong `.p-card` bằng css (`display:none` scope) giữ đúng anatomy §2.2.5.
  - RecentlyViewed/Countdown hydration-safe giữ nguyên cơ chế.
  - WishlistHeart là client island trong card link — click không điều hướng (giữ nguyên behavior).
- **Non-functional:** perf (CSS-only motion, prefetch có chủ đích, skeleton chống CLS) · a11y (keyboard tabs/modal, aria-pressed filter, focus ring §3.4, reduced-motion từng hiệu ứng) · i18n (vi/en parity test mới) · security (JSON-LD escape; không thêm user-input surface mới).

## 5. Implementation outline

**Execution order (16 tasks — tuần tự, 1 executor tại 1 thời điểm; nhóm review A/B/C/D):**

| # | Bracket task name | Nhóm | Đụng chính |
|---|---|---|---|
| T1 | next-link-migration-24-links-sortselect-router | A | 13 file `<a>` + SortSelect |
| T2 | loading-error-notfound-skeleton-compositions | A | 8 file mới + 2 not-found + css |
| T3 | header-search-mininav-polish-direction | A | Header/SearchBar + css |
| T4 | hero-carousel-elevation-kenburns-pause-a11y | A | HeroCarousel + css |
| T5 | home-sections-flash-category-featured-scroll-reveal | B | home/* + Reveal wrapper + css |
| T6 | productcard-price-primitive-consolidate-hover | B | ProductCardView + catalog-api gradient |
| T7 | plp-pagination-primitive-filter-a11y-real-checkbox | B | plp/* + css |
| T8a | pdp-gallery-zoom | B | Gallery + css |
| T8b | pdp-tabs-sticky-mobile (tabs keyboard + toast §3.2 + sticky ATC + meta link đánh giá) | C | PDP page/AddToCart/layout/shim |
| T9 | pdp-review-modal-uikit-focus-trap-esc | C | WriteReviewModal + shim |
| T10 | search-coupons-polish-empty-copybutton | C | search/coupons + CopyButton |
| T11 | footer-newsletter-tokenize-recentlyviewed-decss | C | Footer/Newsletter/RecentlyViewed |
| T12 | i18n-consolidate-copy-objects-aria-labels | D | lib/i18n.ts mới + 12+ file |
| T13 | responsive-600-mobile-nav-sticky-atc-grid | D | css <600px |
| T14 | breadcrumb-jsonld-sold-count-placeholder-fix | D | lib/pdp.ts + 2 page |
| T15 | walkthrough-screenshots-e2e-golden-nav-green | D | verify + screenshots |

**File structure:** client wrapper mới đặt cạnh owner (`components/Reveal.tsx`, `components/plp/PaginationLink.tsx` nếu cần); i18n ở `lib/i18n.ts` (single module, grouped catalogs + `type Locale` từ format.ts); loading/error theo convention Next (`app/<segment>/loading.tsx|error.tsx`). CSS thêm vào section tương ứng có sẵn trong `app/app.css` (comment `/* ── SF-2 (FI-392) — <miền> */`), keyframes surface (hero kb) đặt trong section hero.

**Testing strategy:** `cd frontend/apps/storefront-web && pnpm vitest run` xanh sau MỖI task (10 test file hiện có không được vỡ: `addtocart` import COPY/buildAddItemPayload giữ nguyên export). Thêm test: T6 (productGradient map token mới), T8b (toast honesty copy — giữ test cũ xanh), T12 (i18n parity vi/en — mọi key đủ 2 locale), T14 (breadcrumbJsonld escape `<`). `pnpm lint` (tsc --noEmit) sạch trước mỗi commit. Browser verify (Rule 0) do coordinator thực hiện sau mỗi nhóm: mở tab → đi flow → screenshot → so direction.

**e2e subset (T15):** `golden-path.spec.ts` + `nav-honesty.spec.ts` + `related-products.spec.ts` + `review-flow.spec.ts` — cần dev stack sống (gateway + catalog data). Port base +0 (không alt-ports). Nếu port war/docker chết → recipe fe-e2e-isolated (mock-gateway :9099 + GATEWAY_URL rewire cả SSR lẫn browser).

**e2e selector contract (READ-ONLY specs — MỌI task phải giữ các selector sau sống):**

| Selector (spec) | Nơi | Task không được vỡ |
|---|---|---|
| `nav.mini-nav a` nth(0/1/2) href `/c/dien-tu(?\sort=…)` exact, đúng thứ tự | Header | T3 |
| `a[href="#"]` count 0 (home + footer) | toàn cục | T1, T11 |
| `.cat-grid`, `.cat-tile`, `.cat-tile--more` (click → URL đúng) | home | T5 |
| `a.featured-more` href `/c/{slug}?sort=discount` | home | T5 |
| `.site-footer a` count ≥10, 0 href `#` | footer | T11 |
| `.pdp-toast[role="status"]` + exact text lỗi cart | PDP AddToCart | T8b (GIỮ markup — chỉ restyle) |
| `getByRole('link', {name: 'Đánh giá'})` (substring) click được → panel reviews mở | PDP meta link mới | T8b |
| `getByRole('dialog', {name: /Viết đánh giá/})` | review modal | T9 |
| `.rv-star`, button /Viết đánh giá/, /Gửi đánh giá/ | review form | T8b, T9 |
| `.pdp-swatch`, `.pdp-chips button`, button 'THÊM VÀO GIỎ' | PDP buybox | T8b (không đổi VariantSelector/AddToCart copy) |
| `input[type=search][name=q]`, link /Switch language/i | SearchBar/LocaleSwitcher | T3, T12 |
| `getByTestId('related-products')` > `a` | PDP related | T14 (giữ section) |
| `getByTestId('recently-viewed')` > `a` + href so | home | T11 |
| link /uniqlo/i (search keyword chips) | search | T10 |

## 6. Risks & unknowns
- **Must verify:** primitive APIs đọc trước khi wire (Modal: open/onClose/title/footer/size; Tabs: items/value/onInput + roving tabindex; Toast: ToastProvider + useToast; Price: value/comparePrice/size/locale; Pagination: pageHref → `<a>` mode; Icon: 21 names không có truck/zap → perk "🚚" dùng inline SVG storefront (precedent Header); useReveal: ref + threshold + delayMs).
- **Unverified assumptions (giảm thiểu sẵn):** delegation click trên Pagination primitive hoạt động (event bubbling chuẩn — fallback: wrapper render Link list riêng nếu primitive chặn); `#tab-*` hash CÓ được e2e gián tiếp reference (review-flow click link role "Đánh giá" → hash — resolution T8b Step 2, đã verify với plan-critic); Icon catalog 24 names (không có truck/zap — perk ship dùng inline SVG); Intl vi-VN output khớp formatVnd (doc format.ts khẳng định align — verify 1 test).
- **Boot verify:** dev stack full cho walkthrough (make dev hoặc storefront + gateway hiện có); kiểm port trước (memory: 5173/3000/8080 conflicts, IPv4/IPv6 squatting).

---

## Tasks

Mọi task: làm trong worktree hiện tại, commit ngay sau khi xong (`<type>(<scope>): <summary> (FI-392)`), chạy `pnpm vitest run` + `pnpm lint` trong `frontend/apps/storefront-web` trước khi commit. KHÔNG đụng file ngoài phạm vi task. KHÔNG `git add -A` — stage đúng file.

### Task 1: next-link-migration-24-links-sortselect-router (nhóm A)

**Files:** 13 file liệt kê touch map + `components/plp/SortSelect.tsx`

- [x] **Step 1:** Migration `<a href>` thô → `next/link` `Link` CHO MỌI internal anchor (target `localePath(...)` hoặc path nội bộ `/`): logo + mini-nav (Header), footer cột Danh mục (cột Tài khoản là `shellUrl()` — GIỮ `<a>`), hero CTA, fcard, cat-tile, p-card (ProductCardView), breadcrumb PDP/PLP, search chips, not-found home link, WriteReviewModal guest CTA là `shellUrl()` (GIỮ `<a>`). Link render `<a>` thật — no-JS fallback giữ nguyên.
- [x] **Step 2:** `prefetch={false}` CHỈ cho links filter/sort tham số dài (sidebar tree/check links qua `buildPlpUrl`, featured-more `?sort=discount`); links thường prefetch mặc định.
- [x] **Step 3:** SortSelect: `window.location.assign` → `useRouter().push(url.toString(), { scroll: false })` (giữ logic reset page + build URL từ `window.location.href` — URL-driven không đổi). BuyNow `window.location.assign(shellUrl()/cart)` GIỮ nguyên (cross-origin shell).
- [x] **Step 4:** Grep kiểm: `grep -rn "<a " app components --include="*.tsx"` — còn lại CHỈ các chỗ cross-origin shell (`shellUrl()`) + Pagination (T7 xử lý) + 3 anchor tab `#tab-*` (page.tsx:270-272 — T8b thay bằng Tabs primitive, KHÔNG migrate sang Link trong T1) + hero arrows/dots (button). Không còn internal `<a href>` khác.
- [x] **Step 5:** vitest + lint xanh → commit `feat(storefront): next/link migration 24 internal links + SortSelect router.push (FI-392)`.

### Task 2: loading-error-notfound-skeleton-compositions (nhóm A)

**Files:** mới `app/[locale]/{loading,error}.tsx` (home — page.tsx nằm trực tiếp dưới `[locale]/`), `app/[locale]/coupons/loading.tsx`, `app/[locale]/c/[slug]/{loading,error}.tsx`, `app/[locale]/p/[slug]/{loading,error}.tsx`, `app/[locale]/search/{loading,error}.tsx`; sửa `app/[locale]/not-found.tsx` + `app/not-found.tsx`; css.

- [ ] **Step 1:** `loading.tsx` streaming SSR — skeleton compositions từ ui-kit (`ProductCardSkeleton` ×6 cho PLP/search; home: hero block tĩnh + flash rail + grid skeleton; PDP: gallery square + info lines) — reserve chiều cao chống CLS. Skeleton dùng shimmer có sẵn ui-kit (`--dur-shimmer`).
- [ ] **Step 1b (P0-3 fix):** cặp home đặt ở `app/[locale]/loading.tsx` + `app/[locale]/error.tsx` (page.tsx nằm trực tiếp dưới `[locale]/` — KHÔNG có segment `page/`); thêm cả `app/[locale]/coupons/loading.tsx` (6 ProductCardSkeleton — coupons không có loading riêng sẽ fallback skeleton home).
- [ ] **Step 2:** `error.tsx` (`'use client'`, nhận `{ error, reset }`): locale từ `usePathname()` segment (không resolve → bilingual fallback pattern not-found); text vi/en; nút "Thử lại" gọi `reset()`; KHÔNG crash Next mặc định.
- [ ] **Step 3:** Elevate 2 `not-found.tsx`: design theo direction (icon SVG, code 404 lớn, title/desc, CTA outline về trang chủ) — giữ bilingual (không có params).
- [ ] **Step 4:** vitest + lint xanh → commit `feat(storefront): loading skeleton + error + not-found elevation cho 4 route (FI-392)`.

### Task 3: header-search-mininav-polish-direction (nhóm A)

**Files:** `components/Header.tsx`, css header (`app/app.css` section Header).

- [x] **Step 1:** Search polish §2.1: focus-within ring `0 0 0 4px var(--tint-primary-bg)` + `--shadow-2`; nút Tìm kiếm hover `--c-primary-hover` (giá trị đã đúng css hiện có — kiểm và bổ sung thiếu).
- [x] **Step 2:** Actions: icon-btn 42×42 radius-md, hover nền `--wash-hover` + chữ `--c-link`; cart-badge nền `--c-accent` chữ `--c-on-accent` min 18×18 font 10.5/800 border 2px surface (cart-badge là link — nếu chưa có badge số, chỉ polish visual badge khi có; KHÔNG tạo fetch giỏ mới — cart state là shell/SF-3).
- [x] **Step 3:** Mini-nav: link trắng 13/600 padding 8×14 hover `--c-primary-hover`; mục accent `--c-accent`; scroll-x khi hẹp (chạy được — T13 hoàn thiện mobile). 3 link GIỮ trỏ `/c/dien-tu` (spec: polish visual; slug root categories thật CHỈ khi API sẵn — categories API có sẵn nhưng Header là server component không fetch thêm: GIỮ nguyên 3 link hiện trạng, polish thôi).
- [x] **Step 4:** z-index `--z-header` + shadow `--shadow-1` khi sticky.
- [x] **Step 5:** vitest + lint xanh → commit `feat(storefront): header search focus ring + actions + mini-nav polish per direction §2.1 (FI-392)`.

### Task 4: hero-carousel-elevation-kenburns-pause-a11y (nhóm A)

**Files:** `components/home/HeroCarousel.tsx`, css hero + keyframes kb (app.css).

- [x] **Step 1:** Anatomy §2.2.1: cao 380px `--radius-lg` `--shadow-2`; slide padding ngang 8%; kicker 13/700 tracking .3em uppercase; h2 44/800 lh 1.12; ribbon -8deg top 26 right 8%; arrows tròn 38px nền trắng .92; dots 9px (active 22px bo 6px); track translateX `--dur-carousel` ease.
- [x] **Step 2:** Ken-burns: lớp con inset -4%, scale 1→1.09, `--dur-kb` ease-in-out alternate (keyframes surface trong app.css, gate reduced-motion); chỉ hero (§5.5).
- [x] **Step 3:** A11y autoplay: auto-rotate 6000ms (direction §6: 6s đề xuất); pause on hover/focus của section (clear interval); nút pause/play (button thật aria-label vi/en + aria-pressed) luôn hiển thị khi autoplay; reduced-motion (`matchMedia`) → KHÔNG auto-rotate (chỉ bấm arrows/dots) + kb tắt (css global reduced-motion đã có từ SF-1 — kb keyframes bị .01ms là đủ, nhưng auto-rotate phải chặn bằng JS).
- [x] **Step 4:** Giữ SLIDES copy vi/en (i18n consolidate T12 sẽ gom).
- [x] **Step 5:** vitest + lint xanh → commit `feat(storefront): hero ken-burns + pause a11y + anatomy direction §2.2.1 (FI-392)`.

### Task 5: home-sections-flash-category-featured-scroll-reveal (nhóm B)

**Files:** `components/home/{FlashDealSection,CategoryTiles}.tsx`, `app/[locale]/page.tsx`, mới `components/Reveal.tsx`, css home.

- [x] **Step 1:** Client wrapper `components/Reveal.tsx` ('use client'): div bọc dùng `useReveal` ui-kit (props: `delayMs?`); SSR/no-JS/reduced-motion → content hiện sẵn (hook tự no-op — KHÔNG css-default-hidden).
- [x] **Step 2:** FlashDeal §2.2.2: khối `--grad-flash` radius-lg padding 16 shadow-2; title 24/800 uppercase + icon sét (inline SVG storefront — Icon catalog không có zap); countdown hộp 36×36 tabular-nums; link "Xem tất cả" pill nền trắng .4 hover .65; fcard ngang scroll-x rộng 186 (thumb 150), badge -% góc trên-trái, tên clamp 2 dòng cao 37, giá danger + gạch, progress bar 5px `--grad-cta` + "Đã bán N/M" — progress dữ liệu: ProductCard KHÔNG có field sold/stock → progress bar CHỈ khi có dữ liệu thật; không có → bỏ progress (không bịa số — honesty). Ghi commit note.
- [x] **Step 3:** CategoryTiles §2.2.3: grid 6 cột gap 12, tile gradient `--grad-cat-*` border + shadow-1 radius-lg padding 16×12, tên 13/700, count 11 muted (Category PUBLIC DTO có `productCount`? — kiểm `lib/catalog-api.ts` type; không có → bỏ count, không bịa), hover −2px + shadow-2, tile "Xem thêm" border dashed shadow-none.
- [x] **Step 4:** Featured §2.2.4: sec-title = thanh dọc primary 5×22 + h3 21/800 uppercase + "Xem thêm ›"; grid 4 cột gap 12.
- [x] **Step 5:** Scroll-reveal: Reveal bọc FlashDeal/CategoryTiles/featured section (stagger card trong featured qua delayMs 70ms×index, cap ~5); KHÔNG reveal ở trang khác (§5.5).
- [x] **Step 6:** vitest + lint xanh → commit `feat(storefront): home sections elevation + scroll-reveal per direction §2.2 (FI-392)`.

### Task 6: productcard-price-primitive-consolidate-hover (nhóm B)

**Files:** `components/ProductCardView.tsx`, `lib/catalog-api.ts`, css p-card.

- [x] **Step 1:** Fix gradient token chết: `GRADIENT_BY_CATEGORY` + fallback trong `lib/catalog-api.ts` → token mới `--grad-cat-dientu/thoitrang/nhacua/sach/lamdep` (regex giữ nguyên); `GRADIENT_VARS` ProductCardView → 5 var mới.
- [x] **Step 2:** Giá + strikethrough (L100-105) → primitive `Price` (`value`, `comparePrice`, `size` sm/md, `locale` vi-VN/en? — Price locale prop là BCP47: 'vi-VN'|'en-US'? kiểm output khớp formatVnd trước; nếu en output lệch format hiện có → truyền 'vi-VN' luôn và giữ locale hiển thị đồng nhất, ghi commit note) trong `.p-price-row`; suppress badge Price trong card scope bằng css — **đọc `Price.tsx` trước để lấy đúng class badge** (P2 critic: verify class name để selector `.p-card` scope chắc chắn ăn); badge -% nằm trên thumb rồi.
- [x] **Step 3:** Hover chuẩn §3.1: card hover translateY(−3px) + shadow-1→3 `--dur-base` `--ease-out`; tên hover `--c-link`.
- [x] **Step 4:** WishlistHeart polish: scale hover + reduced-motion (css `.wl-heart`), không đổi logic.
- [x] **Step 5:** Thêm/điều chỉnh unit test `tests/` (productGradient map token mới — không trả var chết); vitest + lint xanh → commit `feat(storefront): ProductCard Price primitive + gradient token mới + hover cascade (FI-392)`.

### Task 7: plp-pagination-primitive-filter-a11y-real-checkbox (nhóm B)

**Files:** `components/plp/{Pagination,Sidebar,Toolbar,SortSelect}.tsx`, css plp.

- [x] **Step 1:** Thay body `components/plp/Pagination.tsx` bằng primitive ui-kit `Pagination` (mode URL-driven: `pageHref` trả `buildPlpUrl(...)`, `page`, `totalPages`, labels locale). SPA nav: bọc client delegation — `'use client'` wrapper `onClick` bắt `<a>` con → `e.preventDefault()` + `router.push(href)` (giữ `<a>` href thật → no-JS vẫn load trang qua GET href). `Pagination.tsx` hiện là server component — chuyển thành file client wrapper export cùng interface (basePath/query/totalPages/extraParams) để caller (2 page) không đổi.
- [x] **Step 2:** Sidebar expose state cho AT: link `.plp-check` thêm `aria-pressed={checked}` (giữ nguyên markup link URL-driven — checkbox thật input sẽ vỡ no-JS GET flow); kiểm css `.plp-check-box` giữ ✓ visual.
- [x] **Step 3:** Toolbar/SortSelect polish theo §2.4/§4 (select style token, focus ring tint).
- [x] **Step 4:** vitest + lint xanh → commit `feat(storefront): PLP pagination primitive SPA + filter aria-pressed (FI-392)`.

### Task 8a: pdp-gallery-zoom (nhóm B)

**Files:** `components/pdp/Gallery.tsx`, css gallery.

- [x] **Step 1:** Hover-zoom §2.3: ảnh chính — mousemove set `--mx/--my` (transform-origin theo con trỏ) + scale 1.18, transition .25s `--ease-out`, chỉ transform; lens radial-gradient 160px trắng .35→transparent 70% hiện khi hover. Chỉ khi ảnh thật (placeholder gradient → không zoom). Touch/mobile: không zoom (pointer: fine media query).
- [x] **Step 2:** Thumbs 72×72 active border primary — polish hiện có; keyboard giữ (button đã có role=tab).
- [x] **Step 3:** vitest + lint xanh → commit `feat(storefront): PDP gallery hover-zoom lens per direction §2.3 (FI-392)`.

### Task 8b: pdp-tabs-sticky-mobile — tabs thật + toast direction + sticky ATC (nhóm C)

> **P0 plan-critic resolved (2026-09-09):** e2e READ-ONLY chốt 2 selector contract — (1) `nav-honesty.spec.ts:102-105` assert `.pdp-toast[role="status"]` exact text lỗi cart → **toast AddToCart GIỮ markup `.pdp-toast[role="status"]`, chỉ restyle css theo direction §3.2** (REQUIREMENT-GAP đã post lên FI-390 — nếu epic duyệt sửa e2e thì swap ui-kit Toast ở vòng sau); (2) `review-flow.spec.ts:69-70` click `getByRole('link', {name: 'Đánh giá'})` → **Tabs primitive GIỮ (button/keyboard) + meta PDP thêm link `{N} đánh giá` `href="#tab-reviews"`** (direction §2.3 vốn định "link đánh giá" trong meta) — PdpTabs nghe `hashchange` để activate đúng tab khi link/URL hash trỏ vào.

**Files:** `app/[locale]/p/[slug]/page.tsx`, `components/pdp/AddToCart.tsx`, `app/[locale]/layout.tsx`, `components/ui-kit.ts` (shim), css pdp. Client wrapper mới `components/pdp/PdpTabs.tsx`.

- [ ] **Step 0 (pre):** shim `components/ui-kit.ts` thêm `Tabs`, `ToastProvider`, `useToast` (deep import) + cập nhật comment stale (đã nói "chưa 'use client'" — SF-1 đã đánh dấu đủ); `[locale]/layout.tsx` bọc children bằng `ToastProvider` (client boundary qua shim — layout server vẫn render được; consumer duy nhất hiện tại: CopyButton T10).
- [ ] **Step 1 (P0-1 resolution):** AddToCart toast: GIỮ element `.pdp-toast[role="status"]` + copy exact ("Không thêm được vào giỏ — thử lại" / ok) — e2e nav-honesty assert exact; **restyle css theo direction §3.2**: nền `var(--c-text)` chữ `var(--c-bg)`, `--radius-full`, padding 10×18, 13/700, mở opacity + translateY(12px→0) `--dur-slow` `--ease-pop` (keyframes surface trong app.css, gate reduced-motion), auto-dismiss 2200ms (đổi 2500→2200). GIỮ NGUYÊN export `COPY` + `buildAddItemPayload` + toàn bộ logic fetch/stock/double-submit (honesty logic không đụng).
- [ ] **Step 2 (P0-2 resolution):** Tabs thật: client wrapper `PdpTabs` ('use client'): primitive `Tabs` (items 3 tab, controlled `value`/`onInput`, keyboard ←→ roving tabindex có sẵn — role=tab button, không jump-scroll) + panels children với `hidden={activeKey!==key}`; giữ id panel `tab-desc/info/reviews`; mount + `hashchange` listener: hash khớp `#tab-desc|info|reviews` → activate tab đó, hash rỗng/không khớp → ignore (giữ state — browser back); bỏ nav `:target` + toàn bộ css `:target`/`:has` block (app.css L1592-1650); no-JS fallback: chỉ panel đầu hiện (1 dòng css), tab switching là enhancement — chấp nhận; panels thêm `scroll-margin-top` (sticky header không che đỉnh khi deep-link). PDP page (server): meta đổi span "(N đánh giá)" → **link `<a href="#tab-reviews">{N} {copy.reviews}</a>`** (accessible name chứa "đánh giá" — e2e review-flow click được).
- [ ] **Step 3 (P1 critic):** PDP perk emoji ✓/🚚 (page.tsx L252-262) → icon: `check` dùng Icon primitive; "ship" không có trong catalog 24 names → inline SVG storefront (precedent Header), icon tròn 30 nền `--tint-primary-bg` per §2.3.
- [ ] **Step 4:** Sticky ATC mobile <600px: css `.pdp-cta-row { position: sticky; bottom: 0; background: var(--c-surface); border-top + --shadow-2 }` trong media query — 1 instance, cùng handler (approach đã chốt §4).
- [ ] **Step 5 (P1 critic — exit criteria e2e-compat):** vitest (addtocart.test giữ xanh) + lint xanh; `grep -n "pdp-toast\|#tab-\|name: 'Đánh giá'" frontend/e2e/tests/nav-honesty.spec.ts frontend/e2e/tests/review-flow.spec.ts` — đối chiếu markup mới vẫn thỏa (`.pdp-toast[role="status"]` còn; link tên "Đánh giá" còn); nếu dev stack sống → chạy thử `pnpm -C frontend/e2e exec playwright test nav-honesty review-flow` trước commit. → commit `feat(storefront): PDP tabs keyboard + toast direction §3.2 + sticky ATC mobile (FI-392)`.

### Task 9: pdp-review-modal-uikit-focus-trap-esc (nhóm C)

**Files:** `components/reviews/WriteReviewModal.tsx` (+ host `WriteReviewControl.tsx` nếu lifecycle cần), shim.

- [x] **Step 1:** Bọc `rv-overlay`/`rv-modal` tự viết bằng primitive `Modal` (`open` luôn true khi mounted, `onClose`, `title`, size): focus-trap + ESC + restore focus có sẵn useOverlay; xóa overlay/modal css tự viết (giữ css form bên trong: stars/inputs/error).
- [x] **Step 2:** GIỮ logic: ensureSession boot + guest CTA (link shellUrl — `<a>`), 409 duplicate, 202 pending, error role=alert, interactive stars local (StarRating readOnly không dùng được input). Loading state khi guest===null → Modal với spinner text.
- [x] **Step 3:** Kiểm host (WriteReviewControl/MyPendingReviewPanel) lifecycle onClose/onSubmitted không đổi; Modal render `role="dialog"` + `aria-labelledby` từ `title` — accessible name phải khớp `/Viết đánh giá/` (e2e review-flow `getByRole('dialog', {name})`); giữ `.rv-star` buttons + button "Gửi đánh giá" (selector e2e).
- [x] **Step 4 (exit e2e-compat):** vitest + lint xanh; nếu dev stack sống → `pnpm -C frontend/e2e exec playwright test review-flow` thử trước commit → commit `feat(storefront): review modal → ui-kit Modal focus-trap/ESC/restore (FI-392)`.

### Task 10: search-coupons-polish-empty-copybutton (nhóm C)

**Files:** `app/[locale]/search/page.tsx`, `app/[locale]/coupons/page.tsx`, `components/coupons/CopyButton.tsx`, css.

- [x] **Step 1:** Search §4: empty state emoji icon 48px muted + eyebrow + nút outline "Xóa bộ lọc"/chips gợi ý — chips hiện có polish (pill, hover wash); loading 6 ProductCardSkeleton (T2 đã làm loading.tsx — kiểm đủ).
- [x] **Step 2:** Coupons §4: card dùng product-card shell (shadow-1, hover −3px shadow-3); mã coupon khối border DASHED radius-md; CopyButton style cta-outline; badge hết hạn tint-new (nếu có dữ liệu expiry — hiện có HSD text; giữ text, thêm pill tint khi hết hạn chỉ khi parse được date).
- [x] **Step 3:** CopyButton i18n fix L59: vi "Sao chép" / en "Copy" (giữ nguyên giá trị copied hiện có: vi "Đã copy" / en "Copied!" — P2 critic: đừng đổi copy vô ích); copy thành công → toast pop qua useToast (§4: "bấm copy → toast pop") + GIỮ trạng thái inline (progressive).
- [x] **Step 4:** vitest + lint xanh → commit `feat(storefront): search/coupons polish + CopyButton i18n + toast (FI-392)`.

### Task 11: footer-newsletter-tokenize-recentlyviewed-decss (nhóm C)

**Files:** `components/{Footer,NewsletterForm,RecentlyViewed}.tsx`, css.

- [x] **Step 1:** NewsletterForm: bỏ 6 chỗ hex inline (`#bbb/#7ed957/#222/#444/#F53D2D/#ff7b6b`) → css class mới qua tokens (`--c-text-muted`, `--c-success`, surface/border tokens, `--c-primary`, `--c-danger`); markup giữ nguyên (data-testid `newsletter-*` GIỮ — e2e engagement? platform-asserts? — grep trước).
- [x] **Step 2:** RecentlyViewed: bỏ inline-style toàn bộ (L44-82) → css class; card dùng `.p-card` anatomy (thumb/body/price) + gradient qua `categoryGradient(slug)` (không dùng GRADIENTS hex array tự vẽ); Link T1 đã migrate (kiểm).
- [x] **Step 3:** Footer polish §2.2.5: nền `--c-text`, link `--c-text-muted`... kiểm css hiện có theo direction, bổ sung gap/hover accent thiếu.
- [x] **Step 4:** vitest + lint xanh → commit `feat(storefront): newsletter/recently-viewed tokenize + deCSS + footer polish (FI-392)`.

### Task 12: i18n-consolidate-copy-objects-aria-labels (nhóm D)

**Files:** mới `lib/i18n.ts` + `tests/i18n.test.ts`; 12+ file COPY (Header, SearchBar, PDP page, PdpBuyBox, AddToCart (COPY export GIỮ — re-export từ i18n), search, coupons, StockAlertInput, WriteReviewModal, MyPendingReviewPanel, WriteReviewControl, WishlistHeart, NewsletterForm, RecentlyViewed, HeroCarousel, LocaleSwitcher, ThemeToggle, Footer, CategoryTiles, home page inline copy, not-found ×2, SortSelect, Toolbar, Gallery, Countdown aria).

- [x] **Step 1:** Thiết kế `lib/i18n.ts`: catalogs grouped theo miền (`header`, `home`, `hero`, `plp`, `pdp`, `search`, `coupons`, `footer`, `reviews`, `common`) — mỗi key `Record<Locale, string>`; export `t(locale, key)` typed (key union từ catalogs) + helper `useT` KHÔNG cần (components nhận locale prop sẵn). Type-safe: `keyof` catalogs.
- [x] **Step 2:** Migrate từng component COPY → import i18n (giữ hành vi; AddToCart `export const COPY` re-export từ i18n để test cũ không vỡ).
- [x] **Step 3:** ~17 aria-label hardcoded → keys vi/en (breadcrumb nav, pagination prev/next/page, countdown timer, carousel arrows/dots, qty stepper −/+, category sections, logo, locale switcher...). Grep `aria-label="` xác nhận 0 hardcoded vi còn lại (trừ label động product name).
- [x] **Step 4:** Test mới `tests/i18n.test.ts`: parity vi/en (mọi key đủ 2 locale, không rỗng) + spot-check vài key.
- [x] **Step 5:** vitest + lint xanh → **2 commit** (P2 critic — rollback unit gọn hơn): `refactor(storefront): COPY objects → lib/i18n module (FI-392)` + `refactor(storefront): aria-label hardcoded → i18n keys vi/en (FI-392)`.

### Task 13: responsive-600-mobile-nav-sticky-atc-grid (nhóm D)

**Files:** css responsive (<600px media queries, dùng `--bp-sm` value 600px — @media không đọc var nên hardcode 600px + comment tham chiếu token), `components/Header.tsx` markup nếu cần.

- [x] **Step 1:** Header <600px: mini-nav scroll-x (đã T3 — hoàn thiện swipe), actions icon-only (ẩn text label), search full-width hàng riêng nếu cần.
- [x] **Step 2:** Hero cao co giãn (min ~240px), title scale xuống.
- [x] **Step 3:** Featured/PLP grid 2-col; flash rail giữ scroll-x; cat-grid 3-col (media ≤900 hiện có — kiểm).
- [x] **Step 4:** PDP: sticky ATC (T8b đã làm — kiểm lại), gallery/pdp-layout 1-col.
- [x] **Step 5:** Footer/newsletter stack dọc.
- [x] **Step 6:** vitest + lint xanh → commit `feat(storefront): responsive <600px mobile pass per spec item 13 (FI-392)`.

### Task 14: breadcrumb-jsonld-sold-count-placeholder-fix (nhóm D)

**Files:** `lib/pdp.ts`, `app/[locale]/p/[slug]/page.tsx`, `app/[locale]/c/[slug]/page.tsx`, `tests/pdp.test.ts` (thêm case).

- [ ] **Step 1:** `lib/pdp.ts` thêm `breadcrumbJsonld(...)`: BreadcrumbList schema (ListItem vị trí 1..n: Trang chủ → categories path → product/category hiện tại), URL absolute `siteUrl() + localePath(...)`; `JSON.stringify(...).replace(/</g, '\\u003c')` — escape breakout script tag (PATTERN BẮT BUỘC, security-P2 precedent FI-391).
- [ ] **Step 2:** Nhúng `<script type="application/ld+json">` PDP (sau Product JSON-LD) + PLP category (breadcrumb Trang chủ → path danh mục).
- [ ] **Step 3:** Fix nói dối "Đã bán": sau T8b, meta đã có link `{N} đánh giá` (span count biến thành link) → **XÓA hẳn span `.pdp-meta-sold` "Đã bán {ratingCount}"** (L241-243 — element nói dối biến mất = hết nói dối; không thay bằng bản sao thứ 2 của "N đánh giá"); bỏ key `sold` khỏi COPY/i18n nếu không còn dùng.
- [ ] **Step 4:** Test: breadcrumbJsonld escape `<` + cấu trúc ListItem; vitest + lint xanh → commit `feat(storefront): BreadcrumbList JSON-LD + honest rating count label (FI-392)`.

### Task 15: walkthrough-screenshots-e2e-golden-nav-green (nhóm D — coordinator chủ trì)

- [ ] **Step 1:** Boot dev stack (gateway + catalog data + storefront :3000; kiểm port trước).
- [ ] **Step 2:** Browser walkthrough 5 màn (home/PLP/PDP/search/coupons) — Rule 0 3 tầng: DOM eval + screenshot mỗi màn + đi trọn flow golden-path (sort/filter/pagination/link KHÔNG trắng trang); mobile 375×667 sweep (sticky ATC, grid 2-col, nav scroll-x); reduced-motion emulation check; screenshot lưu `docs/superpowers/evidence/sf-2/`.
- [ ] **Step 3:** e2e subset: `pnpm -C frontend/e2e exec playwright test golden-path nav-honesty related-products review-flow` (package `@ecommerce/e2e`; P2 critic: filter-by-name không dùng). Storefront dev của worktree NÀY + `E2E_STOREFRONT_URL` override theo helpers/env (nav-honesty header ghi rõ pattern mock-gateway :9099 + storefront GATEWAY_URL trỏ mock) — KHÔNG test nhầm storefront :3000 của main checkout.
- [ ] **Step 4:** Unit tests toàn app storefront xanh + lint xanh.
- [ ] **Step 5:** Fix mọi phát hiện (fix nhỏ trong task; phát hiện lớn → report coordinator) → commit `test(storefront): SF-2 walkthrough evidence + e2e subset green (FI-392)` (chỉ khi có artifact/fix).

---

## ACCEPTANCE → verification map (Phase 5 checklist)

| # | ACCEPTANCE (context pack) | Verify bằng |
|---|---|---|
| 1 | sort/filter/pagination/link home→PLP→PDP→search→coupons không trắng trang; URL đúng; no-JS GET form chạy | Browser flow (Rule 0 tầng 3) + curl no-JS GET |
| 2 | network chậm → skeleton; lỗi → error page vi/en đẹp | Throttle CDP + screenshot; error.tsx |
| 3 | PDP tab chuột+arrow-key không jump; modal focus-trap/ESC/restore; gallery zoom; mobile sticky ATC + grid 2-col | Keyboard walkthrough + screenshot 375px |
| 4 | mọi text/aria-label vi+en; 0 emoji làm icon chrome | i18n parity test + grep + visual sweep |
| 5 | e2e subset XANH + unit tests storefront xanh | playwright + vitest output |
