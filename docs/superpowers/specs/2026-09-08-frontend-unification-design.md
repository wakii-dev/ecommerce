# Frontend Unification — Spec (epic)

> Story: FI-397 — 1 layout chung + 1 session login tức thì + 1 port dev entry (trừ admin) · Ngày: 2026-09-08 (revised 2026-09-09)
> Nguồn: P0 analyst (verdict (c) hybrid) + Explore integration surface (file:line) + user quyết Q1 = **A (hybrid)** + user chốt thêm (09-09): **admin vào qua `http://localhost:3000/admin` (chung port entry) nhưng KHÔNG dùng chrome layout** — AdminApp giữ sidebar/topbar riêng full-bleed.
> ĐIỀU KIỆN TIỀN KIỆT: story fork từ `story/fi390-uiux-elevation` **SAU KHI FI-390 Done + merge** — trước đó KHÔNG đụng file FI-390 sở hữu (Header.tsx storefront, HeaderSlots/shell header, mini-cart drawer mfe-checkout, i18n namespaces).

---

## 0. IDEA-BRIEF (8 chiều)

- **Task**: hợp nhất frontend khách hàng: 1 chrome package dùng chung (Header/Footer/badge/menu/theme), session login đồng bộ tức thì đa tab đa app, 1 origin/URL dev entry. Admin trừ (giữ nguyên shell host + mfe-admin).
- **Output**: `packages/chrome` (mới) + `packages/auth` session-sync + dev 1-origin entry (proxy) + dev-stack/docker/e2e env cập nhật.
- **Users**: shopper (chrome liền mạch, login/logout nhất quán) + dev team (1 URL dev, 1 bộ chrome code).
- **Constraints**: không phá GA flows (Stripe saga, auth/2FA/OAuth, merge-cart, coupon, affiliate `?ref`, GA4 exactly-once); zero backend change (cookie contract `/api/identity` KHÔNG đổi); e2e 14 specs xanh; dep freeze (BroadcastChannel = Web API, không thêm package).
- **Input**: code hiện tại + FI-390 design direction hand-off (chrome theo design language đã duyệt — không designer pass mới).
- **Context**: hybrid D16 — Next :3000 (SSR/SEO) + shell Vite MF :5173 (checkout :5175/account :5176/admin :5177/skeleton :5178); 2 bộ header song song (storefront Header 85 dòng + shell HeaderSlots 3-slot); session cookie đã chung (host-only, không phân biệt port) nhưng sync chưa tức thì.
- **Success criteria**: xem §7 (binary).
- **Out-of-scope**: xem §8.

## 1. Quyết định đã chốt

| # | Quyết định | Chọn |
|---|---|---|
| Q1 | 1-port hướng | **A = hybrid (c)**: story này = chrome + session sync + dev 1-origin entry; migrate checkout/account vào Next = story RIÊNG sau (account trước, checkout sau), đăng ký roadmap ADR |
| auto | Chrome đặt chỗ | Package mới `frontend/packages/chrome` (phụ thuộc ui-kit + auth + i18n) — không nhét vào ui-kit (chrome = composition-layer nặng `'use client'`, giữ ui-kit sạch RSC primitives) |
| auto | Sync mechanism | BroadcastChannel (primary) + `storage` event fallback; message = `{type:'auth-changed'}` (KHÔNG mang token). **Race-safe (P0):** (a) refresh đa tab điều phối qua `navigator.locks` (Web Locks API — dep-free) hoặc BC handshake `refresh-start/refresh-done`; (b) 401-refresh → retry ĐÚNG 1 lần sau backoff ngắn TRƯỚC khi logout (cookie one-time rotate — auth-cookie.spec:41-72; refresh-fail hiện logout ngay AuthStore.ts:146-157); (c) broadcast CHỈ trên state TRANSITION (auth↔unauth) — receiver không re-broadcast trừ khi chính nó transition (chặn BC loop N-tab). Điểm cắm: `AuthStore.setToken` (:80-84) + `logout` (:199-204) |
| auto | 1-origin implementation | **User chốt (09-09): entry = `http://localhost:3000`** (Next) — bao gồm `/admin` (rewrite → shell, AdminApp render layout RIÊNG full-bleed, KHÔNG chrome wrap). PROBE: Next rewrites cho shell-routes + HMR workaround (Vite `server.hmr.clientPort` riêng mỗi remote — browser nối ws trực tiếp bypass entry); nếu HMR vẫn chết → fallback Vite-proxy/5174 ghi ADR. remoteEntry URLs của remotes phải same-origin qua entry |
| auto | Admin | Admin TRỪ khỏi chrome layout (giữ AdminApp sidebar/topbar riêng — hiện full-bleed ngoài `<main>` shell App.tsx:156-164, KHÔNG đăng ký HeaderSlots); chỉ đảm bảo ĐẾN ĐƯỢC qua entry :3000/admin; admin KHÔNG bị ảnh hưởng khác |
| auto | i18n chrome | Chrome KHÔNG import i18next trực tiếp — **labels phân giải qua `t` do host cung cấp, bind namespace `chrome.*`** trong `@ecommerce/i18n` (additive vi+en); CẤM props-label per-element (nếu labels qua props từ host thì "sửa 1 chỗ trong chrome" thất bại — §7.2). Host CHỈ cung cấp i18n instance/wrapper |
| auto | Theme | ThemeToggle + boot-script anti-FOUC vào chrome (1 nguồn). **Canonical key = `ecommerce.theme`** (shell ThemeToggle.tsx:16 đang dùng); chrome ThemeToggle THAY THẾ mọi toggle khác (kể cả toggle FI-390 có thể thêm vào storefront header); nếu key khác tồn tại → read-order migration (key khác là fallback cũ, ghi đè về canonical lần đầu toggle) |
| auto | Chrome build | Chrome xuất TS source thuần — Next consume qua `transpilePackages`, Vite consume qua workspace dep (KHÔNG dựng rollup/dual-output pipeline) |
| auto | Sequencing | Fork từ `story/fi390-uiux-elevation` sau FI-390 Done; NHÁNH ĐÍCH story này tạo TỪ nhánh đích FI-390 (không phải main) |

