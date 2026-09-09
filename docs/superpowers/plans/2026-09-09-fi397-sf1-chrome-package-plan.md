# Plan: SF-1 chrome-package (FI-398) — 1 nguồn chrome cho Header/Footer/badge/menu/theme

Date: 2026-09-09 | Linear: FI-398 | Worktree: `sf-1-chrome-package` (branch `wakii-dev/sf-1-chrome-package`)
Spec: `docs/superpowers/specs/2026-09-09-fi397-sf1-chrome-package-design.md` · Context pack: `docs/superpowers/contexts/fi397-sf-1.md` · Direction visual: FI-390 (GIỮ, không redesign)

## 0. Root cause analysis (WHY)

### Root cause
2 app (shell Vite + storefront Next) mỗi bên giữ 1 bộ chrome (Header/Footer/ThemeToggle/CartBadge/AuthMenu) + registry shell riêng → không có nguồn duy nhất để sửa 1 chỗ;FI-390 polish cả 2 bộ song song làm chi phí drift tăng (5 Whys: sửa label/theme phải đụng ≥2 file ở ≥2 app → sót → rợt cấp).

### Current state (before)
- Shell: `header/HeaderSlots.ts` registry + `Header.tsx` render slot + `ThemeToggle.tsx` + remote widgets (CartBadge/AuthWidget đăng ký từ bootstrap).
- Storefront: `components/Header.tsx`/`Footer.tsx`/`ThemeToggle.tsx` (Next-specific, SF-4 swap).
- Boot script theme copy ở shell `index.html` + storefront `components/ThemeToggle.tsx`.

### Expected outcome
`@ecommerce/chrome` (TS source) là nguồn duy nhất: shell render Header/Footer từ chrome; badge single-instance (host+remote 1 registry); SSR-able cho Next; theme canonical `ecommerce.theme` + boot script 1 nguồn; labels `chrome.*` sửa 1 chỗ.

### Constraints & hardships
Zero backend/contracts change · dep freeze (0 dep external; workspace links OK) · cookie /api/identity đóng băng · visual GIỮ FI-390 · dev ports +500 (shell 5673, remotes 5675-77, Next 3500) · e2e READ-ONLY (selectors không được vỡ) · admin KHÔNG chrome wrap.

### High-level strategy
Scaffold package mới + move registry + extract components (chrome sở hữu), MFE giữ registration flow qua wrapper — KHÔNG big-bang swap storefront (SF-4 làm); KHÔNG dual-output pipeline (TS source thuần + transpilePackages).

## 1. Problem (intent)
Đội cần 1 nguồn chrome thay 2 bộ code song song đang drift — sửa 1 label/theme/menu phải đúng 1 chỗ và lan tới mọi app.

