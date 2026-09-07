# Plan: SF-15 engagement & platform (social login + 2FA + stock alert + PWA + dark + chat)
Date: 2026-09-07 | Linear: FI-325 | Worktree: sf-15-engagement-platform
Spec: docs/superpowers/specs/2026-09-07-sf-15-engagement-platform-design.md · ADR: docs/adr/0005-sf15-oauth-exchange-endpoints.md

## 0. Root cause analysis

### Root cause
Epic đóng scope theo batch (D22 cuối cùng) — lớp engagement/trust chưa từng có trong SF-1..12 (chỉ email/password auth, không PWA/theme/chat, không kênh "báo khi có hàng"). Không phải bug — là phạm vi được chủ đích hoãn.

### Current state (before feature)
Login chỉ email/password (AuthController `/auth/*`); Me trả `twoFactorEnabled` hardcoded false; catalog không bảng alert, PDP đã hiện "Hết hàng" theo inventory availability (AddToCart) nhưng không làm gì tiếp; storefront-web chưa có `public/`, không manifest/SW; ui-kit chỉ 2 theme (storefront/admin); không chat.

### Expected outcome
Google/Facebook login vào đúng tài khoản (email trùng → link, không dup); user tự bật 2FA (QR + backup codes) và login phải qua mã; PDP hết hàng → khách đăng ký → hàng về nhận email đúng 1 lần; storefront cài-PWA được; dark mode 1 click (persist + system-first); chat widget theo env.

### Constraints & hardships
Contracts + packages/contracts + packages/auth READ-ONLY; SF-13/14 chạy song song (file-slice rời); không có Google/Facebook thật trên máy dev → mock provider (WireMock IT + `infra/dev/mock-oauth-provider.mjs` cho browser verify); notification không có REST generic → file-slice riêng.

### High-level strategy
Additive-only: packages mới `oauth/` + `twofa/` (identity), `stockalert/` (catalog + notification), components FE mới, 1 migration per service (identity V11, catalog V12), gateway append-only. FE autocomplete trên pattern sẵn có (AuthStore, HeaderSlots, AddToCart availability check).

## 1. Problem
Khách không vào được bằng social account; tài khoản chỉ protect bằng password; khách mất khả năng mua khi hàng tạm hết; web không cài được, không đổi theme, không chat — ảnh hưởng khách mua + chủ shop.

## 2. Scope
- **In**: OAuth Google/Facebook (find-or-create + link email + nút ẩn/hiện theo env) · 2FA TOTP setup/QR/enable/disable/login-verify + backup codes · stock alert API + restock checker + email 1 lần + PDP input · PWA manifest/SW/icons + metadata · dark tokens + toggle (shell + storefront) · live chat embed env · IT + e2e.
- **Out**: Apple/Zalo, SMS OTP, chat engine, offline checkout, contracts edits, packages/auth + packages/contracts, admin dark, file-slice SF-13/14.
- **Success**: ACCEPTANCE pack sf-15 (7 dòng user-visible) + §5.16 epic spec.

## 3. Touch map
- Modify: identity `SecurityConfig/MeController/AuthController(login guard)/pom/application.yml/V11` · catalog `SecurityConfig/V12/pom/application.yml` · gateway `gateway-auth.yml (+2 dòng) + gateway-routes.yml (storefront predicate +4 path)` · ui-kit `tokens.css` · shell `App.tsx/main.tsx/remotes.d.ts` · storefront-web `app/layout.tsx, [locale]/layout.tsx, Header.tsx, app.css` · mfe-account `api.ts, LoginPage.tsx, AccountPage.tsx, vite.config.ts, page.css` · `.env.example`.
- New: identity `oauth/**, twofa/**` · catalog `stockalert/**, inventory/InventoryAvailabilityClient` · notification `stockalert/**` · mfe-account `pages/OAuthCallbackPage, pages/TwoFactorPage, pages/twofa/*` · storefront-web `public/*, sw.js, components/pdp/StockAlertInput, components/ThemeToggle, components/LiveChat, components/PwaRegister, app/manifest.ts` · `infra/dev/mock-oauth-provider.mjs` · e2e `tests/engagement.spec.ts`.
- Regression candidates: login/refresh/logout flow, gateway auth (403 admin), PDP render, shell boot (theme hard-set), notification consumers SF-10.
- Shared surfaces: db_identity V11, db_catalog V12, gateway public-paths, env OAUTH_*/IDENTITY_2FA_KEY/LIVECHAT_*, Mailpit.

## 4. Design
- Chosen: ADR-0005 (exchange + well-known providers) · internal claim polling cho restock (ADR-3 trong spec) · hand-written SW · `[data-theme='dark']` additive · java-otp + AES-GCM + BCrypt · state = signed JWT HS256 (stateless).
- Alternatives dismissed: cookie-on-302 (cross-origin :8080≠:5173), event mới (contracts READ-ONLY), notification REST generic (SF-13 collision), next-pwa (dep nặng), Spring oauth2-client (session-based, xung STATELESS + khó WireMock).
- Edge cases: OAuth email trùng → link; OAuth-only user login password → 401 (hash NULL guard); backup code single-use (xóa khỏi mảng); challenge single-use + TTL 5'; claim atomic (2 poller không dup); inventory chết → candidates rỗng (không crash); chat/PWA env thiếu → im lặng; prefers-color-scheme lần đầu.
- Non-functional: secret 2FA mã hóa at-rest; one-time code SHA-256 at-rest + TTL 60s; redirect FE base qua env (không open-redirect — base cố định config); a11y toggle (aria-pressed); i18n vi/en copy objects theo pattern storefront.