## 2. Problem framing — 3 việc tách rời (P0 analyst)

1. **Chrome = dedup code song song**: 2 bộ header cùng sống (storefront `components/Header.tsx` + shell `header/HeaderSlots.ts` 3-slot generic + `Header.tsx` render-only). Registry: shell đăng ký nav+theme (main.tsx:27,29); account đăng ký auth+orders+affiliate (bootstrap.tsx:43-47); checkout đăng ký cart-badge (bootstrap.tsx:52); admin KHÔNG đăng ký. Mỗi đổi nav/logo/theme = sửa 2 nơi → drift.
2. **Session = UX-gap tức thì + dependency ẩn**: cookie refresh đã chung host-only path=/api/identity (AuthController.java:140-144). Thiếu: (i) 127.0.0.1 vs localhost = 2 cookie host; (ii) logout lan app khác chỉ ở lần refresh kế; (iii) không sync đa tab. **BroadcastChannel/storage là same-origin** → `:3000` vs `:5173` khác origin = sync tức thì BẤT KHẢ THI hiện trạng dev → goal session PHỤ THUỘC cứng 1-origin. Prod đã same-origin qua gateway :8080 (chỉ thiếu code sync).
3. **Port = 2 bài khác nhau**: (a) 1-origin dev là dev-parity (prod đã 1 entry :8080/nginx, gateway-routes.yml:55-61 + :116-118); (b) migrate = kiến trúc end-state (7 blockers đã liệt kê — story riêng).

## 3. Kiến trúc — SF structure + tier map

**Mechanism-vs-content (anti-duplicate, chốt trước):**
- **Tier 0 sở hữu mechanism**: SF-1 = chrome package toàn bộ (Header slots + Footer + ThemeToggle + boot script + CartBadge widget + AuthMenu widget + SessionBoot + I18nProvider wrapper + dual-build). SF-2 = session-sync core trong `packages/auth` (BroadcastChannel + storage fallback + redirect 127.0.0.1 helpers). SF-3 = 1-origin entry (probe + proxy config + dev-stack/env/e2e-env).
- **Tier 1 chỉ wire**: SF-4 consume chrome vào Next layout + shell adapter (không viết mechanism mới).
- Kiểm tra gộp: SF-1/SF-2/SF-3 là 3 tập file rời nhau (chrome pkg / auth pkg + middleware / scripts+configs); SF-4 chỉ wiring; không 2 SF nào ≥50% tasks cùng loại.

