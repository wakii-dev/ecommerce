# Story: FI-397 — Frontend Unification — chrome + session tức thì + 1-origin dev

Destination: story/fi397-unify-frontend

## Merge sequence + precondition (coordinator-owned)
PRECONDITION: story fork từ `story/fi390-uiux-elevation` — chỉ start SAU KHI FI-390 Done + merged (mọi file FI-390 sở hữu phải có trên base). Merge TUẦN TỰ SF-1 → SF-2 → SF-3 → SF-4 → SF-5 vào `story/fi397-unify-frontend` (merge PARENT vào sf-branch trước, update-ref FULL refname + 2 ancestor guards); smoke golden-path sau MỖI merge; **SF-4 chỉ start sau SF-1 + SF-3 merge** (cần chrome + 1-origin entry); SF-5 sau merge cuối. **Dev-port map (P0 — 3 SF Tier-0 song song không port war):** e2e/docker +400 · SF-1 dev servers +500 (shell 5673, remotes 5675-77, Next 3500) · SF-3 probe +600 (Next 3600, shell 5773, remotes 5775-77; entry cuối :3000 không offset).

## SF-1 chrome-package
Tier: 0
linear:
Design: none
What: 1 bộ chrome duy nhất (@ecommerce/chrome, TS source — Next transpilePackages + Vite workspace consume, KHÔNG dual-output pipeline) chạy được CẢ Next (SSR-able export + client islands) LẪN shell Vite (registry adapter); chrome là MF shared singleton (SHARED_SINGLETONS vite-preset — 1 dòng) kẻo host+remote 2 instance registry. SF-1 sở hữu registry move + TẤT CẢ import call-site updates (shell main.tsx:27,29; mfe-account bootstrap:43-47; mfe-checkout bootstrap:52) + final state shell Header.tsx adapter; CartBadge/AuthMenu extract từ 2 MFE (chrome sở hữu component, MFE giữ registration flow, chỉ nguồn component đổi); ThemeToggle canonical key ecommerce.theme + boot script anti-FOUC 1 nguồn; i18n labels qua t-namespace chrome.* (cấm props-label); locale-switcher; session-boot provider (ensureSession pattern hiện có). Demo (phạm vi SF-1): shell adapter render chrome cùng nguồn; cart-badge ĐĂNG KÝ TỪ mfe-checkout hiển thị trên shell host (single-instance evidence); unit SSR renderToStaticMarkup sạch; /ui-kit demo chrome showcase. Demo Next-layout + cross-app label/theme sync thuộc SF-4 (cần layout swap + 1-origin). Dev servers chạy offset +500 (shell 5673, remotes 5675-77, Next 3500).
Depends on: —
Tasks: scaffold-package-turbo-workspace-ts-source-consumption / chrome-vite-preset-shared-singletons-1-line / header-slots-registry-move-to-chrome-update-import-callsites / shell-header-adapter-final-state-sf1 / site-header-ssr-able-slots-props-render-to-static-markup / footer-chrome-port / theme-toggle-canonical-key-ecommerce-theme-boot-script / cart-badge-widget-extract-checkout-wraps / auth-menu-widget-extract-account-wraps / session-boot-provider-ensure-session / i18n-t-namespace-chrome-contract-keys / locale-switcher-chrome / unit-tests-next-transpile-vite-both-singleton / ui-kit-demo-chrome-showcase-badge-from-remote-evidence

## SF-2 session-sync
Tier: 0
linear:
Design: none
What: login/logout ở 1 tab/app lan tức thì mọi tab/app cùng origin KHÔNG sinh spurious logout: refresh đa tab serialize (Web Locks navigator.locks hoặc BC handshake refresh-start/done); 401-refresh retry ĐÚNG 1 lần sau backoff ngắn TRƯỚC logout (cookie one-time rotate); broadcast CHỈ transition auth↔unauth (chặn BC loop); message {type:'auth-changed'} không mang token; receiver gọi refresh() cookie-roundtrip không re-broadcast; SSR-guard lazy client init; 127.0.0.1 redirect localhost (Next middleware loại trừ /_next+static + Vite plugin); mô hình cookie+in-memory GIỮ NGUYÊN. Demo: 2 tab cùng origin login tab 1 → tab 2 header user ngay (≤1 POST refresh/tab, không reload); logout tab 1 → tab 2 out ngay; 20 chạy liên tiếp 0 spurious logout.
Depends on: —
Tasks: session-sync-module-broadcastchannel-storage-fallback-ssr-guard / authstore-hooks-settoken-logout-transition-only-broadcast / cross-tab-refresh-coordination-navigator-locks-handshake / refresh-401-retry-once-backoff-before-logout / receiver-refresh-single-flight-no-rebroadcast / configure-auth-auto-start-listener / redirect-127-001-to-localhost-next-middleware-exclude-next-static / redirect-vite-plugin-middleware-packages-config / guest-cart-token-consistency-check-binary-samekey-crossapp / unit-tests-sync-matrix-jsdom-rotate-race / docs-adr-session-sync-contract

