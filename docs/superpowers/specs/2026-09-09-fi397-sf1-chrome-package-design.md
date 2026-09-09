# SF-1 chrome-package (FI-398) — Spec thiết kế

> Story: FI-397 Frontend Unification · Epic spec: `docs/superpowers/specs/2026-09-08-frontend-unification-design.md`
> Context pack: `docs/superpowers/contexts/fi397-sf-1.md` (KHUNG CỨNG — acceptance + boundary không đổi) · Bracket: `docs/superpowers/brackets/fi397-unify-frontend.md`
> Visual: GIỮ NGUYÊN direction FI-390 (`docs/superpowers/designs/fi390-uiux-elevation-direction.md`) — wrap, KHÔNG redesign. Design: none.
> Status: Approved (epic-level direction đã duyệt; spec này chi tiết hoá theo code thật trên `story/fi397-unify-frontend` @ a0b4eb0)

## 0. Vấn đề & nguyên tắc

2 bộ chrome song song (shell Header/ThemeToggle/AuthWidget/CartBadge vs storefront Header/Footer/ThemeToggle) đang drift. SF-1 tạo **1 nguồn duy nhất** `@ecommerce/chrome` (TS source thuần) chứa: HeaderSlots registry, SiteHeader, Footer, ThemeToggle, CartBadge, AuthMenu, LocaleSwitcher, SessionBoot, site-url helpers, labels `chrome.*`. MFE giữ registration flow; chỉ NGUỒN component đổi. Mọi quyết định chưa ghi trong pack → ưu tiên **dedup về chrome, KHÔNG copy thêm**.

## 1. Scope

**In:** scaffold package + consumption (Next `transpilePackages` 1 dòng / Vite workspace dep / MF `SHARED_SINGLETONS` +1 dòng); registry move + toàn bộ import call-sites; shell Header adapter (final state); SiteHeader SSR-able; Footer port; ThemeToggle canonical `ecommerce.theme` + boot script export; CartBadge + AuthMenu extract (wrapper ở MFE); SessionBoot provider; i18n `chrome.*` (vi+en additive); LocaleSwitcher; unit tests (jsdom + SSR 2 chế độ + single-instance); /ui-kit chrome showcase (badge-from-remote evidence).

**Out (boundary pack):** `packages/auth/**` (SF-2), dev entry/proxy (SF-3), Next layout swap + xóa dup storefront (SF-4), `apps/mfe-*/src/pages/**` logic, backend/gateway/nginx/docker, dep mới (external), merge vào main, session-sync effects, 1-URL entry asserts.

## 2. Kiến trúc package

```
frontend/packages/chrome/
  package.json      # @ecommerce/chrome · main ./src/index.ts · exports { ".", "./styles.css" }
                    # deps: @ecommerce/{ui-kit,auth,i18n} workspace:* · peer react/react-dom catalog:
                    # devDeps (catalog, pattern ui-kit): @ecommerce/config, vitest, jsdom,
                    #   @testing-library/{react,dom}, @types/react(+dom), typescript
                    # scripts: build/lint = tsc --noEmit · test = vitest run (không có script `test`
                    #   thì turbo pipeline BỎ QUA package — bắt buộc để đạt ACCEPTANCE 5)
  tsconfig.json     # extends @ecommerce/config/tsconfig.base.json
  vitest.config.ts  # jsdom + globals (pattern ui-kit)
  src/
    index.ts        # barrel export mọi public API
    header-slots.ts # HeaderSlots registry + SlotKey + HEADER_SLOTS_CHANGED_EVENT (move từ shell, code giữ nguyên semantics)
    site.ts         # shellUrl()/sfUrl()/localePath() — đọc từ module config (setChromeSite) + defaults; KHÔNG process.env, KHÔNG import.meta.env trong chrome source
    SiteHeader.tsx  # SSR-able header (row1 slots + row2 node qua props)
    Footer.tsx      # SSR-able footer (cột link chrome.footer.*)
    ThemeToggle.tsx # 'use client' island + THEME_STORAGE_KEY + THEME_BOOT_SCRIPT + storedThemeValue()
    CartBadge.tsx   # 'use client' island
    AuthMenu.tsx    # 'use client' island
    LocaleSwitcher.tsx # 'use client' island
    session-boot.tsx   # ensureSession (single-flight) + SessionBootProvider ('use client')
    chrome.css      # style chrome-owned components — CHỈ var(--*) (convention ui-kit)
```

