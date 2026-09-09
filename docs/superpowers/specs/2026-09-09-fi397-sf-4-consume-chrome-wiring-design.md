# SF-4 consume-chrome-wiring — Spec slice (FI-401, story FI-397)

> Ngày: 2026-09-09 · Tier: 1 (dep SF-1 + SF-3 — cả hai đã merge vào đích, verify 09-09) · Nhánh: `wakii-dev/sf-4-consume-chrome-wiring` → đích `story/fi397-unify-frontend`
> Nguồn: epic spec `2026-09-08-frontend-unification-design.md` + context pack `fi397-sf-4.md` (đọc từ main checkout — pack CHƯA commit trên story branch) + bracket `fi397-unify-frontend.md` + code hiện trạng đọc 09-09.
> Design: none (FI-390 hand-off `fi390-uiux-elevation-direction.md` là source of truth visual — GIỮ, không redesign).

## 0. Problem

Sau SF-1, chrome package (`@ecommerce/chrome`) sở hữu SiteHeader/Footer/ThemeToggle/CartBadge/AuthMenu/SessionBoot + theme boot script — NHƯNG storefront-web vẫn render Header/Footer/ThemeToggle TỰ VẼ (`components/Header.tsx`, `Footer.tsx`, `ThemeToggle.tsx`) = 2 bản dup sống song song (sửa nhãn chrome.* không đổi được storefront — suyễn mục tiêu story). mfe-checkout/mfe-account vẫn đăng ký qua wrapper nội bộ (`./CartBadge`, `./AuthWidget`) thay vì component chrome TRỰC TIẾP. Next chưa wire I18nextProvider → chrome labels (`useT`) chưa chạy được trên storefront. `NEXT_PUBLIC_SHELL_URL` còn kill-switch chết trong `lib/site.ts` sau khi SF-3 flip same-origin.

Real problem = **2 app THẬT SỰ dùng chung chrome (xóa dup) — demo "sửa 1 chỗ đổi 2 app"** chạy trên entry 1-origin :3000.

## 1. Scope

**In:**
1. `[locale]/layout.tsx` swap: Header/Footer local → chrome `SiteHeader` (props-slots, SSR-able) + chrome `Footer`; islands local GIỮ (SearchBar, LocaleSwitcher URL-locale, MiniNav, NewsletterForm, PwaRegister); SessionBoot bọc client tree; `setChromeSite({ sfUrl:'', shellUrl:'' })` (same-origin relative — chrome Footer/links ra `/cart`, `/c/*`).
2. Xóa dup: `components/Header.tsx`, `components/Footer.tsx`, `components/ThemeToggle.tsx` + `lib/theme.ts` (nếu 0 import còn lại — check lúc làm). Slot content chuyển thành component slot mỏng (giữ nguyên class/markup FI-390).
3. Theme canonical: chrome `ThemeToggle` + `THEME_BOOT_SCRIPT` (root `app/layout.tsx` đổi nguồn import); key `ecommerce.theme` chuẩn (đã chung từ SF-15).
4. GA/livechat: GIỮ hành vi — `GaPageview` + `LiveChat` storefront-owned, tiếp tục wire trong layout (contract `window.gtag` + double-inject guard `__shopvnChatInjected` GIỮ NGUYÊN). Xem §2.4 vì sao KHÔNG move vào chrome.
5. Bootstrap đăng ký TRỰC TIẾP từ chrome: `mfe-checkout/src/bootstrap.tsx` + `mfe-account/src/bootstrap.tsx`; XÓA wrapper file `mfe-checkout/src/CartBadge.tsx` + `mfe-account/src/AuthWidget.tsx`; dọn `.um-*` dup css trong account `page.css`; grep 0 import wrapper sót. Registration flow HeaderSlots KHÔNG đổi. Admin KHÔNG đụng.
6. i18n wire: `initI18n({ lang: locale })` (namespace `chrome.*` sẵn trong catalog @ecommerce/i18n) + client gate bọc chrome tree; COPY module `lib/i18n.ts` GIỮ NGUYÊN.
7. Unit tests storefront vỡ do swap → fix xanh; thêm assert layout render chrome. Shell: không có unit test riêng (probe 09-09 — 0 file *.test.* trong apps/shell); chrome package tests phải giữ xanh.
8. e2e subset: `golden-path.spec.ts` + `nav-honesty.spec.ts` XANH trên entry :3000 (selector update tối thiểu theo markup chrome mới — semantic giữ).
9. Walkthrough cross-app nav + screenshots (theme sync, label chrome.* 2 app).
10. Xóa `NEXT_PUBLIC_SHELL_URL` code-path chết (`lib/site.ts` + `tests/site.test.ts`); docker-compose env :502 GIỮ NGUYÊN.