## SF-3 dev-one-origin-entry
Tier: 0
linear:
Design: none
What: dev mở ĐÚNG http://localhost:3000 (user chốt) dùng được toàn flow home→PLP→PDP→cart→checkout→account VÀ /admin (admin render layout RIÊNG của AdminApp — full-bleed, KHÔNG chrome wrap); HMR 2 bên sống (Vite server.hmr.clientPort riêng mỗi remote — ws nối trực tiếp bypass entry); remotes load qua entry; prod KHÔNG đổi (đã 1 entry :8080; gateway /admin → shell-web nguyên trạng); shellUrl() → same-origin relative '' (link shellUrl()+'/cart' ra /cart đúng, cấm //cart); next.config rewrites() ĐÃ TỒN TẠI — APPEND shell-routes, KHÔNG thay function; dev-stack/dev-stop/env-example/e2e-helpers cập nhật theo entry. Demo: 1 URL :3000 đi hết golden path + mở /admin layout riêng; probe evidence HMR clientPort + remoteEntry. Probe dùng offset +600 (Next 3600, shell 5773); entry cuối :3000.
Depends on: —
Tasks: probe-hmr-remoteentry-next-rewrites-clientport-workaround / implement-entry-3000-rewrites-admin-included / dev-stack-entry-update-banner-healthcheck / dev-stop-port-list / env-example-remote-url-site-url-defaults-update / e2e-helpers-env-baseurl-single-origin / docs-dev-entry-readme / probe-evidence-golden-path-1-url-admin / shellurl-same-origin-relative-site-ts

## SF-4 consume-chrome-wiring
Tier: 1
linear:
Design: none
What: storefront-web + shell dùng chrome THẬT: Next [locale] layout Header/Footer swap chrome + xóa dup header/footer (islands local giữ); theme canonical adopt + toggle swap; GA pageview/livechat wiring qua chrome boot (contract window.gtag + double-inject guard giữ); bootstrap đăng ký component TỪ chrome TRỰC TIẾP (wrapper CartBadge/AuthWidget nội bộ XÓA, grep 0 import sót); i18n t-host-provider wire; xóa NEXT_PUBLIC_SHELL_URL cross-origin uses. KHÔNG viết lại shell Header adapter (SF-1 sở hữu final state). Admin KHÔNG đụng (không chrome wrap — chỉ verify /admin vào được qua entry). Demo trên entry 1-origin: sửa 1 nhãn keys chrome.* → cả 2 app đổi; theme toggle 1 app → cả 2 đồng bộ; Next render chrome identical shell.
Depends on: SF-1, SF-3
Tasks: next-layout-header-footer-swap-chrome / delete-storefront-dup-header-footer-keep-local-islands / theme-key-canonical-adopt-toggle-swap / ga-pageview-livechat-wiring-via-chrome-boot / bootstrap-register-chrome-components-delete-internal-wrappers-grep-zero / i18n-t-chrome-namespace-wire-host-provider / unit-tests-storefront-shell-update / e2e-golden-nav-honesty-subset-green / walkthrough-cross-app-nav-screenshots / delete-next-public-shell-url-cross-origin-uses

## SF-5 convergence-qa
Tier: 2
linear:
Design: none
What: verify end-to-end trên nhánh đích: sync matrix 2 pages CÙNG Playwright context × 2app (login/logout/2FA/OAuth + 20-run rotate-race regression); one-origin golden path qua :3000 (kèm /admin layout riêng); 127-redirect matrix; e2e FULL 14 specs; docker full regression isolated +400 (recipe trong pack); gateway-routes regression (không đổi); chrome cross-host visual consistency + theme legacy-key migration check; unit tests monorepo; sweep pnpm-lock 0 dep + zero backend diff; perf sanity (chrome double-inclusion trong 1 bundle = fail); walkthrough record + ADR roadmap migration (b) account→checkout. Sweep fail → fix task về SF sở hữu (SF-1 chrome/SF-2 auth/SF-3 entry/SF-4 wiring), re-run cap 2 vòng — SF-5 không tự sửa code surface.
Depends on: SF-2, SF-3, SF-4
Tasks: sync-matrix-2tab-2app-login-logout-2fa-oauth / one-origin-golden-path-walkthrough / 127-redirect-verify-matrix / e2e-full-suite-14-specs-green / docker-full-mode-regression-8080-offset / gateway-routes-regression-check / chrome-cross-host-visual-consistency-theme-legacy-key-check / unit-tests-monorepo-green / perf-sanity-double-inclusion-fail-gate / walkthrough-record-signoff-adr-roadmap-b