**Consumption:**
- Next: `transpilePackages` + `'@ecommerce/chrome'` (next.config.mjs — ĐÚNG 1 dòng; storefront chưa import chrome ở SF-1 → chưa thêm dep, SF-4 thêm khi wire).
- Vite apps: `"@ecommerce/chrome": "workspace:*"` vào deps của `shell`, `mfe-checkout`, `mfe-account`.
- MF singleton: `SHARED_SINGLETONS['@ecommerce/chrome'] = { singleton: true, requiredVersion: false }` — ĐÚNG 1 dòng trong `packages/config/vite-preset.mjs` (map không export, không thêm test vào packages/config — spec §5.9). LÝ DO P0 (pack): thiếu singleton → 2 instance chrome → 2 registry → badge từ remote mất trên host.

**Cấm trong chrome source:** `process.env` (tsc shell vỡ — convention ui-kit), import i18next trực tiếp, hardcode hex (chỉ `var(--*)`), dep i18n-domains ngoài `chrome.*`.

## 3. Contract từng thành phần

### 3.1 HeaderSlots registry (move)
- Code chuyển nguyên văn từ `apps/shell/src/header/HeaderSlots.ts` (Map SlotKey×id, register/unregister/list) + thêm export `HEADER_SLOTS_CHANGED_EVENT = 'ecommerce:header-slots-changed'` (literal hiện có, giữ nguyên behavior).
- `apps/shell/src/header/HeaderSlots.ts` → **shim re-export** 1 dòng từ chrome (`apps/shell/src/pages/RemotePage.tsx`, `App.tsx`, `remotes.d.ts`, test admin… không bị động — không nằm trong touch map).
- Registration flow GIỮ NGUYÊN: remotes vẫn nhận `ctx.HeaderSlots` qua `ShellContext` (object chính là registry chrome — singleton). Boundary "KHÔNG đổi registration flow" ✓.
- CustomEvent wiring giữ ở shell (`main.tsx` onRegistryChange dùng `HEADER_SLOTS_CHANGED_EVENT` từ chrome); `App.tsx:147-151` KHÔNG đụng.

### 3.2 SiteHeader (SSR-able)
- **`'use client'`** (P0 critic: `useT()` = react-i18next hook — RSC thuần CRASH; client component vẫn được Next server-render HTML đầu → links trong HTML giữ nguyên SEO/nav-honesty, đúng pattern I18nextProvider pack dẫn). SSR contract: renderToStaticMarkup sạch + không window/matchMedia lúc render; host bọc I18nextProvider (SF-4 wire).
- Props: `{ row2?: ReactNode; slots?: Partial<Record<SlotKey, ComponentType[]>>; className? }` — render row1 = **props.slots[slot] TRƯỚC, registry HeaderSlots.list(slot) SAU** (merge order chốt — P2 critic), row2 = props.row2 (shell truyền `<ShellMiniNav/>`). Không props-label — aria/labels qua `useT()` keys `chrome.header.*` (`chrome.header.aria` = 'Trang chủ' — pin giá trị hiện tại `nav.home`, P2 critic).
- Server render registry rỗng → chỉ props links (deterministic).
- Shell adapter (`apps/shell/src/header/Header.tsx` — **final state**, SF-4 không đụng): mỏng — `ShellNav` (giữ shell-owned, dùng router `Link`) + render `<SiteHeader row2={<ShellMiniNav/>}/>`. DOM/class giữ anatomy FI-393 T2 hiện có (`.chrome-header` mới thay `.shell-header` — chrome.css port ĐÚNG giá trị từ `header.css`, tokens-only).

### 3.3 Footer (port, 'use client' — SSR qua server render của Next)
- `'use client'` (cùng lý do P0 SiteHeader — useT). Cấu trúc port từ `apps/storefront-web/components/Footer.tsx` (2 cột: Danh mục 5 slug seed, Tài khoản 5 link shell) — labels `chrome.footer.*` (string vi/en mirror EXACT storefront `lib/i18n` footer.*), href qua `chrome/site.ts` helpers (`sfUrl(localePath(...))`, `shellUrl(...)`) — cross-origin ĐÚNG như hiện trạng, SF-3 flip same-origin sau.
- **Self-contained CSS**: KHÔNG phụ thuộc `.container` của storefront app.css (P1 critic — shell không có class này) — chrome.css sở hữu `.chrome-container` port giá trị 1240px/padding 16 (direction §2).
- KHÔNG port NewsletterForm (storefront-owned client island — không trong phạm vi "Footer port"; SF-4 quyết khi swap layout).
- Link render `<a>` thuần (SSR-safe, shell-compatible). Next SPA-nav (next/link) = ext-point SF-4 tự thêm khi wire (ghi chú trong code, KHÔNG dựng trước).
- Shell render Footer: thêm `<Footer/>` trong `App.tsx` nhánh **non-admin** (admin KHÔNG chrome wrap) — **FLAG: App.tsx ngoài touch map** (bắt buộc để đạt ACCEPTANCE 1 "Shell render Header/Footer từ chrome"; 2 dòng, không đụng logic routing).