**Out (boundary — theo pack):**
- KHÔNG đụng `packages/chrome/**` (SF-1), `packages/auth/**` (SF-2), shell Header adapter/HeaderSlots (SF-1 final state), entry/proxy configs (SF-3), `contracts/**`, `backend/**`.
- KHÔNG đổi registration flow HeaderSlots (chỉ nguồn component); KHÔNG đụng islands logic (SearchBar/WishlistHeart/reviews…); KHÔNG đụng admin (chỉ smoke `/admin` vào được); KHÔNG dep mới; KHÔNG đụng docker-compose; KHÔNG merge vào main.
- KHÔNG assert sync tức thì (SF-2) hay entry HMR (SF-3) — chỉ chrome rendering + swap + tests.

## 2. Design decisions (probe 09-09 — mỗi quyết có evidence)

### 2.1 Header = chrome `SiteHeader` + props-slots (KHÔNG registry)

`SiteHeader` hỗ trợ `slots?: Partial<Record<SlotKey, ComponentType[]>>` + `row2?: ReactNode` + `className` (SiteHeader.tsx:23-27,44). Render **props slots TRƯỚC, registry SAU** (SiteHeader.tsx:31) — server render registry rỗng nhưng props slots VẪN vào HTML đầu (SSR test (a) chứng minh) → **nav-honesty/SEO giữ nguyên**. Registry (`HeaderSlots.register`) chỉ đáng dùng cho widget mount-lúc-runtime của remote — storefront không cần.

Slot content = component slot MỎNG 0-arg trong 1 file client mới (`components/ChromeHeader.tsx`), bọc island hiện có + tự đọc locale qua `useParams()` (slots render `<Component />` KHÔNG props — SiteHeader.tsx:38):

| Slot | Component | Nguồn | Ghi chú |
|---|---|---|---|
| left | `SlotLogo` | markup từ Header.tsx cũ (logo wordmark + dot + ticker) | `next/link` + `localePath('/')` — class `.logo*` giữ |
| center | `SlotSearch` | `<SearchBar locale/>` island GIỮ | `useParams()` đọc locale |
| right | `SlotLocaleSwitch` | `<LocaleSwitcher locale/>` island GIỮ | URL-locale model — chrome LocaleSwitcher là shell-model (LocaleSwitcher.tsx:15-16: "KHÔNG drop-in cho storefront URL-locale — Next integration là quyết định SF-4") → quyết: GIỮ island storefront |
| right | chrome `ThemeToggle` | `@ecommerce/chrome` | class `.chrome-icon-btn` (42×42 §2.1 direction) |
| right | `SlotCartLink` + `SlotAccountLink` | markup từ Header.tsx cũ | **LINK giữ, KHÔNG thay bằng CartBadge/AuthMenu** — pack item 8: "nav-honesty regex link `/cart|/account` relative giữ pass — chrome Header phải render LINKS tương tự"; href `${shellUrl()}/cart` = `/cart` relative (shellUrl '' sau task 10) |
| row2 | `SlotMiniNav` | markup mini-nav từ Header.tsx cũ | `nav.mini-nav` — e2e `nav.mini-nav` locator giữ nguyên |

Visual: `className="site-header"` truyền vào SiteHeader → toàn bộ css `.site-header/.header-main` hiện có áp lên element chrome; slot components giữ class `.logo/.header-actions/.header-action/.locale-switch/.mini-nav` → **không đổi pixel trừ đúng phần swap** (theme-toggle icon-btn). Css bridge nhỏ nếu `.chrome-header__row1` (1240/flex/padding 12-16 — chrome.css:18-25) lệch `.header-main` — chốt bằng screenshot so BEFORE (Rule 0 T2), không đo DOM suông.

### 2.2 Footer = chrome `Footer` + NewsletterForm giữ (island local)