## 2. Scope
- **In:** 14 task bracket (scaffold, singleton preset, registry move, shell adapter final, SiteHeader SSR, Footer, ThemeToggle canonical + boot script, CartBadge extract, AuthMenu extract, SessionBoot, i18n `chrome.*`, LocaleSwitcher, unit tests, /ui-kit showcase).
- **Out:** packages/auth (SF-2), dev entry (SF-3), Next layout swap + xóa dup storefront (SF-4), pages/** logic, backend, dep external.
- **Success criteria:** 5 dòng ACCEPTANCE context pack (shell Header/Footer từ chrome visual FI-390 · badge từ mfe-checkout trên shell = single-instance · SSR `renderToStaticMarkup` sạch · theme key `ecommerce.theme` + boot script · vitest chrome+i18n xanh + /ui-kit showcase).

## 3. Touch map
 Chi tiết trong spec §2-4 + pack touch map. Tổng:
- **Tạo:** `frontend/packages/chrome/**` (package.json, tsconfig, vitest.config, src/{index,header-slots,site,SiteHeader,Footer,ThemeToggle,CartBadge,AuthMenu,LocaleSwitcher,session-boot}.tsx/ts, src/chrome.css, src/__tests__/**).
- **Sửa:** `packages/config/vite-preset.mjs` (1 dòng), `packages/i18n/src/catalogs/{vi,en}.ts` (chỉ chrome.*), `apps/shell/src/header/{Header.tsx,HeaderSlots.ts}`, `apps/shell/src/main.tsx`, `apps/shell/src/App.tsx` (FLAG F1: render Footer non-admin), `apps/shell/src/pages/UiKitDemoPage.tsx`, `apps/mfe-checkout/src/{bootstrap.tsx,CartBadge.tsx}`, `apps/mfe-account/src/{bootstrap.tsx,AuthWidget.tsx}`, `apps/storefront-web/next.config.mjs` (1 dòng), package.json deps (shell/checkout/account + chrome), xóa `apps/shell/src/ThemeToggle.tsx` (FLAG F2 orphan).
- **Consumers/regression:** shell App (registry bump), RemotePage skeleton, mfe-admin smoke test (HeaderSlots type), e2e nav-honesty (storefront — untouched), walkthrough selectors (data-testid giữ: cart-badge, cart-badge-count, auth-guest, auth-user).
- **Shared surfaces:** window events `ecommerce:header-slots-changed`, `ecommerce:cart-changed` (literal giữ nguyên); localStorage `ecommerce.theme`, `ecommerce.lang` (mới, additive); MF shared map.

## 4. Design
- **Approach:** TS-source package + DI data-access (CartBadge nhận `fetchCart`, AuthMenu nhận `onNavigate`, logout từ `@ecommerce/auth`) + MF singleton 1 dòng — khớp spec §3. Đã dismiss: (a) copy cartApi vào chrome (vi phạm dedup); (b) move cartApi.ts (ngoài touch map, đụng pages); (c) chrome phụ thuộc next/link (Vite vỡ); (d) process.env/import.meta.env trong chrome source (tsc shell vỡ / Next không hỗ trợ).
- **Edge cases:** guest 404 → badge 0; remote down → widget vắng, shell vẫn boot (catch hiện có); private mode storage → try/catch giữ; admin full-bleed không footer; SSR registry rỗng → chỉ props links.
- **Non-functional:** a11y (keyboard menu GIỮ, aria-label từ chrome.*); i18n (vi+en song song, test so key-set); perf (1 instance chrome — chống double-bundle); security (không innerHTML mới — boot script là string tĩnh có kiểm soát; không secret).

## 5. Implementation outline

### Tasks (14 — tick sau khi xong; commit 1 task = 1 commit atomic; **thứ tự trong wave BẮT BUỘC — wave là review group, KHÔNG chạy song song executor trên shared worktree (P2 critic)**)
- Wave 1 (foundation) — thứ tự T1→T11:
  - [x] T1 `scaffold-package-turbo-workspace-ts-source-consumption` — package chrome (package.json exports `.`+`./styles.css`, deps workspace:*, **devDeps catalog + scripts build/lint=`tsc --noEmit` + test=`vitest run` — P1 critic: thiếu script `test` thì turbo BỎ QUA package**, tsconfig, vitest.config jsdom, index.ts rỗng-barrel) + deps `workspace:*` ở shell/checkout/account + next.config transpilePackages 1 dòng. Verify: `pnpm install` lock chỉ workspace links; `pnpm -C frontend turbo run build` xanh.
  - [x] T11 `i18n-t-namespace-chrome-contract-keys` — catalogs vi+en thêm `chrome.*` (header.aria, cart.aria, theme.*, menu.*, guest.*, locale.*, footer.*) — string mirror nguồn hiện có, KHÔNG xóa key cũ. Verify: test key-set vi=en trong chrome package.
- Wave 2 (registry + preset + session) — thứ tự T2→T3→T10:
  - [x] T2 `chrome-vite-preset-shared-singletons-1-line` — SHARED_SINGLETONS += chrome (ĐÚNG 1 dòng). Verify (P2 critic): grep anchor 1 dòng trong `packages/config/vite-preset.mjs` + `turbo run build` (mọi MFE build consume preset).
  - [x] T3 `header-slots-registry-move-to-chrome-update-import-callsites` — header-slots.ts + HEADER_SLOTS_CHANGED_EVENT; shell HeaderSlots.ts shim; main.tsx import chrome (ShellNav giữ shell, đăng ký qua chrome registry object); checkout bootstrap đổi import component ở T8; **account bootstrap KHÔNG đổi (spec §3.7 — AuthWidget vẫn là component đăng ký, chỉ nội bộ wrapper đổi nguồn — P2 critic)**. Verify: unit registry + event.
  - [x] T10 `session-boot-provider-ensure-session` — ensureSession single-flight + SessionBootProvider. Verify: unit 2-gọi-1-refresh, first-call-wins.
- Wave 3 (header/footer/theme) — **thứ tự trong wave BẮT BUỘC T4→T5→T7 (P2 critic — wave = review group, KHÔNG license chạy song song)**:
  - [x] T4 `shell-header-adapter-final-state-sf1` — SiteHeader (**'use client' — P0 critic**; merge order props TRƯỚC registry SAU; aria `chrome.header.aria`='Trang chủ') + Header.tsx adapter + chrome.css (port header values tokens-only + KHÔNG `url()` — P1 critic + `.chrome-container`) + main.tsx import styles. **Phân định T4/T5 (P1 critic): T4 = component + adapter wiring; T5 sở hữu SSR contract (props path + test + evidence ACCEPTANCE 3).** Verify: unit render + build xanh.
  - [x] T5 `site-header-ssr-able-slots-props-render-to-static-markup` — SSR contract: props path render server được + renderToStaticMarkup test (links trong HTML, sạch server) — evidence ACCEPTANCE 3.
  - [x] T7 `theme-toggle-canonical-key-ecommerce-theme-boot-script` — chrome ThemeToggle + THEME_STORAGE_KEY/THEME_BOOT_SCRIPT/resolveTheme/storedThemeValue + main.tsx đổi nguồn + **xóa `apps/shell/src/ThemeToggle.tsx` (F2 — P0 critic: chuyển từ T4 sang ĐÂY, cùng commit với rewire main.tsx kẻo red build giữa wave)** + unit bảng case. Verify: build xanh + unit.
- Wave 4 (footer + locale) — thứ tự T6→T12:
  - [x] T6 `footer-chrome-port` — site.ts (setChromeSite/shellUrl/sfUrl/localePath; **shell host call pin: `setChromeSite({ sfUrl: VITE_STOREFRONT_URL, shellUrl: '' })` — P1 critic**) + Footer ('use client', self-contained `.chrome-container`) + App.tsx render non-admin (F1 — comment epic) + SSR test.
  - [x] T12 `locale-switcher-chrome` — LocaleSwitcher (**shell-model; KHÔNG drop-in storefront URL-locale — P1 critic; Next integration = SF-4**) + storedLang + main.tsx initI18n({lang: storedLang()}) + unit.
- Wave 5 (widgets) — thứ tự T8→T9:
  - [x] T8 `cart-badge-widget-extract-checkout-wraps` — chrome CartBadge (fetchCart inject, CART_CHANGED_EVENT, onOpen) + checkout wrapper (drawer giữ) + bootstrap import chrome. Verify: unit count/event/subscribe; testid giữ.
  - [ ] T9 `auth-menu-widget-extract-account-wraps` — chrome AuthMenu (keyboard GIỮ, logout từ auth, onNavigate) + account wrapper. Verify: unit menu/keyboard/testid/text vi.
- Wave 6 (hồ sơ hoàn thiện) — thứ tự T13→T14:
  - [ ] T13 `unit-tests-next-transpile-vite-both-singleton` — **test setup: initI18n + I18nextProvider chung (P1 critic)** + single-instance test (**SMOKE** — bằng chứng singleton thật = browser badge, P2 critic) + SSR 2 chế độ consolidate + chạy FULL vitest workspace (chrome+i18n xanh) + turbo build.
  - [ ] T14 `ui-kit-demo-chrome-showcase-badge-from-remote-evidence` — UiKitDemoPage thêm ChromeShowcase (SiteHeader mini, CartBadge stub, ThemeToggle, LocaleSwitcher, Footer) + badge-from-remote evidence (header shell badge trên cùng trang). **Verify (P0 critic): `pnpm -C frontend turbo run build` xanh + browser shell `:5673/ui-kit` (rig +500): ChromeShowcase render đủ 5 mảnh chrome VÀ badge header (đăng ký bởi mfe-checkout) hiện count — screenshot + evidence comment FI-398 + re-run full vitest SAU commit cuối.**

### File structure
Mới: `packages/chrome/**` (chi tiết spec §2). Test: `packages/chrome/src/__tests__/*.test.{ts,tsx}` (jsdom) — pattern ui-kit.

### Testing strategy
Unit vitest (bảng ở spec §5; setup initI18n + I18nextProvider) + `pnpm -C frontend turbo run build` (tsc mọi package) + browser Rule 0: dev +500 (**env-bake hazard — P1 critic: `VITE_STOREFRONT_URL=http://localhost:3500` + `REMOTE_*_URL` offset phải export TRƯỚC `vite start` — Vite bake lúc start, bake muộn = remoteEntry resolution chết + badge "biến mất" triệu chứng gây lầm**) → T1 eval DOM, T2 screenshot so direction, T3 flow: add-to-cart ở storefront :3500 → mở shell :5673 (tab riêng — dev 2 origin, event KHÔNG xuyên cửa sổ) → badge mount hiện đúng số (cookie cart dùng chung qua gateway :8080) + trong cùng cửa sổ shell: mutate cart (cart page) → badge cập nhật tức thị qua `ecommerce:cart-changed`; theme toggle 4 trạng thái. Single-instance unit test (smoke) + badge-register-from-remote runtime = evidence ACCEPTANCE 2.

## 6. Risks & unknowns
- Đã probe: registry/event literal, cartApi shape, logout từ auth, theme key duy nhất, e2e chỉ phụ thuộc `.site-footer` trên storefront (SF-1 untouched), vite-preset test không assert map.
- Assumptions có rủi ro: (a) lockfile chỉ thêm workspace links (F3 — nếu pnpm kéo thêm → STOP kiểm); (b) chrome.css port giữ visual 1:1 (browser screenshot đối chiếu); (c) 'use client' directive vô hại Vite (chuẩn, vẫn build thử); (d) **chrome.css PHẢI `url()`-free (P1 critic — gotcha FI-390: css shared package qua MF dev → spa-fallback HTML → resource error; assets nếu cần qua JS FontFace pattern)**; (e) env-bake: VITE_*/REMOTE_* export TRƯỚC vite start (gotcha SF-3/FI-369).
- Escalation: FAIL cùng nguyên nhân ×2 → rollback-fixer; task retry cap 3; REQUIREMENT-GAP → epic FI-397.