### SF-1 chrome-package (Tier 0) — Design: none (theo FI-390 direction hand-off)
**What**: 1 bộ chrome duy nhất chạy được CẢ Next (SSR-able export + client islands) LẪN shell Vite (registry adapter). Chrome là **MF shared singleton** (thêm vào `SHARED_SINGLETONS` vite-preset.mjs — 1 dòng, granted SF-1) kẻo host+remote bundle 2 instance registry → badge/menu biến mất (đúng lớp bug i18next BUG-04). Demo (phạm vi SF-1 — P0 re-scope): shell Header adapter render chrome cùng nguồn; cart-badge ĐĂNG KÝ TỪ mfe-checkout hiển thị trên shell host render (chứng minh 1 instance); unit SSR `renderToStaticMarkup` SiteHeader/Footer sạch; /ui-kit demo chrome showcase. *(Demo "Next layout render chrome + cross-app label/theme sync" thuộc SF-4 — cần layout swap + same-origin.)*
**Tasks (14)**: scaffold-package-turbo-workspace-ts-source-consumption / chrome-vite-preset-shared-singletons-1-line / header-slots-registry-move-to-chrome-update-import-callsites / shell-header-adapter-final-state-sf1 / site-header-ssr-able-slots-props-render-to-static-markup / footer-chrome-port / theme-toggle-canonical-key-ecommerce-theme-boot-script / cart-badge-widget-extract-checkout-wraps / auth-menu-widget-extract-account-wraps / session-boot-provider-ensure-session / i18n-t-namespace-chrome-contract-keys / locale-switcher-chrome / unit-tests-next-transpile-vite-both-singleton / ui-kit-demo-chrome-showcase-badge-from-remote-evidence.
**Ownership (P1):** SF-1 sở hữu registry move + TẤT CẢ import call-site updates (shell main.tsx:27,29; mfe-account bootstrap.tsx:43-47; mfe-checkout bootstrap.tsx:52 đổi import sang chrome) + trạng thái CUỐI của shell Header.tsx (adapter). SF-4 chỉ hoán đổi component đăng ký còn sót + wire Next, KHÔNG viết lại adapter.
**Dev ports (P0):** SF-1 chạy dev servers trên offset **+500** (shell 5673, remotes 5675/5676/5677 qua `REMOTE_*_URL`, storefront 3500 qua `--port`/PORT) — tránh port war với SF-2/SF-3/FI-390 worktrees (dev-stack hard-fail khi port giữ).
Ghi chú: CartBadge/AuthMenu extract TỪ mfe-checkout/mfe-account (chrome sở hữu component; MFE giữ đăng ký HeaderSlots — registration flow không đổi, chỉ nguồn component đổi).

### SF-2 session-sync (Tier 0) — Design: none
**What**: login/logout ở 1 tab/app lan tức thì tới mọi tab/app cùng origin, KHÔNG sinh spurious logout (race one-time rotate được điều phối); 127.0.0.1 tự về localhost; mô hình cookie+in-memory GIỮ NGUYÊN (không token vào storage/BC message). Demo: 2 tab cùng origin — login tab 1 → tab 2 header đổi user ngay (≤1 POST refresh/tab, không reload); logout tab 1 → tab 2 out ngay; không BC loop.
**Tasks (11)**: session-sync-module-broadcastchannel-storage-fallback-ssr-guard / authstore-hooks-settoken-logout-transition-only-broadcast / cross-tab-refresh-coordination-navigator-locks-handshake / refresh-401-retry-once-backoff-before-logout / receiver-refresh-single-flight-no-rebroadcast / configure-auth-auto-start-listener / redirect-127-001-to-localhost-next-middleware-exclude-next-static / redirect-vite-plugin-middleware-packages-config / guest-cart-token-consistency-check-binary-samekey-crossapp / unit-tests-sync-matrix-jsdom-rotate-race / docs-adr-session-sync-contract.
Ghi chú race (P0): multi-tab refresh phải serialize (Web Locks `navigator.locks` hoặc BC handshake refresh-start/done); 401-refresh → retry ĐÚNG 1 lần sau backoff ngắn trước logout; broadcast CHỈ transition auth↔unauth. 2FA challenge không set token → không broadcast (đúng). OAuth callback setToken như thường → broadcast tự nổ. SSR-guard: sync module lazy client init (không BroadcastChannel top-level — renderToStaticMarkup phải sạch). **e2e multi-tab = 2 PAGES (tabs) TRONG CÙNG 1 Playwright context** (P1: multi-context = cookie jar + storage partition riêng → BC/cookie không xuyên context — fail 100% như viết sai); gate same-origin proof chạy docker full ISOLATED theo RECIPE trong context pack (port base +400, compose project-name riêng, PG port riêng, JWKS/GATEWAY_URL env export).