### 3.4 site.ts (helpers)
- `setChromeSite({ shellUrl?, sfUrl? })` + `shellUrl()` default `http://localhost:5173` + `sfUrl()` default `http://localhost:3000` + `localePath(path, lang)` (port pure fn từ storefront `lib/format.ts` — vi không prefix). Đọc-lúc-gọi, unit override được.
- **Shell host call (pin — P1 critic)**: `setChromeSite({ sfUrl: import.meta.env.VITE_STOREFRONT_URL, shellUrl: '' })` — shell KHÔNG có env self-URL; `shellUrl('')` = same-origin relative (link ra `/cart` đúng ở mọi port kể cả rig +500, pre-align SF-3 "shellUrl → ''"). Rig +500: set `VITE_STOREFRONT_URL=http://localhost:3500` khi start shell. Next (SF-4) set từ process env của nó; absolute defaults giữ cho standalone.
- FLAG (không sửa hôm nay): `ShellSearch.sfUrl` + storefront `lib/site.ts` vẫn tồn tại — dedup call-sites của chúng thuộc SF-3/SF-4.

### 3.5 ThemeToggle (canonical)
- Port từ shell `ThemeToggle.tsx`. Key canonical **`ecommerce.theme`** (đã là key duy nhất trên cả 3 vị trí hiện có: shell toggle, shell index.html boot, storefront lib/theme.ts — **đã probe, KHÔNG có key khác** → không cần read-order migration; ghi chú giữ phòng unsupported key: lần toggle đầu ghi đè về canonical theo logic `storedThemeValue()` hiện có).
- Export: `THEME_STORAGE_KEY`, `THEME_BOOT_SCRIPT` (string — 1 nguồn, nội dung khớp boot script shell index.html hiện có), `resolveTheme`, `storedThemeValue`, component `ThemeToggle` ('use client', class `.chrome-icon-btn` port từ `.shell-icon-btn`, labels `chrome.theme.*` — text vi GIỮ nguyên e2e-safe).
- Shell `main.tsx` đổi import sang chrome; **xóa** `apps/shell/src/ThemeToggle.tsx` (orphan do thay đổi SF-1 tạo ra — main.tsx là consumer duy nhất, đã probe). `shell/index.html` inline boot GIỮ NGUYÊN (file không trong touch map; SF-4 flip sang chrome export khi layout swap — FLAG drift window nhỏ, cùng literal nên zero behavioral drift).

### 3.6 CartBadge (extract)
- chrome `CartBadge` nhận **`fetchCart: () => Promise<CartBadgeCart | null>`** (data-access inject — checkout giữ `cartApi.ts` NGUYÊN VỊ, không copy GET vào chrome; `CartBadgeCart = { items: { qty: number }[] }` structural-compatible). 3 nguồn giữ nguyên: GET qua fetchCart inject + `ecommerce:cart-changed` (chrome sở hữu literal `CART_CHANGED_EVENT` — contract window event) + `authStore.subscribe`. Badge UI/inline-style giữ nguyên (accent pill, `data-testid="cart-badge"|"cart-badge-count"`), labels `chrome.cart.aria` (string khớp `shell.cart.aria` hiện có).
- Click: prop `onOpen?` — wrapper checkout truyền để mở `MiniCartDrawer` (drawer Ở LẠI checkout — không trong touch map). Không onOpen → button vẫn render, click no-op (showcase).
- `apps/mfe-checkout/src/CartBadge.tsx` → wrapper: state drawer + `<ChromeCartBadge fetchCart={fetchCart} onOpen={…}/>` + `<MiniCartDrawer/>` mount điều kiện như cũ; đăng ký `'right','checkout-cart-badge'` trong bootstrap GIỮ NGUYÊN (đổi import → chrome là thay đổi DUY NHẤT ở bootstrap).

