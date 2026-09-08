# SF-1 design-foundation-motion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nền design-language chung cho cả story FI-390 — tokens v2 (motion/z/bp/gradient/admin-dark), font Be Vietnam Pro self-host cả 2 biên MF, 10 primitives mới + Icon set + skeleton compositions, motion utilities + reduced-motion global, i18n contract `ui.*`, ADR data-testid, tests xanh.

**Architecture:** Tier-0 foundation — mọi mechanism dùng chung sống trong `packages/ui-kit` (+ `packages/i18n` contract); surface SFs (SF-2..5) CHỈ tiêu thụ. @font-face nằm trong tokens.css (url() relative → Vite resolve mọi import site, phủ 2 biên MF không cần thêm import point). Primitives KHÔNG phụ thuộc i18n (dep freeze + server-safe) — label/aria qua props, default tiếng Việt khớp keys `ui.*`.

**Tech Stack:** React 18 + TypeScript (ui-kit, peer-dep react), CSS thuần (tokens + var(--*), cấm hex literal trong ui-kit.css), vitest + @testing-library (jsdom), pnpm workspace. KHÔNG thêm dependency.

**Linear Issue:** FI-391 · **Worktree:** sf-1-design-foundation · **Đích merge:** `story/fi390-uiux-elevation` (KHÔNG main)

**Nguồn sự thật:** `docs/superpowers/contexts/fi390-sf-1.md` (spec slice, amended cycle-2) · `docs/superpowers/designs/fi390-uiux-elevation-direction.md` (hand-off hướng B — NGUỒN SỐ DUY NHẤT cho mọi giá trị motion/breakpoint/gradient). Commit convention hiện có: `<type>(<scope>): <imperative summary>` + footer Co-Authored-By.

---

## 0. Root cause analysis (WHY)

### Root cause
4 app Vite khai `--font-sans: 'Be Vietnam Pro'` nhưng 0 @font-face (render fallback); tokens chỉ có màu/spacing/radius/typography — thiếu motion/z-index/breakpoint/gradient; ui-kit 14 primitives nhưng thiếu ~10 primitive dùng-thật (CartPage/admin hand-roll qty stepper, pagination ×5 nơi, emoji làm icon); ui-kit.css chưa có `prefers-reduced-motion` (0 hit toàn monorepo); css remote chỉ an toàn standalone (bootstrap thiếu import — bài học FI-368 T11).

### Current state (before)
- tokens.css 234 dòng, 3 theme block (storefront/admin/dark), dark KHÔNG declare shadow.
- ui-kit.css 808 dòng, 8 keyframes có sẵn (uk-spin/fade-in/pop-in/drawer-in/slide-in-right/left/toast-in/skeleton-pulse), 0 reduced-motion.
- components/: Badge Button Card Drawer EmptyState Input Modal Price Select Skeleton StarRating Table Tabs Toast + useOverlay. Barrel export đủ. Tests: SSR (uiKit.test.tsx) + jsdom (overlay.test.tsx); tokens.test.ts exact-count regression.
- 4 main.tsx ĐÃ import cả 2 css; 3 bootstrap.tsx: checkout/account chỉ import page.css, admin KHÔNG import css nào.
- i18n catalogs vi/en: namespaces nav/auth/actions/common/admin — chưa có `ui.*`.

### Expected outcome
Acceptance 5 dòng của context pack (font đúng 2 context · demo đầy đủ primitives + 4 theme states · animation + reveal + reduced-motion · 4 trạng thái theme · vitest xanh).

### Constraints & hardships
Brand lock #F53D2D + tint family BẤT BIẾN (Q1) — hex mới DUY NHẤT #0F0F0F (admin-dark) + gradient family hand-off §1.3 · dep freeze (IntersectionObserver hand-roll, primitives không i18n dep) · contracts/** READ-ONLY · không đụng storefront-web/pages/e2e · token-regression exact-count VỠ 7 chỗ khi thêm admin-dark → test update CÙNG commit.

### High-level strategy
Foundation-first tuần tự (tokens → font → boundary → contract → primitives → tests), serialize các task đụng chung ui-kit.css / components/index.ts / UiKitDemo.tsx. Mỗi task = 1 atomic commit = rollback unit.

## 1. Problem
UI/UX hệ thống "thô sơ" vì thiếu nền design language dùng-thật: 4 app không có font thật, không có motion system, thiếu primitives buộc surface hand-roll lặp — SF-2..5 không thể elevation nếu nền sai (SF-1 sai → 4 SF sau truyền sai).

## 2. Scope
- **In:** 14 task dưới (bracket FI-390 block SF-1) — tokens v2, font, 'use client', css 2 biên, 10 primitives, Icon 21, skeleton ×3, motion/reveal/reduced-motion, i18n ui.* + parity, ADR, tests.
- **Out:** storefront-web mọi file (kể cả shim) · pages checkout/account/admin · e2e · backend/contracts · dependency mới · đổi hex/tên token cũ · merge main · assert hiệu ứng surface (tier-gate).
- **Success criteria:** 5 ACCEPTANCE lines context pack — verify Phase 5 từng dòng.

## 3. Touch map
Xem context pack amended (nguồn chính xác). Tóm tắt: `packages/ui-kit/src/{styles/tokens.css, styles/ui-kit.css, assets/fonts/*, components/*, components/index.ts, demo/UiKitDemo.tsx, __tests__/*}` · `packages/i18n/src/{catalogs/{vi,en}.ts, __tests__/i18n.test.ts}` · 3× `apps/mfe-{checkout,account,admin}/src/bootstrap.tsx` · `docs/adr/0007-*`. READ-ONLY: mọi thứ khác.

Consumers/regression: `tokens.test.ts` (7 exact-count assertion — cập nhật Task 1 cùng commit) · storefront-web layout.tsx import tokens.css (dark shadows đổi live — chấp nhận theo hand-off §1.4) · shim comment stale (SF-2 own) · shell ThemeToggle 2-state (shell-owned, KHÔNG đụng — demo switcher riêng).