Chrome Footer = 2 cột (5 category + 5 shell links, plain `<a>`, labels `chrome.footer.*` mirror EXACT string storefront) — port sẵn từ chính Footer storefront (chrome Footer.tsx:7-13). NewsletterForm (SF-13 A8, island local, POST `/api/identity/newsletter`) chrome KHÔNG render (chrome Footer.tsx:12: "SF-4 quyết khi swap layout") → **quyết: GIỮ island**, render trong footer band sau chrome Footer (wrapper class `site-footer` quanh cụm Footer+newsletter làm css band liền mạch + giữ e2e locator `.site-footer a` hoạt động — nav-honesty.spec:64 không phải sửa; neutralize double-padding bằng 1-2 dòng css bridge). Nếu screenshot thấy vỡ → fallback: update locator e2e `.site-footer, .chrome-site-footer` (semantic giữ, selector song song theo constraint). Hrefs: sau `setChromeSite({sfUrl:'',shellUrl:''})` → `/c/dien-tu`, `/cart`… relative — khớp `targetRe` nav-honesty.spec:66.

### 2.3 Theme — 1 nguồn chrome

`ThemeToggle` chrome + `THEME_BOOT_SCRIPT` chrome (theme.ts:45) — cùng literal semantics boot script storefront cũ (khác định dạng string, hành vi identically: stored dark/light → data-theme). Root `app/layout.tsx:7` đổi import từ `../components/ThemeToggle` → `@ecommerce/chrome` (+ thêm `import '@ecommerce/chrome/styles.css'` — css chromeheader/footer/icon-btn). `lib/theme.ts` + `components/ThemeToggle.tsx` xóa khi 0 import (tests/theme.test.ts re-point sang `resolveTheme/storedThemeValue` của chrome — contract giữ, test vẫn có ý nghĩa). Key `ecommerce.theme` đã canonical từ SF-15 (chrome theme.ts:7-11 probe xác nhận không có key khác) → toggle storefront ↔ shell đồng bộ qua cùng key; demo screenshot 2 app cùng theme.

### 2.4 GA/livechat — GIỮ storefront-owned (không move vào chrome)

Probe 09-09: `packages/chrome/src/index.ts` KHÔNG có export GA/livechat/boot nào; shell TỰ giữ `ga.ts` + `livechat.ts` (app-owned, cùng pattern). Boundary: chrome read-only, "thiếu gì → flag coordinator, KHÔNG tự sửa chrome". Pack touch map ghi `{GaPageview,LiveChat}.tsx (sở hữu — swap/đổi nguồn chrome)` nhưng acceptance 3 chỉ ràng buộc HÀNH VI: "GA pageview + livechat vẫn bắn đúng (network evidence)". → Quyết: giữ 2 component storefront-owned, wire tiếp trong layout mới (root layout GA script + `[locale]` LiveChat) — contract `window.gtag` + guard double-inject GIỮ NGUYÊN. Ghi note decision này vào epic comment (không phải REQUIREMENT-GAP: không cần sửa chrome để đạt acceptance; shell cũng đang app-owned như vậy).

### 2.5 Bootstrap đăng ký trực tiếp — xóa wrapper, GIỮ behavior

- `mfe-checkout/src/bootstrap.tsx`: `import { CartBadge } from '@ecommerce/chrome'`; binding inline trong bootstrap (data-access + drawer là checkout-owned theo SF-1 design — wrapper comment "checkout giữ data-access (lib/cartApi fetchCart) và UI phụ (MiniCartDrawer)"): 1 component nhỏ định nghĩa TRONG bootstrap.tsx render `<ChromeCartBadge fetchCart={fetchCart} onOpen={…}/>` + MiniCartDrawer. `register('right','checkout-cart-badge', …)` GIỮ id/slot. File `./CartBadge.tsx` XÓA.
- `mfe-account/src/bootstrap.tsx`: `import { AuthMenu } from '@ecommerce/chrome'`; binding inline `() => <AuthMenu onNavigate={appNavigate}/>` (GIỮ SPA-nav shell — behavior nguyên vẹn; chrome AuthMenu chấp nhận onNavigate optional — AuthMenu.tsx:32-34). `register('right','account-auth', …)` GIỮ. File `./AuthWidget.tsx` XÓA. `.um-*` dup css trong account `page.css` XÓA (AuthMenu.tsx:29-30 chỉ dẫn "SF-4 dọn khi xóa wrapper" — chrome.css sở hữu bản port).
- Exit criteria grep (P1): `grep -rn "from './CartBadge'\|from './AuthWidget'" frontend/apps/mfe-*` = 0 hits.