### 3.7 AuthMenu (extract)
- chrome `AuthMenu` port UserMenu+GuestLinks từ `mfe-account/AuthWidget.tsx` (keyboard menu FI-390 GIỮ NGUYÊN: roving focus, ESC restore, Tab đóng; `data-testid` auth-guest/auth-user; text vi GIỮ NGUYÊN). Class `.um-*` giữ tên (css do chrome.css sở hữu bản port; account `page.css` vẫn define bộ cũ cho standalone — dup tạm, FLAG, SF-4 dọn khi xóa wrapper).
- `logout` import từ `@ecommerce/auth` (chính là nguồn account `api.ts` re-export — probe ✓, zero dup). Điều hướng: prop `onNavigate?: (to: string) => void` — wrapper truyền `appNavigate`; không truyền → anchor href mặc định vẫn hoạt động (full-nav fallback).
- `apps/mfe-account/src/AuthWidget.tsx` → wrapper render `<AuthMenu onNavigate={appNavigate}/>`; đăng ký 3 slot trong bootstrap GIỮ NGUYÊN (chỉ đổi import AuthWidget stays local — bootstrap import KHÔNG đổi vì AuthWidget vẫn là component đăng ký; chỉ AuthWidget nội bộ đổi nguồn). *(Bootstrap:43-47 của pack = khối configureAuth+register — semantic: nguồn component đổi qua wrapper, flow không đổi.)*

### 3.8 SessionBoot (export + test, KHÔNG wire)
- `ensureSession(options?: { loginPath?: string })`: first-call-wins configureAuth (refreshUrl `/api/identity/auth/refresh`, identityBaseUrl `''`, loginPath default `'/login'` — host storefront sẽ truyền `/account` khi wire ở SF-4) + single-flight refresh (module-level promise, pattern `lib/account-session.ts`). KHÔNG đụng sync/broadcast (SF-2).
- `SessionBootProvider` ('use client'): mount → gọi ensureSession 1 lần, render children ngay (không gate render — bootNgầm như pattern hiện có).

### 3.9 LocaleSwitcher
- 'use client' island — **shell-model** (i18n-lang): `useT().lang` + 2 nút vi/en → `setLang` + persist `localStorage['ecommerce.lang']`; chrome export `storedLang()` đọc an toàn. Shell `main.tsx` truyền `initI18n({ lang: storedLang() ?? 'vi' })` (1 dòng, trong touch map) để reload giữ lựa chọn.
- **KHÔNG phải drop-in thay thế LocaleSwitcher của storefront** (P1 critic — storefront là URL-locale: `[locale]` segment + `localePath`/`switchLocalePath`; `setLang` không đổi URL → desync). Next URL-locale integration (navigate `switchLocalePath` hoặc prop `href`/`onLocaleChange`) = quyết định RÕ RÀNG của SF-4.
- KHÔNG register vào shell header (visual GIỮ NGUYÊN — chỉ xuất hiện ở /ui-kit showcase; SF-4 quyết vị trí trên Next).

### 3.10 i18n `chrome.*` (additive, vi+en song song)
Nhóm keys mới (string GIỮ nguyên text hiện có wherever exist — e2e locate theo text): `chrome.header.aria`, `chrome.cart.aria` (= `shell.cart.aria` 'Giỏ hàng — {{count}} sản phẩm'), `chrome.theme.{toLight,toDark,light,dark}` (khớp shell.theme.*), `chrome.menu.{account,orders,logout,displayNameFallback}` (khớp account.menu.* hiện có), `chrome.guest.{login,register}` (khớp nav.login/register), `chrome.locale.{label,vi,en}`, `chrome.footer.{colCategories,catElectronics,catFashion,catHome,catBooks,catBeauty,colAccount,linkCart,linkAccount,linkOrders,linkWishlist,linkMyReviews}` (mirror EXACT string storefront `lib/i18n` footer.* — đọc file khi làm, không bịa). KHÔNG xóa/sửa key cũ.

## 4. CSS chiến lược
- `chrome/styles.css` (export `./styles.css`): `.chrome-header*`, `.chrome-icon-btn`, `.chrome-vh`, `.um-*`, `.site-footer*`, `.chrome-container` (1240px/padding 16 — P1 critic: footer self-contained, không phụ thuộc `.container` của storefront) (port values từ shell `header.css` + account `page.css` + storefront `app.css` tương ứng — CHỈ var(--*), không hex, **KHÔNG `url()`** — gotcha FI-390: css shared package qua MF dev → spa-fallback HTML → resource error; assets nếu cần qua JS FontFace pattern). Shell `main.tsx` import thêm `@ecommerce/chrome/styles.css` (touch map ✓).
- Files css host GIỮ NGUYÊN (không trong touch map): shell `header.css` vẫn style ShellMiniNav/ShellSearch; account `page.css` um-* (dup tạm — Vite dedupe Cascade ăn bộ sau, identical values nên zero drift); storefront `app.css` untouched (SF-4 swap).
- CartBadge giữ inline styles như hiện trạng (đã tokens-only).