## 5. Implementation outline

Tasks (thứ tự + phụ thuộc DAG):
- [ ] **Task 1 — oauth-google-facebook-identity** (backend): V11 migration (user_identities + two_factor + two_factor_challenges + users.password_hash DROP NOT NULL); `oauth/` package (OAuthProperties, OAuthProviderClient RestClient, OAuthController authorize/callback/exchange + well-known providers, OneTimeCodeService); pom + yml config; SecurityConfig permitAll; login guard hash NULL; `infra/dev/mock-oauth-provider.mjs`; .env.example. Commit: `feat(identity): oauth google/facebook find-or-create + link email`.
- [ ] **Task 2 — twofa-totp-enroll-verify** (backend): java-otp dep; `twofa/` package (TwoFactorService AES-GCM secret, setup/enable/disable/verify endpoints, challenge token single-use, backup codes BCrypt + xóa khi dùng); AuthController.login → TwoFactorChallenge branch; MeController.twoFactorEnabled thật; SecurityConfig permitAll /2fa/verify; IT WireMock. Commit: `feat(identity): 2fa totp enroll + login challenge`.
- [ ] **Task 3 — oauth-callback-login-pages-ui** (mfe-account + shell): api.ts challenge-aware login + oauth helpers (providers/exchange); LoginPage OAuth buttons (ẩn/hiện theo well-known); OAuthCallbackPage mới + expose MF; shell route `/login/oauth/callback` + remotes.d.ts. Commit: `feat(mfe-account): oauth buttons + callback page`.
- [ ] **Task 4 — twofa-login-flow-ui** (mfe-account): TwoFactorVerifyPage (nhập mã sau login challenge); AccountPage section bảo mật (bật: QR render từ otpauthUrl qua `qrcode` + backup codes show-once; tắt: password + mã); expose MF + shell route `/login/2fa`. Commit: `feat(mfe-account): 2fa enroll/verify UI`.
- [ ] **Task 5 — stockalert-api-catalog-register** (catalog): V12 stock_alerts; `stockalert/` (entity/repo/service/controller POST + internal candidates/claim); `inventory/InventoryAvailabilityClient`; SecurityConfig permitAll POST + internal; IT WireMock inventory. Commit: `feat(catalog): stock alert register + internal claim api`.
- [ ] **Task 6 — stockalert-restock-checker-email** (notification + storefront-web): notification `stockalert/` (StockAlertProperties, CatalogStockAlertClient, StockAlertScheduler poll/claim/send, RestockMailer template vi); storefront `StockAlertInput.tsx` (availability==0 → form) + PdpBuyBox mount + app.css; IT Mailpit 1-lần. Commit: `feat(notification+storefront): restock email scheduler + pdp stock alert input`.
- [ ] **Task 7 — pwa-manifest-service-worker** (storefront-web + gateway): public/ icons (script sinh PNG) + sw.js + app/manifest.ts + layout metadata + PwaRegister; gateway-routes predicate +paths. Commit: `feat(storefront): pwa manifest + service worker`.
- [ ] **Task 8 — darkmode-uikit-theme-toggle** (ui-kit + shell + storefront): tokens `[data-theme='dark']`; ThemeToggle (shared logic per-app, không new package); shell main.tsx boot script + slot; storefront Header + inline anti-FOUC script; vitest unit. Commit: `feat(ui-kit+shell+storefront): dark theme tokens + toggle`.
- [ ] **Task 9 — livechat-embed-env-config** (storefront-web + shell): LiveChat inject script theo NEXT_PUBLIC_/VITE_ env; mount root layouts. Commit: `feat(storefront+shell): live chat embed env config`.
- [ ] **Task 10 — engagement-it-tests** (cross): e2e `tests/engagement.spec.ts` (dark persist + stock-alert flow + manifest/SW); gateway-auth public-paths +2 dòng (gộp từ task 1/2 nếu chưa); full backend IT suite xanh; docs demo snippet. Commit: `test(e2e): engagement suite + gateway public paths`.

File structure: theo codebase conventions (package-per-feature trong service; FE components theo app; migration `db/migration/V*__*.sql`).
Testing strategy: IT WireMock (identity/catalog/notification) + vitest FE + Playwright e2e + browser walkthrough Rule 0 (mock provider thật, Mailpit UI, DevTools PWA, dark toggle, chat env on/off).

## 6. Risks & unknowns
- Must verify trước merge: migration numbers SF-13/14 trên story branch; port :3000 owner; generated TS types cho verify2fa signature.
- Assumptions: java-otp 0.4.0 tải được từ Maven Central; qrcode npm nhỏ gọn được chấp nhận (mfe-account dep duy nhất mới); Mailpit IT dùng được cho restock mail; tawk.to script chỉ verify có/không script tag (không cần load thật).