## 4. Design
- **Approach:** Direction A (Phase 0) — foundation-first tuần tự + @font-face trong tokens.css + reveal progressive-enhancement. Phủ 2 biên MF với 0 import point mới cho font; tokens land trước mọi primitive.
- **Alternatives loại:** fonts.css riêng + 7-8 import sites (nhiều edge — FI-368-class risk); barrel side-effect css import (đảo contract, kéo css vào RSC graph); CSS-default-hidden reveal (SSR/no-JS invisible).
- **Edge cases / second-order:** `@media` không đọc var(--bp-*) → hardcode px; admin-dark duplicate values → 7 assertion vỡ (Task 1); reduced-motion global chạm cả page-level (page.css 0 keyframes — an toàn); format rgba `0.4` (leading zero) align tokens.css convention; duplicate css import 2 biên vô hại (dedupe).
- **Non-functional:** perf (10 woff2 ~106KB, display:swap) · a11y (keyboard Stepper/Tabs/Pagination, aria-current, focus-visible có sẵn) · i18n (ui.* vi/en song song + parity test) · security (không có user-input surface; OFL vendored).

## 5. Implementation outline

**Execution order (14 tasks = 14 bracket names, đánh số theo THỨ TỰ CHẠY; tuần tự — không parallel worker vì cùng đụng ui-kit.css/index.ts/UiKitDemo.tsx):**

| # | Bracket task name | Đụng file chính |
|---|---|---|
| 1 | tokens-v2-motion-zindex-breakpoint-update-regression-test-direction-doc | tokens.css + tokens.test.ts |
| 2 | font-face-selfhost-vite-4apps-both-mf-boundaries | tokens.css + assets/fonts/* |
| 3 | use-client-stateful-primitives-thu-hep-shim | Modal/Drawer/Tabs/Toast/Select |
| 4 | ui-kit-css-both-boundaries-5-import-sites-barrel-exports | 3× bootstrap.tsx |
| 5 | i18n-contract-primitive-keys-parity-test-testid-adr | catalogs vi/en + i18n.test.ts + docs/adr/0007 |
| 6 | primitive-quantity-stepper | QuantityStepper.tsx + css + barrel + demo + test |
| 7 | primitive-pagination-url-and-client | Pagination.tsx + css + barrel + demo + test |
| 8 | primitive-breadcrumbs-iconbutton-alert | Breadcrumbs + IconButton + Alert + css + barrel + demo + test |
| 9 | primitive-form-controls-checkbox-radio-textarea | Checkbox/Radio/RadioGroup/Textarea + css + barrel + demo + test |
| 10 | primitive-stepper-keyboard | Stepper.tsx + css + barrel + demo + test |
| 11 | icon-svg-set-component-catalog | Icon.tsx + catalog + css + barrel + demo + test |
| 12 | skeleton-compositions-loading-pattern | 3 compositions + shimmer upgrade + demo + test |
| 13 | motion-utilities-reduced-motion-global-scroll-reveal-hook | ui-kit.css + useReveal + demo (reveal + 4-state switcher) |
| 14 | unit-tests-primitives-tabs-keyboard-regression | Tabs keyboard test + full-suite consolidation |

**File structure:** primitives mới ở `packages/ui-kit/src/components/<Name>.tsx` (PascalCase, named export, interface `<Name>Props`, pattern khớp Input.tsx: `useId`, className join helper, aria đầy đủ). CSS uk-* thêm CUỐI ui-kit.css trước block dark-badge override (giữ organize: section comment `/* ── <Primitive> (SF-1 FI-391) */`). Demo sections thêm trong UiKitDemo.tsx DemoInner (pattern `<section className="uk-demo__section">`).

**Testing strategy:** SSR renderToStaticMarkup (mặc định — chạy được trong jsdom env) cho markup/aria/tint classes; jsdom RTL fireEvent cho interaction (keyboard, click, IO mock); token-regression đọc file css (countDef pattern có sẵn). Suite: `pnpm vitest run` chạy TRONG từng package (`cd frontend/packages/ui-kit && pnpm vitest run`, `cd frontend/packages/i18n && pnpm vitest run` — chạy từ workspace root sẽ bỏ qua vitest.config.ts jsdom) — xanh sau MỖI task.

## 6. Risks & unknowns
- **Must verify:** Vite resolve url() font qua cả 2 biên (browser-verify Phase 5 acceptance #1) · admin-dark hiển thị qua demo switcher (acceptance #4) · reduced-motion emulate OS-level (Playwright/CDP emulation hoặc devtools) · Vitest mock IntersectionObserver + matchMedia cho useReveal test.
- **Unverified assumptions (đã giảm thiểu):** next/font hashed family không xung đột @font-face 'Be Vietnam Pro' (coexist chuẩn) · woff2 v12 gstatic ổn định (đã tải staging `/tmp/bvp-fonts/files/` — nếu mất, recipe download có ở Task 2) · duplicate tokens.css import qua bootstrap không vỡ Vite css pipeline (FI-368 T11 đã chứng minh pattern với page.css).

---

## Tasks

### Task 1: Tokens v2 — motion/z-index/breakpoint/gradient/admin-dark + regression

**Files:**
- Modify: `frontend/packages/ui-kit/src/styles/tokens.css`
- Modify: `frontend/packages/ui-kit/src/__tests__/tokens.test.ts`

Giá trị NGUỒN: hand-off §1.2–§1.5 (đã liệt kê đủ dưới đây — không sáng tạo thêm).

- [x] **Step 0: Pre-flight môi trường** — worktree chưa có node_modules: `cd frontend && pnpm install` (mỗi lần đầu). Verify `cd frontend/packages/ui-kit && pnpm vitest run` chạy được (suite cũ xanh) TRƯỚC khi sửa bất cứ gì.

- [x] **Step 1: Thêm motion + z-index + breakpoints vào block `:root, [data-theme='storefront']`** (sau section Elevation, comment `/* ── Tokens v2 (SF-1 FI-391) — hand-off §1.2 */`):

```css
  /* Motion durations (hand-off §1.2) */
  --dur-fast: 140ms;
  --dur-base: 180ms;
  --dur-slow: 260ms;
  --dur-carousel: 450ms;
  --dur-kb: 16s;
  --dur-shimmer: 1.3s;
  --dur-float: 6s;

  /* Easing (hand-off §1.2) */
  --ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);
  --ease-pop: cubic-bezier(0.34, 1.4, 0.4, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0.3, 1.08);

  /* Z-index scale (hand-off §1.2) */
  --z-header: 100;
  --z-dropdown: 200;
  --z-drawer: 300;
  --z-toast: 400;

  /* Breakpoints (hand-off §1.2) — doc/JS reference; @media KHÔNG đọc var() */
  --bp-sm: 600px;
  --bp-md: 960px;
  --bp-lg: 1240px;