### SF-3 dev-one-origin-entry (Tier 0) — Design: none
**What**: dev mở ĐÚNG **`http://localhost:3000`** (user chốt) dùng được toàn flow mua hàng home→PLP→PDP→cart→checkout→account **VÀ `/admin`** (admin render layout RIÊNG của AdminApp — full-bleed, KHÔNG chrome wrap); HMR 2 bên còn sống (Vite `server.hmr.clientPort` riêng mỗi remote — ws nối trực tiếp bypass entry); remotes load được qua entry. Demo: 1 URL :3000 đi hết golden path + mở được /admin với layout admin riêng.
**Tasks (9)**: probe-hmr-remoteentry-next-rewrites-clientport-workaround / implement-entry-3000-rewrites-admin-included / dev-stack-entry-update-banner-healthcheck / dev-stop-port-list / env-example-remote-url-site-url-defaults-update / e2e-helpers-env-baseurl-single-origin / docs-dev-entry-readme / probe-evidence-golden-path-1-url-admin / shellurl-same-origin-relative-site-ts.
Ghi chú: prod KHÔNG đổi (đã 1 entry :8080; gateway routes /admin → shell-web nguyên trạng). `next.config.mjs` rewrites() ĐÃ TỒN TẠI (/api, /media) — APPEND shell-routes vào array, KHÔNG thay thế function. lib/site.ts `shellUrl()` → same-origin relative `''` (link `shellUrl()+'/cart'` ra `/cart` — cấm `//cart`).
**Dev ports (P0):** SF-3 probe dùng offset **+600** (Next 3600, shell 5773, remotes 5775-77) khi thử entry config — tránh port war; entry CUỐI CÙNG trên :3000 (không offset) sau khi probe xong.

### SF-4 consume-chrome-wiring (Tier 1) — Depends on: SF-1, SF-3 (P0-3: cần 1-origin để demo cross-app + dọn shellUrl uses không conflict)
**What**: storefront-web + shell dùng chrome THẬT (xóa header/footer duplicate), theme/i18n/boot 1 nguồn, demo cross-app chạy được trên entry 1-origin. Demo: sửa 1 nhãn keys chrome.* → cả 2 app đổi cùng lúc; theme toggle 1 app → cả 2 đồng bộ; Next render chrome identical shell.
**Tasks (10)**: next-layout-header-footer-swap-chrome / delete-storefront-dup-header-footer-keep-local-islands / theme-key-canonical-adopt-toggle-swap / ga-pageview-livechat-wiring-via-chrome-boot / bootstrap-register-chrome-components-delete-internal-wrappers-grep-zero / i18n-t-chrome-namespace-wire-host-provider / unit-tests-storefront-shell-update / e2e-golden-nav-honesty-subset-green / walkthrough-cross-app-nav-screenshots / delete-next-public-shell-url-cross-origin-uses.
Ghi chú: xóa code = phần của task (không để dead code); `nav-honesty` regex link `/cart|/account` relative giữ pass; KHÔNG viết lại shell Header adapter (SF-1 sở hữu final state). **Task 5 exit criteria cứng (P1):** bootstrap.tsx đăng ký component TỪ `@ecommerce/chrome` TRỰC TIẾP; wrapper CartBadge/AuthWidget nội bộ XÓA; `grep` 0 import wrapper sót. **Admin KHÔNG đụng** (KHÔNG chrome wrap — chỉ verify /admin còn vào được qua entry).

### SF-5 convergence-qa (Tier 2) — Depends on: SF-2, SF-3, SF-4
**What**: thống nhất verify end-to-end trên nhánh đích: sync matrix đầy đủ, 1-origin golden path, e2e FULL, docker full vẫn đúng. Demo: full suite xanh + sync demo video.
**Tasks (10)**: sync-matrix-2tab-2app-login-logout-2fa-oauth / one-origin-golden-path-walkthrough / 127-redirect-verify-matrix / e2e-full-suite-14-specs-green / docker-full-mode-regression-8080 / gateway-routes-regression-check / chrome-cross-host-visual-consistency / unit-tests-monorepo-green / perf-sanity-dual-bundle-check / walkthrough-record-signoff-adr-roadmap-b.
Ghi chú: sweep fail → fix task về SF sở hữu (SF-1 chrome / SF-2 auth / SF-3 entry / SF-4 wiring), re-run cap 2 vòng — SF-5 không tự sửa code surface.