### 2.6 i18n wire — initI18n sync, KHÔNG cần import react-i18next

Probe 09-09 (i18next 23.16.8 source, i18next.js:2041-2045): **`resources` inline → `load()` chạy SYNC** (nhánh `if (this.options.resources || !this.options.initImmediate) load();` — không qua `setTimeout`) → `t()` trả string đúng NGAY tick gọi `init()`. Kèm chứng nhận `initReactI18next` đăng ký default instance → `useT()` hoạt động KHÔNG cần `I18nextProvider` (chrome SSR test `site-header.ssr.test.tsx:48-51` render không provider → `aria-label="Trang chủ"` dịch đúng).

→ Wiring: (a) `[locale]/layout.tsx` (server) gọi `await initI18n({ lang: locale })` trước render (idempotent first-call-wins — server pass chắc chắn dịch); (b) client gate component ('use client', bọc chrome tree + SessionBootProvider) gọi `void initI18n({ lang: locale })` lúc render — browser pass cùng sync-data → không flash key thô, không hydration mismatch; (c) `setChromeSite({sfUrl:'',shellUrl:''})` gọi cả 2 phía (server module instance + browser instance — singleton per runtime). KHÔNG thêm `react-i18next` vào storefront deps (không import trực tiếp — dep freeze; `@ecommerce/i18n` ĐÃ là dep storefront từ SF-1, package.json:8). Lang = URL locale (`[locale]` segment) — storefront là URL-locale model; storedLang() không dùng (không ép mô hình shell vào Next; acceptance locale = "locale switch giữ path vi-no-prefix" — LocaleSwitcher island đảm nhiệm).

### 2.7 `NEXT_PUBLIC_SHELL_URL` cleanup

`lib/site.ts` shellUrl() bỏ env kill-switch → `return ''` (đọc-lúc-gọi không còn ý nghĩa khi hằng same-origin); `tests/site.test.ts` (ENV_KEY case) cập nhật theo. Docker-compose env :502 GIỮ NGUYÊN (pack — prod compose không đụng).

## 3. Touch map

```
frontend/apps/storefront-web/app/[locale]/layout.tsx      (sở hữu — swap chrome + initI18n + setChromeSite)
frontend/apps/storefront-web/app/layout.tsx               (đụng tối thiểu — đổi nguồn THEME_BOOT_SCRIPT + import chrome css)
frontend/apps/storefront-web/components/ChromeHeader.tsx  (MỚI — slot components + client gate i18n/session)
frontend/apps/storefront-web/components/Header.tsx        (XÓA)
frontend/apps/storefront-web/components/Footer.tsx        (XÓA)
frontend/apps/storefront-web/components/ThemeToggle.tsx   (XÓA)
frontend/apps/storefront-web/lib/theme.ts                 (XÓA nếu 0 import còn)
frontend/apps/storefront-web/lib/site.ts                  (đụng — bỏ env kill-switch)
frontend/apps/storefront-web/app/app.css                  (đụng — css bridge nhỏ nếu cần, tokens-only)
frontend/apps/mfe-checkout/src/bootstrap.tsx              (đụng — đăng ký trực tiếp)
frontend/apps/mfe-checkout/src/CartBadge.tsx              (XÓA)
frontend/apps/mfe-account/src/bootstrap.tsx               (đụng — đăng ký trực tiếp)
frontend/apps/mfe-account/src/AuthWidget.tsx              (XÓA)
frontend/apps/mfe-account/src/page.css                    (đụng — dọn .um-* dup)
frontend/apps/storefront-web/tests/**                     (đụng — fix xanh: theme/site/wiring…)
frontend/e2e/tests/nav-honesty.spec.ts                    (đụng TỐI THIỂU — chỉ nếu locator footer cần)
```

READ-ONLY: `packages/chrome/**`, `packages/auth/**`, `packages/i18n/**`, shell Header adapter + HeaderSlots, entry/proxy configs, `contracts/**`, `backend/**`, docker-compose, pnpm-lock (không thêm dep nào → lock không đổi).

## 4. Unit tests

- Storefront vitest vỡ do swap → fix xanh: `theme.test.ts` (re-point chrome), `site.test.ts` (bỏ ENV_KEY), test khác (i18n/addtocart/wishlist…) không đụng markup header/footer → phải giữ xanh nguyên trạng.
- Thêm test nhỏ `tests/chrome-layout.test.tsx`: render `[locale]` layout body (hoặc ChromeHeader) chứa `chrome-header` scaffolding + data-slot + footer `chrome-site-footer` — assert markup nguồn chrome (pack item 7).
- Chrome package tests: KHÔNG đụng, phải vẫn xanh (run để chứng minh).