## 5. Tests (vitest, jsdom + node)
**Setup (P1 critic):** mọi test render component chrome phải `initI18n()` + bọc `I18nextProvider` (setup file chung) — nếu không, useT trả raw key và test 7 (`i18n.language`) cần instance thật.
1. header-slots: register/unregister/list + ghi đè id + event constant.
2. **single-instance (SMOKE — P2 critic)**: 2 "consumer" import `{ HeaderSlots }` từ 2 entry (package root + path phụ) → cùng object; register từ B thấy qua list A. Test này KHÔNG chứng minh MF-level dedupe (đặc tính build-time externalization) — bằng chứng thật = browser badge evidence (ACCEPTANCE 2).
3. SSR: `renderToStaticMarkup(<SiteHeader slots={{left:[StaticLink]}} row2={…}/>)` + `<Footer/>` — sạch (links trong HTML, không crash, không window) — evidence ACCEPTANCE 3.
4. ThemeToggle: key canonical literal, THEME_BOOT_SCRIPT chứa key + set data-theme, storedThemeValue/resolveTheme bảng case, toggle ghi/xoá storage đúng chiều system.
5. CartBadge: mock fetchCart → count; phát `CART_CHANGED_EVENT` → refetch; auth subscribe → refetch; count 0 ẩn pill.
6. AuthMenu: guest → 2 link + testid; user → menu mở, ArrowDown/Up wrap, ESC đóng + restore focus, logout gọi chuỗi auth logout → clearLocal → onNavigate.
7. LocaleSwitcher: click en → `i18n.language` đổi + persist.
8. session-boot: 2 lần gọi → 1 refresh (mock authStore.refresh); config first-call-wins.
9. vite-preset: KHÔNG thêm test vào packages/config — `SHARED_SINGLETONS` không export (anchor pack = ĐÚNG 1 dòng, không refactoring); singleton được chứng minh bằng single-instance test (mục 2) + runtime badge gate (ACCEPTANCE 2).
10. i18n catalogs: chrome.* đủ vi+en song song (test so key-set 2 catalogs trong packages/chrome, không cần sửa packages/i18n).

## 6. ACCEPTANCE (pack — KHÔNG đổi)
1. Shell render Header/Footer từ chrome (adapter) — visual GIỮ FI-390 (4 theme states; dev offset +500: shell 5673, remotes 5675-77, Next 3500 qua REMOTE_*_URL/PORT).
2. Click giỏ trên SHELL: badge đăng ký bởi mfe-checkout hiện đúng số → host+remote 1 instance chrome (evidence browser + single-instance unit).
3. `renderToStaticMarkup(<SiteHeader/>)` + `<Footer/>` sạch server-side.
4. Theme toggle ghi đúng `ecommerce.theme`; boot script export hoạt động (unit + manual).
5. `pnpm vitest run` packages/chrome + i18n xanh; /ui-kit có chrome showcase.

## 7. Rủi ro & FLAG (đã probe code thật)
- **F1** App.tsx thêm `<Footer/>` non-admin — ngoài touch map, bắt buộc cho ACCEPTANCE 1 → comment epic.
- **F2** Xóa `shell/ThemeToggle.tsx` (orphan do đổi import main.tsx) — ngoài touch map về "sửa" nhưng là own-your-orphans; thay vì để dead code.
- **F3** pnpm-lock sẽ thay đổi CHỈ bởi workspace links (chrome mới + 3 deps `workspace:*`) — 0 dep external (dep freeze intact; interpretation ghi rõ cho SF-5 sweep).
- **F4** Dup tạm không xóa được trong phạm vi: sfUrl (ShellSearch), um-* (account page.css), inline boot (shell index.html), site helpers (storefront lib/site.ts), ensureSession (storefront `lib/account-session.ts` — chrome giữ bản cho đến SF-2/SF-4 dedupe) — cùng literal/values, hết drift behavior; call-sites thuộc SF-3/SF-4.
- **F5** HeaderSlot shim file giữ import path cũ sống — tránh sửa App.tsx/RemotePage/remotes.d.ts/skeleton/admin-test (ngoài touch map).
- Browser gate: chạy dev +500, T1 eval DOM (badge testid + count), T2 screenshot so direction FI-390, T3 flow login→add-to-cart (PDP storefront :3500)→shell :5673 thấy badge tăng (cross-app evidence) — flow đứt thì FIX trước merge.