**Tier map**: SF-1 (0) ∥ SF-2 (0) ∥ SF-3 (0) → SF-4 (1, dep SF-1 + SF-3) → SF-5 (2, dep SF-2+3+4). **Dev-port map (P0 — tránh port war khi 3 SF Tier-0 song song):** e2e/docker +400 · SF-1 dev servers +500 (shell 5673, remotes 5675-77, Next 3500) · SF-3 probe +600 (Next 3600, shell 5773, remotes 5775-77; entry cuối :3000). File-conflict chéo SF: SF-1 = packages/chrome + import call-sites (shell main.tsx, 2 MFE bootstraps) + vite-preset.mjs + shell Header adapter; SF-2 = packages/auth + storefront middleware.ts + packages/config vite-plugin redirect; SF-3 = scripts/.env/e2e-helpers/vite+next config rewrites; SF-4 = swap component + Next layout. **Anchor rule mở rộng**: `packages/config/vite-preset.mjs` — SF-1 CHỈ thêm `@ecommerce/chrome` vào SHARED_SINGLETONS (1 dòng); SF-2 CHỈ thêm plugin redirect — khác vùng file. `next.config.mjs`: SF-1 chỉ thêm transpilePackages dòng; SF-3 chỉ APPEND rewrites block (rewrites() đã tồn tại — không thay function).

## 4. Second-order effects — ràng buộc cứng

1. **e2e baseURL**: helpers/env.ts:37-38 `STOREFRONT`/`SHELL` defaults → 1-origin; specs đọc env — đổi defaults là đủ cho đa số; auth-cookie.spec (:21 HTTP-level qua SHELL proxy) re-verify qua entry mới; nav-honesty :83,91 regex `/cart|/account` relative giữ pass.
2. **Chrome SSR-able**: Header/Footer core render server được trong Next (SEO + nav-honesty cần links trong HTML đầu); chỉ islands (cart-badge, auth-menu, theme-toggle, locale-switcher) là `'use client'`.
3. **i18n**: chrome nhận labels qua props/provider (cấm import trực tiếp i18next — dual-instance BUG-04); keys `chrome.*` additive vi+en song song.
4. **Theme**: canonical key = `ecommerce.theme` (shell ThemeToggle.tsx:16) + 1 boot script anti-FOUC duy nhất trong chrome; storefront-web hiện 0 hit theme code — nếu FI-390 giới thiệu toggle/key riêng ở header storefront, chrome ThemeToggle THAY THẾ nó (wrap-point, không thêm cạnh nhau); key khác (nếu có) = fallback cũ, đọc-thứ-tự migrate về canonical.
5. **MF boundaries**: (a) không đụng singleton injection (react/i18next/auth shared singletons giữ nguyên); registrations HeaderSlots nguyên trạng, chỉ component nguồn đổi sang chrome.
6. **GA/livechat**: contract `window.gtag` + purchase event checkout giữ nguyên; livechat double-inject guard giữ nguyên khi boot qua chrome.
7. **Guest cart token**: localStorage key `ecommerce.guest_cart_token` chia sẻ storefront AddToCart + cartApi — sau 1-origin cùng origin tự nhất quán. Binary check (SF-2): cùng 1 key được read/write từ cả 2 app trên 1 origin (jsdom assert); token stale từ origin dev cũ là dev-only self-heal (merge 400/404 → forget im lặng, cartApi.ts:177-192) — không phải acceptance.
8. **Contracts/API/DB**: ZERO — cookie `/api/identity` contract, refresh endpoint, gateway routes, affiliate `?ref` middleware không đổi. 127-redirect là FE-only (middleware + vite plugin).
9. **Dep freeze**: BroadcastChannel/storage = Web API; http-proxy sẵn trong Vite; không thêm package mới. `@module-federation/vite` GIỮ (admin/skeleton vẫn MF).
10. **FI-390 ownership**: mọi file FI-390 sở hữu (header 2 app, mini-cart, i18n namespaces checkout./account.) chỉ đụng sau FI-390 Done — điều kiện fork; chrome wrap thay vì rewrite work đã elevated.

## 5. Gate scope mỗi SF