## 5. e2e subset + rig

- `golden-path.spec.ts` + `nav-honesty.spec.ts` — chạy sequential (recipe SF-1 QA: 1 suite mỗi lần). Base URL mặc định :3000 (helpers/env.ts:37-39) — entry 1-origin SF-3.
- Rig: `make dev` full stack (entry :3000) trong worktree này; storefront + shell + remotes cùng origin. Playwright dùng `frontend/e2e` (executablePath headless shell theo recipe FI-368 nếu cần).
- Selector update CHỈ khi markup chrome đổi class mà test locate (footer `.site-footer a` — ưu tiên giữ bằng wrapper alias; cập nhật locator là fallback có comment).

## 6. Walkthrough (Rule 0)

1. BEFORE screenshots (nhánh base, trước swap): home/PDP :3000 — storefront header/footer hiện trạng.
2. AFTER: cùng màn — so visual (header 2 hàng/logo/search/actions/mini-nav/footer band) — "giống hệt FI-390".
3. Cross-app flow: storefront → click cart link → /cart (shell) → account → back storefront; screenshots từng bước.
4. Theme: toggle ở storefront → screenshot; sang /cart (shell) cùng theme (cùng key); toggle ở shell → storefront sync khi quay lại.
5. Label demo: sửa 1 nhãn `chrome.*` (vd `chrome.footer.linkCart`) → reload cả 2 app cùng nhãn mới (screenshot) → revert.
6. GA pageview + livechat: network evidence (request gtag/pageview khi navigate; script tawk chỉ khi có env — nếu env trống thì evidence "không load gì, không lỗi" theo guard).
7. `/admin` smoke: vào được qua entry, layout riêng (không chrome wrap).

## 7. Risks & unknowns (đã probe)

| Rủi ro | Đánh giá | Giảm |
|---|---|---|
| Hydration/SSR key thô | ĐÃ KHỬ: i18next resources-inline init sync (probe §2.6) + server await | test SSR render chứa nhãn dịch |
| Visual lệch header/footer | css class storefront giữ nguyên; chỉ scaffolding wrapper đổi | BEFORE/AFTER screenshot + bridge css nhỏ |
| `.site-footer` e2e locator vỡ | chrome Footer dùng `.chrome-site-footer` | wrapper alias giữ locator; fallback update spec |
| Xóa wrapper mất drawer/SPA-nav | binding inline GIỮ fetchCart+drawer+onNavigate | test unit checkout/account + walkthrough |
| Next transpile chrome ('use client' lib TS) | SF-1 đã thêm `@ecommerce/chrome` transpilePackages (next.config.mjs:5) | smoke `next build` nếu nghi |
| pnpm-lock đổi | KHÔNG thêm dep nào → không đụng lock | `git status` check cuối |
| Worktree thiếu node_modules | probe 09-09: frontend/node_modules MISSING | `pnpm install` trước rig (+ restart dev server khi thêm dep — đã có recipe) |

## 8. ACCEPTANCE (copy 1:1 từ context pack — KHÔNG đổi)

1. Storefront Header/Footer render từ chrome — nhìn giống hệt FI-390 direction; markup header riêng cũ KHÔNG còn trong repo (grep evidence).
2. Sửa 1 nhãn trong keys `chrome.*` → cả Next + shell hiện nhãn mới, không sửa app nào (evidence walkthrough).
3. Theme toggle 1 nguồn: toggle ở storefront → shell đồng bộ (cùng key); GA pageview + livechat vẫn bắn đúng (network evidence); cart-badge + account menu hoạt động cả 2 app.
4. Cross-app nav mượt: storefront → cart → account → back; locale switch giữ path (vi không prefix); nav-honesty + golden-path e2e XANH.
5. Unit tests storefront + shell xanh sau swap.

(Ghi chú giải đọc acceptance 3 — từ bracket/pack: cart-badge + account menu là component chrome đăng ký từ bootstrap shell (task §2.5) — "hoạt động cả 2 app" = demo chạy qua cả 2 app với cùng nguồn chrome; storefront header giữ LINKS /cart|/account theo ràng buộc nav-honesty của chính pack item 8.)