```

LƯU Ý: easing cubic-bezier viết `0.22` (leading zero, convention file). Chỉ trong :root/storefront — admin/dark KHÔNG re-declare (cascade). `--dur-float` giữ trong file dù hiện chưa dùng (hand-off liệt kê đầy đủ).

- [x] **Step 2: Thêm gradient + CTA shadow tokens vào cùng block** (hand-off §1.3 — hex dẫn xuất family FI-310, hex mới DUY NHẤT được phép ngoài #0F0F0F: không có — gradient dùng đúng hex liệt kê):

```css
  /* Gradients + CTA shadow (hand-off §1.3 — family FI-310 §1.8) */
  --grad-cta: linear-gradient(90deg, #F53D2D, #FF7A45);
  --grad-flash: linear-gradient(180deg, #FFD839, #FFB800);
  --grad-hero-1: linear-gradient(120deg, #F53D2D, #FF7A45);
  --grad-hero-2: linear-gradient(120deg, #CB1B00, #F53D2D);
  --grad-hero-3: linear-gradient(120deg, #FF512F, #DD2476);
  --grad-cat-dientu: linear-gradient(140deg, #EAF3FF, #D9E9FF);
  --grad-cat-thoitrang: linear-gradient(140deg, #FFEEE8, #FFDFD2);
  --grad-cat-nhacua: linear-gradient(140deg, #E9F7EE, #D8F0E1);
  --grad-cat-sach: linear-gradient(140deg, #FFF7DC, #FFEFBC);
  --grad-cat-lamdep: linear-gradient(140deg, #F4EBFC, #EBDCF8);
  --grad-swatch-den: linear-gradient(140deg, #4a4a4a, #1a1a1a);
  --grad-swatch-trang: linear-gradient(140deg, #ffffff, #ededed);
  --grad-swatch-navy: linear-gradient(140deg, #33507f, #22355c);
  --grad-swatch-be: linear-gradient(140deg, #e6d6b8, #d9c7a7);
  --shadow-cta: 0 4px 12px rgba(245, 61, 45, 0.35);
  --shadow-cta-hover: 0 6px 18px rgba(245, 61, 45, 0.45);
```

Gradient/swatch: giữ nguyên hex lowercase như hand-off viết (chỉ dùng trong test bằng exact-string; không dùng lại ở nơi khác). `--shadow-cta(-hover)` là 2 chỗ rgba primary DUY NHẤT được phép (hand-off §5.2).

- [x] **Step 3: Đè 3 shadow vào block `[data-theme='dark']`** (hand-off §1.4 — dark hiện KHÔNG declare shadow, cascade từ :root):

```css
  /* SF-1 FI-391 §1.4: shadow đậm hơn cho nền tối */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 2px 8px rgba(0, 0, 0, 0.5);
  --shadow-3: 0 8px 24px rgba(0, 0, 0, 0.6);
```

- [x] **Step 4: Thêm block `[data-theme='admin-dark']` CUỐI file** (hand-off §1.5 — block cuối = source-order thắng, cùng specificity pattern admin/dark). Đủ nội dung theo hand-off §1.5: `--c-bg: #0F0F0F` (hex mới duy nhất), surface/text/muted/border/primary/primary-hover/link/focus/danger/warning/success/accent/on-accent ĐÚNG giá trị §1.5, tint ×3 bộ + wash + star copy đúng block dark hiện có, 6 pill copy đúng block dark, 3 shadow = bộ dark §1.4 (Step 3).

- [x] **Step 5: Cập nhật header comment tokens.css** — dòng "FONT:" bổ sung "self-host qua @font-face ở đầu file này (SF-1 FI-391)"; thêm ref `docs/superpowers/designs/fi390-uiux-elevation-direction.md §1` cạnh ref FI-310; mô tả 4 theme values (`storefront | admin | dark | admin-dark`).

- [x] **Step 6: Cập nhật `tokens.test.ts` CÙNG COMMIT** — sửa 7 exact-count vỡ + thêm assertion mới:
  - Số count thay đổi do admin-dark: `--c-warning #FE9C08` 3→4 · `--c-accent #FFD839` 3→4 · `--c-on-accent #212121` 3→4 · `--c-link #FF6B54` 1→2 · `--c-text-muted #9E9E9E` 1→2 · `--c-border #2C2C2C` 1→2 · `--c-danger #FF5A5A` 1→2.
  - THÊM: `countDef('--c-bg', '#0F0F0F')` = 1 (admin-dark duy nhất); dark shadows `0 1px 2px rgba(0, 0, 0, 0.4)` = **2** (dark + admin-dark — `admin-dark` KHÔNG cascade từ `dark` vì khác attribute value, hand-off §1.5 ghi "shadow = bộ dark §1.4" = re-declare trong block; tương tự 0.5/0.6 = 2); `--dur-fast: 140ms` = 1, `--dur-base: 180ms` = 1, `--dur-slow: 260ms` = 1; `--ease-pop` = 1; `--z-toast: 400` = 1; `--bp-md: 960px` = 1; `--grad-cta` contains `#F53D2D` (substring assert trên css); `--shadow-cta: 0 4px 12px rgba(245, 61, 45, 0.35)` = 1. describe mới `'tokens v2 — SF-1 FI-391 (hand-off §1.2-§1.5)'`.

- [x] **Step 7: Run** `cd frontend/packages/ui-kit && pnpm vitest run` → PASS. Commit:
```bash
git add frontend/packages/ui-kit/src/styles/tokens.css frontend/packages/ui-kit/src/__tests__/tokens.test.ts
git commit -m "feat(ui-kit): tokens v2 — motion/z/bp/gradient/admin-dark (FI-391 T1, hand-off §1.2-§1.5) + regression cùng commit"
```

### Task 2: @font-face Be Vietnam Pro self-host (5 weights × 2 subsets)

**Files:**
- Create: `frontend/packages/ui-kit/src/assets/fonts/be-vietnam-pro-{400,500,600,700,800}-{latin,vietnamese}.woff2` (10 file, ~106KB tổng — OFL)
- Modify: `frontend/packages/ui-kit/src/styles/tokens.css` (đầu file, trước `:root`)

- [x] **Step 1: Copy woff2 vào repo** — staging có sẵn `/tmp/bvp-fonts/files/*.woff2` (`mkdir -p frontend/packages/ui-kit/src/assets/fonts && cp /tmp/bvp-fonts/files/*.woff2 frontend/packages/ui-kit/src/assets/fonts/`; nếu staging mất: `curl -s -A "Mozilla/5.0 ... Chrome/120"` GET `https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap`, parse 10 URL khối `/* vietnamese */` + `/* latin */`, tải về đặt tên `be-vietnam-pro-<weight>-<subset>.woff2`). Verify: `file *.woff2` = "Web Open Font Format (Version 2)". KHÔNG commit file NON-woff2.

- [x] **Step 2: Thêm 10 @font-face block ĐẦU tokens.css** — template (lặp 5 weights × 2 subsets; unicode-range giống hệt nhau giữa các weight):

```css
/* ── @font-face Be Vietnam Pro (SF-1 FI-391 — hand-off §1.6) — self-host OFL
 * (Google Fonts). url() RELATIVE → Vite resolve + hash ở mọi import site,
 * phủ cả 2 biên MF (standalone main.tsx + host bootstrap) không cần thêm
 * import point. storefront-web KHÔNG dùng (next/font riêng, không xung đột). */
@font-face {
  font-family: 'Be Vietnam Pro';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./assets/fonts/be-vietnam-pro-400-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
    U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
    U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Be Vietnam Pro';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./assets/fonts/be-vietnam-pro-400-vietnamese.woff2') format('woff2');
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1,
    U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329,
    U+1EA0-1EF9, U+20AB;
}
/* ... lặp cho 500/600/700/800 — chỉ đổi font-weight + tên file ... */
```

- [x] **Step 3: Run** `cd frontend/packages/ui-kit && pnpm vitest run` (tokens.test đọc text — @font-face không ảnh hưởng countDef) → PASS. Commit (git add tokens.css + 10 woff2):
```bash
git add frontend/packages/ui-kit/src/styles/tokens.css frontend/packages/ui-kit/src/assets/fonts/
git commit -m "feat(ui-kit): @font-face Be Vietnam Pro self-host 400-800 vietnamese+latin (FI-391 T2)"
```

### Task 3: 'use client' cho stateful primitives

**Files:**
- Modify: `frontend/packages/ui-kit/src/components/Modal.tsx`, `Drawer.tsx`, `Tabs.tsx`, `Toast.tsx`, `Select.tsx` — thêm `'use client';` dòng 1 (trước import, sau không có gì).

- [x] **Step 1:** Thêm directive `'use client';` chính xác dòng đầu 5 file stateful. KHÔNG đụng StarRating/EmptyState/Badge/Price/Card/Skeleton/Price/Input/Button (server-safe — Input/Button là pure render, state do consumer giữ). KHÔNG đụng shim `apps/storefront-web/components/ui-kit.ts` (SF-2 own — comment shim tự stale, chấp nhận).
- [x] **Step 2: Run** `cd frontend/packages/ui-kit && pnpm vitest run` ('use client' là no-op trong vitest — chỉ bảo đảm không vỡ) → PASS. Commit:
```bash
git add frontend/packages/ui-kit/src/components/Modal.tsx frontend/packages/ui-kit/src/components/Drawer.tsx frontend/packages/ui-kit/src/components/Tabs.tsx frontend/packages/ui-kit/src/components/Toast.tsx frontend/packages/ui-kit/src/components/Select.tsx
git commit -m "feat(ui-kit): 'use client' cho 5 primitive stateful — RSC-safe (FI-391 T3)"
```

### Task 4: ui-kit css cả 2 biên — 3 bootstrap.tsx

**Files:**
- Modify: `frontend/apps/mfe-checkout/src/bootstrap.tsx`, `frontend/apps/mfe-account/src/bootstrap.tsx`, `frontend/apps/mfe-admin/src/bootstrap.tsx`

- [x] **Step 1:** Mỗi file thêm 2 dòng import cạnh `import './page.css'` (admin KHÔNG có page.css — thêm vào cụm import đầu):
```ts
// SF-1 FI-391: ui-kit css cả 2 biên MF (FI-368 T11 — remote standalone qua
// bootstrap không chạy main.tsx; dưới shell dedupe vô hại với import của host).
import '@ecommerce/ui-kit/tokens.css';
import '@ecommerce/ui-kit/styles.css';
```
- [x] **Step 2: Verify typecheck** `pnpm -r --filter @ecommerce/mfe-checkout --filter @ecommerce/mfe-account --filter @ecommerce/mfe-admin exec tsc --noEmit` (hoặc build script tương đương hiện có) → sạch. Commit:
```bash
git add frontend/apps/mfe-checkout/src/bootstrap.tsx frontend/apps/mfe-account/src/bootstrap.tsx frontend/apps/mfe-admin/src/bootstrap.tsx
git commit -m "feat(apps): ui-kit css import host-biên 3 bootstrap (FI-391 T4)"
```

### Task 5: i18n contract `ui.*` + parity test + ADR data-testid

**Files:**
- Modify: `frontend/packages/i18n/src/catalogs/vi.ts`, `frontend/packages/i18n/src/catalogs/en.ts`, `frontend/packages/i18n/src/__tests__/i18n.test.ts`
- Create: `docs/adr/0007-data-testid-convention.md` (repo root docs/adr — số tiếp sau file cao nhất hiện có, verify trước khi đặt tên)

- [x] **Step 1: Thêm namespace `ui` vào vi.ts** (top-level, additive — sau `common`, trước `admin`; comment `// ── SF-1 FI-391 — keys mặc định primitives ui-kit (surfaces truyền t('ui.*') vào props)`):

```ts
  ui: {
    pagination: {
      label: 'Phân trang',
      prev: 'Trang trước',
      next: 'Trang sau',
      page: 'Trang {{page}}',
      pageOf: 'Trang {{page}}/{{total}}'
    },
    breadcrumbs: {
      label: 'Bạn đang ở:',
      home: 'Trang chủ'
    },
    quantityStepper: {
      label: 'Số lượng',
      increase: 'Tăng số lượng',
      decrease: 'Giảm số lượng'
    },
    stepper: {
      label: 'Tiến trình',
      step: 'Bước {{current}}/{{total}}',
      done: 'Hoàn thành'
    },
    alert: {
      dismiss: 'Đóng thông báo'
    }
  },
```

- [x] **Step 2: Thêm `ui` ĐỒNG BỘ CẤU TRÚC vào en.ts**:

```ts
  ui: {
    pagination: {
      label: 'Pagination',
      prev: 'Previous page',
      next: 'Next page',
      page: 'Page {{page}}',
      pageOf: 'Page {{page}} of {{total}}'
    },
    breadcrumbs: {
      label: 'You are here:',
      home: 'Home'
    },
    quantityStepper: {
      label: 'Quantity',
      increase: 'Increase quantity',
      decrease: 'Decrease quantity'
    },
    stepper: {
      label: 'Progress',
      step: 'Step {{current}}/{{total}}',
      done: 'Done'
    },
    alert: {
      dismiss: 'Dismiss notification'
    }
  },
```

- [x] **Step 3: Parity test structural** — thêm describe vào `i18n.test.ts`: walk đệ quy keys object vi vs en (so TẤT CẢ top-level namespace, không chỉ ui) → `expect(enKeys).toEqual(viKeys)` (set đường dẫn key tuyệt đối, sort trước khi so). Fail message in key lệch đầu tiên.

- [x] **Step 4: ADR `0007-data-testid-convention.md`** — nội dung: Context (e2e ~30 classname selector vỡ khi elevation đổi markup); Decision (semantic classname giữ là contract chính; `data-testid="<surface>-<element>"` chỉ khi rename bất khả kháng; testid theo surface prefix, không theo component — vd `data-testid="plp-pagination-next"`); Consequences (SF-2..5 thêm testid khi rename; SF-6 fix selector vỡ bằng testid fallback); status Accepted; ngày 2026-09-09; ref FI-391.

- [x] **Step 5: Run** `cd frontend/packages/i18n && pnpm vitest run` → PASS. Commit:
```bash
git add frontend/packages/i18n/src/catalogs/vi.ts frontend/packages/i18n/src/catalogs/en.ts frontend/packages/i18n/src/__tests__/i18n.test.ts docs/adr/0007-data-testid-convention.md
git commit -m "feat(i18n): ui.* keys vi/en + parity structural + ADR 0007 data-testid (FI-391 T5)"
```

### Task 6: Primitive QuantityStepper

**Files:**
- Create: `frontend/packages/ui-kit/src/components/QuantityStepper.tsx`
- Modify: `frontend/packages/ui-kit/src/styles/ui-kit.css`, `frontend/packages/ui-kit/src/components/index.ts`, `frontend/packages/ui-kit/src/demo/UiKitDemo.tsx`, `frontend/packages/ui-kit/src/__tests__/uiKit.test.tsx`

- [x] **Step 1: Component** — API:
```tsx
export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;   // default 1
  max?: number;   // default 99
  label?: string;      // default 'Số lượng' (khớp ui.quantityStepper.label)
  increaseLabel?: string;  // default 'Tăng số lượng'
  decreaseLabel?: string;  // default 'Giảm số lượng'
  disabled?: boolean;
  className?: string;
}
```
Markup: `<div className="uk-qty" role="group" aria-label={label}>` + nút `−` (`aria-label={decreaseLabel}`, disabled khi value≤min || disabled, type="button", class `uk-qty__btn`) + `<input type="number" className="uk-qty__value" min max value aria-label={label} onChange>` (parse int, clamp [min,max], ignore NaN) + nút `+`. Controlled thuần (không state nội bộ — value/onChange). Glyph −/+ dùng ký tự &minus; / +.

- [x] **Step 2: CSS** `/* ── QuantityStepper (SF-1 FI-391) */` — `.uk-qty` inline-flex cao 36, nút 36×36 border 1px `--c-border` radius-md nền surface, hover nền `--wash-hover` `--dur-fast`, active scale 0.97 `--ease-pop`; input width 44 text-center border-y riêng (không viền quanh — 3 khối dính liền trong khung chung: `.uk-qty` border + overflow hidden), `appearance: none` ẩn spinner webkit/moz; disabled opacity 0.5. CẤM hex — chỉ var(--*).

- [x] **Step 3: Barrel + demo** — export `QuantityStepper, type QuantityStepperProps`; section demo "QuantityStepper" với `useState(1)` + stepper 1..99 + hiển thị giá trị.

- [x] **Step 4: Test SSR** (uiKit.test.tsx) — render markup chứa role=group, 2 nút aria-label default đúng, input value; test clamp: render value=1 → nút − disabled.

- [x] **Step 5: Run** `cd frontend/packages/ui-kit && pnpm vitest run` → PASS. Commit:
```bash
git add frontend/packages/ui-kit/src/components/QuantityStepper.tsx frontend/packages/ui-kit/src/styles/ui-kit.css frontend/packages/ui-kit/src/components/index.ts frontend/packages/ui-kit/src/demo/UiKitDemo.tsx frontend/packages/ui-kit/src/__tests__/uiKit.test.tsx
git commit -m "feat(ui-kit): primitive QuantityStepper keyboard+aria (FI-391 T6)"
```

### Task 7: Primitive Pagination (URL-driven + client)

**Files:**
- Create: `frontend/packages/ui-kit/src/components/Pagination.tsx`
- Modify: ui-kit.css, components/index.ts, UiKitDemo.tsx, uiKit.test.tsx

- [x] **Step 1: Component** — API 1 component 2 chế độ:
```tsx
export interface PaginationProps {
  page: number;
  totalPages: number;
  /** URL-driven SEO: builder trả href cho trang N — có → render <a> */
  pageHref?: (page: number) => string;
  /** Client: callback — có (và không có pageHref) → render <button> */
  onPageChange?: (page: number) => void;
  label?: string;   // default 'Phân trang' (ui.pagination.label)
  prevLabel?: string;   // default 'Trang trước'
  nextLabel?: string;   // default 'Trang sau'
  pageLabel?: (page: number) => string;  // default `Trang ${page}` — aria cho số trang
  className?: string;
}
```
Window ±2 có đầu/cuối + ellipsis (logic tự chứa trong file — không import từ storefront-web): pages = [1, page-1, page, page+1, totalPages] unique 1..totalPages sort; chèn `…` khi gap >1. totalPages ≤1 → null. prev hiện khi page>1 (rel="prev", aria-label prevLabel), next khi page<totalPages (rel="next"). URL mode: `<a>` class `uk-page` + `uk-page--active` + `aria-current="page"`. Client mode: `<button type="button">`. Nav: `<nav className="uk-pagination" aria-label={label}>`.

- [x] **Step 2: CSS** — `.uk-pagination` flex gap 4; `.uk-page` 32×32 radius-md border 1px `--c-border` nền surface `--text-sm`; hover nền `--wash-hover` `--dur-fast`; active: nền `--c-primary` chữ trắng border transparent; ellipsis `.uk-page--dots` borderless. (32×32 là size primitive mặc định — hand-off §2.5 admin dùng nút 30×30: SF-5 override qua css riêng nếu cần khớp anatomy admin; size nằm ngoài §1.2-§1.5 nên là dev latitude.)

- [x] **Step 3: Barrel + demo** — demo section client-mode (useState page, totalPages 12, reset scroll không cần); render kèm text "Trang N/12" để verify.

- [x] **Step 4: Test SSR** — cả 2 chế độ: URL mode render `<a href>` đúng pageHref(2) khi page=2 + aria-current; client mode render button + không có href; totalPages=1 → markup rỗng; window ellipsis xuất hiện khi totalPages>7 (assert ký tự `…` trong markup). Test jsdom nhỏ: click nút page 3 → onPageChange(3).

- [x] **Step 5: Run** vitest → PASS. Commit tương tự (git add 5 file). Message: `feat(ui-kit): primitive Pagination URL+client dual-mode (FI-391 T7)`.

### Task 8: Primitives Breadcrumbs + IconButton + Alert

**Files:**
- Create: `frontend/packages/ui-kit/src/components/Breadcrumbs.tsx`, `IconButton.tsx`, `Alert.tsx`
- Modify: ui-kit.css, components/index.ts, UiKitDemo.tsx, uiKit.test.tsx

- [x] **Step 1: Breadcrumbs** — API:
```tsx
export interface BreadcrumbItem { label: string; href?: string }
export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  label?: string;      // default 'Bạn đang ở:' (ui.breadcrumbs.label)
  separator?: ReactNode; // default chevron ‹svg 12px currentColor› — KHÔNG dùng Icon component (tránh circular dep)
  className?: string;
}
export function breadcrumbJsonld(items: BreadcrumbItem[]): string  // JSON.stringify schema.org BreadcrumbList, Position 1-based, item coi href tuyệt đối do caller truyền
```
Render: `<nav className="uk-breadcrumbs" aria-label={label}><ol>` — item cuối `aria-current="page"` (span, không link); item giữa: href có → `<a>`, không → `<span>`; separator `<li aria-hidden="true" className="uk-breadcrumbs__sep">` giữa các item. JSON-LD helper thuần (string), dùng trong script tag do consumer render.

- [x] **Step 2: IconButton** — API:
```tsx
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** BẮT BUỘC — aria-label; thiếu → dev-warn console.error (không crash) */
  'aria-label': string;
  size?: 'sm' | 'md';   // default md (sm 28, md 36)
  variant?: 'ghost' | 'outline';  // default ghost
  children: ReactNode;  // svg/icon thuần
}
```
Class `uk-icon-btn uk-icon-btn--sm/md uk-icon-btn--ghost/outline`. CSS: vuông, radius-md, hover nền `--wash-hover` chữ `--c-link` `--dur-fast`, active scale .92 `--ease-pop`; outline variant border 1px `--c-border`. focus-visible outline có sẵn global `--c-focus` (verify rule `:focus-visible` tồn tại trong ui-kit.css — nếu chỉ ở .uk-btn thì thêm cho .uk-icon-btn).

- [x] **Step 3: Alert** — API:
```tsx
export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'danger';  // default info
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;   // optional trái; KHÔNG default (giữ server-safe thuần)
  dismissible?: boolean; onClose?: () => void;   // dismiss → null (client-tiny: useState — thêm 'use client')
  dismissLabel?: string;  // default 'Đóng thông báo' (ui.alert.dismiss) — aria cho nút ×
  className?: string;
}
```
Tint map (QUYẾT ĐỊNH CHỐT — chỉ token, trong brand lock): info = `--tint-primary-bg` nền + `--tint-primary-text` chữ + `--tint-primary-border` viền · success = `--tint-success-bg/text/border` · warning = `--tint-new-bg` nền + `--tint-new-text` chữ + `--tint-new-border` viền · danger = `--pill-cancelled-bg` nền + `--pill-cancelled-text` chữ + `--pill-cancelled-bg` viền. Role: `role="alert"` khi variant danger, ngược lại `role="status"`. CSS `.uk-alert` radius-md border 1px padding 12 16, text `--text-sm`.

- [x] **Step 4: Barrel + demo (3 section) + test SSR** — Breadcrumbs: aria-label, aria-current cuối, JSON-LD string valid JSON chứa "BreadcrumbList"; IconButton: aria-label bắt buộc render, warn khi thiếu (spy console.error); Alert: 4 variant class + role đúng.

- [x] **Step 5: Run** vitest → PASS. Commit: `feat(ui-kit): primitives Breadcrumbs/IconButton/Alert (FI-391 T8)`.

### Task 9: Form controls — Checkbox, Radio/RadioGroup, Textarea

**Files:**
- Create: `frontend/packages/ui-kit/src/components/Checkbox.tsx`, `Radio.tsx` (Radio + RadioGroup cùng file), `Textarea.tsx`
- Modify: ui-kit.css, components/index.ts, UiKitDemo.tsx, uiKit.test.tsx

- [x] **Step 1: Checkbox** — API `{ label?: string; error?: string; hint?: string; id?: string; className?: string } & InputHTMLAttributes<HTMLInputElement>` — pattern Input.tsx (`useId`, `aria-invalid`, `aria-describedby` error>hint, `.uk-error` role=alert / `.uk-hint`). Markup `.uk-check`: `<input type="checkbox" className="uk-check__input">` + custom box `.uk-check__box` (aria-hidden) + label text. Custom box: 18×18 border 1.5px `--c-border` radius-sm; `:checked + .uk-check__box` nền `--c-primary` border `--c-primary` + checkmark `::after` (border-right/bottom trắng rotate 45deg — KHÔNG svg); `:focus-visible + .uk-check__box` ring `0 0 0 3px --tint-primary-bg`. Input visually-hidden (position absolute opacity 0 — GIỮ focusable, không display:none).

- [x] **Step 2: Radio + RadioGroup** — Radio: pattern Checkbox (`.uk-radio`, custom box tròn, `:checked + box` chấm tròn trắng `::after`). RadioGroup:
```tsx
export interface RadioGroupProps {
  label?: string;
  name: string;   // fallback tự sinh useId nếu bỏ trống
  value?: string; defaultValue?: string; onChange?: (v: string) => void;
  error?: string; hint?: string;
  children: ReactNode;  // <Radio value="a">…</Radio>
  className?: string;
}
```
RadioGroup render `role="radiogroup"` + `aria-labelledby` label; provide name qua Context (radio trong group không cần prop name riêng); error/hint id describedby như Input.

- [x] **Step 3: Textarea** — copy pattern Input.tsx: `{ label?, error?, hint?, id?, className? } & TextareaHTMLAttributes<HTMLTextAreaElement>`, class `uk-textarea` (CSS: giống .uk-input + min-height 80, resize vertical), `.uk-field` wrapper.

- [x] **Step 4: Barrel + demo (3 section) + test SSR** — label/id/for khớp, aria-describedby khi error, radio group name xuyên suối, checked state render.

- [x] **Step 5: Run** vitest → PASS. Commit: `feat(ui-kit): form controls Checkbox/Radio/RadioGroup/Textarea (FI-391 T9)`.

### Task 10: Primitive Stepper (keyboard-OK)

**Files:**
- Create: `frontend/packages/ui-kit/src/components/Stepper.tsx`
- Modify: ui-kit.css, components/index.ts, UiKitDemo.tsx, uiKit.test.tsx (thêm jsdom keyboard test cho Stepper)

- [x] **Step 1: Component** — API:
```tsx
export interface StepperStep { key: string; label: string }
export interface StepperProps {
  steps: StepperStep[];
  current: number;               // index bước hiện tại
  onStepClick?: (index: number) => void;  // có → nút step DONE (index < current) click-able; chưa tới → disabled
  label?: string;                // default 'Tiến trình' (ui.stepper.label)
  className?: string;
}
```
Markup: `<ol className="uk-stepper" aria-label={label}>` — mỗi `<li className="uk-stepper__step">` chứa `<button type="button" className="uk-stepper__dot" aria-current={i===current?'step':undefined} aria-label={\`${i+1}. ${label}\`} disabled={i>current || !onStepClick} onKeyDown>`; state class: `--done` (i<current), `--current`, future. onKeyDown: ArrowRight/Left di chuyển "focus candidate" giữa các nút done/current (roving-lite: move focus, KHÔNG đổi current — đổi current qua click/Enter; Enter/Space = click mặc định của button, không cần handler thêm). Connector: `.uk-stepper__connector` fill scaleX khi done (css `::before/::after` trên li). ĐÂY là sửa nguyên nhân stepper cũ (`role=button` không onKeyDown — pattern nút thật có keyboard miễn phí).

- [x] **Step 2: CSS** (hand-off §2.4): dot 34px tròn border 2px; done: nền `--c-success` trắng + tick `✓` (::after border rotate); current: nền `--c-primary` trắng + ring `0 0 0 5px --tint-primary-bg` + scale 1.08 transition `--dur-base` `--ease-pop`; future: surface border `--c-border` chữ `--c-text-muted`; connector 3px `--radius-full` đoạn xong fill `--c-success` scaleX transition 350ms.

- [x] **Step 3: Demo** — stepper 3 bước ("Giỏ hàng/Thanh toán/Xác nhận") + useState current + nút Lùi/Tiếp để đổi (demo-only controls).

- [x] **Step 4: Test** — SSR: aria-current="step" đúng vị trí, done class; jsdom keyboard: render 3 bước current=1, onStepClick spy — click nút step 0 → spy(0); ArrowRight trên dot 0 → focus dot 1 (assert document.activeElement).

- [x] **Step 5: Run** vitest → PASS. Commit: `feat(ui-kit): primitive Stepper keyboard a11y (FI-391 T10)`.

### Task 11: Icon set — Icon component + catalog 22 icons

**Files:**
- Create: `frontend/packages/ui-kit/src/components/Icon.tsx` (component + `ICON_PATHS` catalog cùng file — catalog là data, tách file không cần)
- Modify: ui-kit.css, components/index.ts, UiKitDemo.tsx, uiKit.test.tsx

- [x] **Step 1: Component** — API:
```tsx
export type IconName =
  | 'cart' | 'user' | 'heart' | 'search' | 'sun' | 'moon' | 'check' | 'x'
  | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'star' | 'trash'
  | 'plus' | 'minus' | 'alert' | 'info' | 'external' | 'logout' | 'settings'
  | 'package' | 'ticket';
export interface IconProps {
  name: IconName;
  size?: number | string;   // default 20 (hand-off §6: range 18-22)
  title?: string;           // có → <title> + role="img"; không → aria-hidden="true" (decorative default)
  className?: string;
}
```
Render `<svg width height viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden|role="img">` + path(s). Catalog: object `Record<IconName, JSX.Element>` path data stroke-based 24×24 — vẽ theo chuẩn Feather-icons geometry (path data tự viết, đơn giản đúng hình; kiểm bằng mắt ở demo). Server-safe (không 'use client').

- [x] **Step 2: CSS** — `.uk-icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }` (svg nhận class).

- [x] **Step 3: Barrel + demo** — section "Icon set": grid 22 icon + tên dưới mỗi icon (dùng catalog keys — thêm IconName list từ object, không hardcode 2 lần).

- [x] **Step 4: Test SSR** — đủ 22 name render không throw (loop IconName); default aria-hidden="true"; với title → role="img" + <title>; size prop → width/height attr.

- [x] **Step 5: Run** vitest → PASS. Commit: `feat(ui-kit): Icon set 22 stroke-based server-safe (FI-391 T11)`.

### Task 12: Skeleton compositions + shimmer upgrade

**Files:**
- Create: `frontend/packages/ui-kit/src/components/skeletons.tsx` (3 compositions cùng file — cùng nhóm trách nhiệm loading)
- Modify: ui-kit.css (shimmer upgrade + compositions), components/index.ts, UiKitDemo.tsx, uiKit.test.tsx

- [x] **Step 1: Shimmer upgrade `uk-skeleton-pulse`** (hand-off §2.5 — giữ tên keyframe/class, đổi rule): `.uk-skeleton` background = `linear-gradient(90deg, var(--wash-hover) 25%, var(--c-border) 50%, var(--wash-hover) 75%)` background-size 240% 100%; keyframe quét `background-position: 120% 0 → -120% 0`, duration `var(--dur-shimmer)` linear infinite. (dark cascade: wash/border đã là token — tự đúng màu tối.)

- [x] **Step 2: Compositions** —
```tsx
export function ProductCardSkeleton({ className }: { className?: string }): ReactElement
// .uk-sk-card: thumb vuông uk-skeleton--rect (aspect 1/1) + 2 dòng text (clamp) + dòng giá (w 60%)
export function TableSkeleton({ rows = 5, cols = 4, className }: { rows?: number; cols?: number; className?: string }): ReactElement
// .uk-sk-table: <div role="table" aria-busy="true" aria-label="Đang tải dữ liệu"> hàng 38px radius-md; KHÔNG dùng <table> thật (chỉ reserve CLS — consumer thay bằng table khi data về)
export function ListSkeleton({ count = 3, className }: { count?: number; className?: string }): ReactElement
// .uk-sk-list: count hàng = circle 40 + 2 dòng text
```
Tất cả compose từ Skeleton primitive có sẵn (variant rect/text/circle) + wrapper div css; aria-hidden nội bộ (Skeleton đã aria-hidden), wrapper có aria-busy.

- [x] **Step 3: Demo** — 3 section skeleton hiển thị cạnh nhau (không bấm được — static).

- [x] **Step 4: Test SSR** — TableSkeleton rows=3 cols=4 → đúng số hàng (count `uk-sk-table__row`), aria-busy="true"; ProductCardSkeleton chứa uk-skeleton class (dùng primitive thật); ListSkeleton count override.

- [x] **Step 5: Run** vitest → PASS. Commit: `feat(ui-kit): skeleton compositions ×3 + shimmer hand-off §2.5 (FI-391 T12)`.

### Task 13: Motion utilities — useReveal + reduced-motion global + demo completion

**Files:**
- Create: `frontend/packages/ui-kit/src/components/useReveal.ts`
- Modify: ui-kit.css (reveal classes + global reduced-motion), components/index.ts, UiKitDemo.tsx (reveal section + switcher 4-state)

- [x] **Step 1: useReveal** (progressive enhancement — KHÔNG CSS-default-hidden):
```tsx
export interface RevealOptions { threshold?: number; delayMs?: number }  // threshold default 0.12 (hand-off §3.2)
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: RevealOptions): RefObject<T>
```
Hành vi: (1) nếu `typeof IntersectionObserver === 'undefined'` → no-op (content visible — SSR/no-JS an toàn); (2) nếu `matchMedia('(prefers-reduced-motion: reduce)').matches` → no-op; (3) else: trên ref element hiện tại mount — add class `uk-reveal uk-reveal--pending` (pending: opacity 0 + translateY(18px)), nếu delayMs → `el.style.transitionDelay = delayMs + 'ms'`; observe với threshold; intersect lần đầu → remove `--pending`, unobserve (1 lần). Return ref để consumer gắn `<div ref={useReveal()}>`. Cleanup disconnect khi unmount.

- [x] **Step 2: CSS** — `.uk-reveal { opacity: 1; transform: none; transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out); }` (transition sẵn, không đổi gì khi không pending) + `.uk-reveal--pending { opacity: 0; transform: translateY(18px); }`. Global reduced-motion CUỐI ui-kit.css:
```css
/* ── prefers-reduced-motion global (SF-1 FI-391 — hand-off §3.3) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .uk-reveal--pending { opacity: 1; transform: none; }
}
```
(câu cuối là belt-and-suspenders — hook đã no-op, css bảo đảm thêm.)

- [x] **Step 3: Demo completion** — (a) section "Scroll reveal": 3 thẻ uk-card dùng useReveal với delayMs 0/70/140 (stagger — cuộn xuống thấy tuần tự); (b) **switcher theme 4-state**: `ThemeName = 'storefront' | 'admin' | 'dark' | 'admin-dark'`, UI = 4 nút (radio group nhỏ) thay toggle đơn; `data-theme` set trên `<html>` như hiện. (Acceptance #4 verify tại đây.)

- [x] **Step 4: Test jsdom useReveal** — mock global IntersectionObserver (class giả capture callback + observe/unobserve spies) + matchMedia mock returns matches:false: render hook qua component thử nghiệm → element có class `uk-reveal uk-reveal--pending`; trigger callback([{isIntersecting: true}]) → class pending biến mất; unobserve được gọi. matchMedia matches:true (reduced-motion) → KHÔNG có class pending. IO undefined (xóa tạm) → không class pending, không crash.

- [x] **Step 5: Run** vitest → PASS. Commit: `feat(ui-kit): useReveal + reduced-motion global + demo 4-state (FI-391 T13)`.

### Task 14: Tabs keyboard test + consolidation full-suite

**Files:**
- Create: `frontend/packages/ui-kit/src/components/__tests__/tabs.test.tsx` (file jsdom test mới — pattern overlay.test.tsx)

- [x] **Step 1: Tabs keyboard test KHÓA hành vi hiện có** (Tabs.tsx:40-80 — KHÔNG sửa logic): render 3 tabs jsdom; focus tab đầu; `fireEvent.keyDown(list, { key: 'ArrowRight' })` → tab 2 `aria-selected=true` + `document.activeElement` = nút tab 2; ArrowLeft từ tab 2 → về tab 1; wrap: ArrowLeft tại tab 1 → tab CUỐI (enabled); disabled item bị skip qua; Home/End KHÔNG được handle hiện tại → test chỉ khóa Arrow behavior (không assert Home/End — không định nghĩa behavior mới).

- [x] **Step 2: Consolidation sweep** — chạy TOÀN BỘ: `pnpm vitest run` chạy TRONG từng package (`cd frontend/packages/ui-kit && pnpm vitest run`, `cd frontend/packages/i18n && pnpm vitest run` — chạy từ workspace root sẽ bỏ qua vitest.config.ts jsdom) → tất cả xanh (SSR + jsdom + tokens regression + i18n parity). `pnpm -r --filter @ecommerce/ui-kit --filter @ecommerce/i18n lint` (tsc --noEmit) sạch. Nếu test nào đỏ → fix root cause (KHÔNG skip test).
- [x] **Step 3: Commit:** `test(ui-kit): Tabs keyboard roving-tabindex lock + suite consolidation (FI-391 T14)`.

---

## Acceptance ↔ Task mapping (Phase 5 verifier dùng)

| ACCEPTANCE (context pack) | Task cung cấp | Verify |
|---|---|---|
| 1. Font Be Vietnam Pro 2 context storefront home + shell checkout | T2 (@font-face trong tokens.css) + T4 (bootstrap import) | browser: computed font-family cả 2 context |
| 2. /ui-kit demo: primitives hoạt động + keyboard + tints + icon | T6-T11 + demo sections | browser: bấm keyboard stepper, đổi trang pagination, 4 tint alert, icon grid |
| 3. Animation + reveal + reduced-motion | T12 shimmer + T13 reveal/global + keyframes có sẵn | browser: toast/pop animate; scroll reveal; emulate reduced-motion → tắt + content đủ |
| 4. 4 theme states không hex lệch | T1 admin-dark + T13 switcher 4-state | browser: demo switcher ×4 chụp screenshots |
| 5. vitest ui-kit + i18n xanh | mọi task + T14 consolidation | pnpm vitest run 2 packages |