- **SF-1**: unit chrome (vitest, jsdom + SSR renderToStaticMarkup 2 chế độ) + demo **cart-badge đăng ký từ mfe-checkout hiển thị trên shell host render** (single-instance evidence, dev ports +500) + shell-side walkthrough + 4 trạng thái theme. *(KHÔNG assert Next-layout render hay cross-app sync — SF-4.)*
- **SF-2**: unit sync matrix (jsdom BroadcastChannel mock + storage fallback + rotate-race case) + e2e auth-cookie extension **multi-tab = 2 pages CÙNG context** (env tự thân) + same-origin proof trên docker full ISOLATED theo recipe pack (port base **+400**, compose project-name riêng, PG port riêng).
- **SF-3**: probe evidence (HMR clientPort + remoteEntry qua entry :3000, dev ports +600 khi probe) + golden-path + **/admin layout riêng** walkthrough + e2e subset (golden-path, nav-honesty) với env mới.
- **SF-4**: unit storefront/shell update + e2e subset (golden-path, nav-honesty) + walkthrough cross-app (label chrome.* 2 app + theme sync) TRÊN entry 1-origin.
- **SF-5**: FULL e2e 14 specs + sync matrix (2 pages same context) + docker full regression (+400 offset) + theme legacy-key migration check + sweep §7.9/§7.10 (pnpm-lock 0 dep + zero backend diff).

## 6. ACCEPTANCE hiện vật mỗi SF

Context packs `docs/superpowers/contexts/fi397-sf-{1..5}.md` (Spec slice / Touch map / ACCEPTANCE user-visible / Boundary). ACCEPTANCE là thứ verifier Phase 5 kiểm.

## 7. Success criteria (binary, epic level)

1. `grep -rn "HeaderSlots" frontend/packages/chrome` ≥ 1 hit VÀ storefront `components/Header.tsx` + shell `header/Header.tsx` không còn markup header riêng (chỉ adapter/import chrome) — 1 nguồn layout; cart-badge remote-registration hiển thị trên host (1 instance chrome — singletons evidence).
2. Sửa 1 nhãn trong keys `chrome.*` (@ecommerce/i18n) → cả Next lẫn shell hiện nhãn mới (walkthrough evidence, không sửa app nào — cơ chế t-provider, không props-label).
3. Sync matrix PASS: 2 pages (tabs) TRONG CÙNG Playwright context × 2 app — login A → B: ≤1 POST refresh per page (network log) + header user cập nhật KHÔNG reload (assert không navigate); logout A → B out ngay; 2FA challenge KHÔNG broadcast session sai; KHÔNG spurious logout trong 20 chạy liên tiếp (rotate-race regression).
4. `127.0.0.1:3000` + `127.0.0.1:5173` redirect về `localhost` tương ứng (curl -I evidence; matcher loại trừ `/_next` + static assets).
5. Dev golden-path qua ĐÚNG `http://localhost:3000` (entry — user chốt): home→PDP→cart→checkout→confirmation→account **+ /admin (layout admin riêng, không chrome)** không đổi port tay; HMR còn sống ở cả Next page lẫn Vite page (probe evidence clientPort).
6. e2e FULL 14 specs xanh trên nhánh đích (baseURL/env mới).
7. Unit tests monorepo xanh (chrome pkg mới + auth sync tests + storefront/shell updates).
8. Docker full mode regression (isolated +400): :8080 (+offset) toàn flow OK **+ /admin qua entry**; nginx/gateway routes không đổi.
9. pnpm-lock 0 dependency mới (BroadcastChannel + Web Locks = Web API) — verify trong SF-5 sweep.
10. Zero diff backend/ + contracts/ (mọi change FE-only) — verify trong SF-5 sweep; cookie contract `/api/identity` không đổi (auth-cookie.spec xanh nguyên trạng).
11. ADR roadmap migration (b) checkout/account → Next (thứ tự account→checkout, 7 blockers liệt kê) trong `docs/adr/`.
12. Visual walkthrough record + user sign-off.

## 8. Boundary (KHÔNG làm)

- KHÔNG migrate checkout/account/admin vào Next trong story này (roadmap ADR thôi — Q1 A).
- KHÔNG đụng mfe-admin (trừ admin per yêu cầu); KHÔNG đụng gateway/nginx/docker-compose (prod đã 1 entry; full-mode regression chỉ verify).
- KHÔNG đổi mô hình auth (cookie httpOnly + token in-memory GIỮ; không token vào localStorage/sessionStorage/BC message); KHÔNG đổi cookie contract.
- KHÔNG token vào BC message (chỉ event signal); KHÔNG thêm dependency mới; KHÔNG đụng backend/**, contracts/**.
- KHÔNG start trước khi FI-390 Done + merged vào `story/fi390-uiux-elevation`; nhánh đích story này fork TỪ nhánh đích FI-390.
- KHÔNG merge vào main — PR là quyền người.
