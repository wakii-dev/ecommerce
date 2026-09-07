# SF-15 — engagement & platform — design (D22 Batch B2)

> Linear: FI-325 · Story: FI-310 · Context pack: `docs/superpowers/contexts/sf-15.md`
> Contracts: READ-ONLY (identity/catalog/notification pins đã freeze SF-2) · Song song SF-13/SF-14 — file-slice rời nhau.
> Spec-critic: PROCEED (P1 notes đã xử lý inline, vòng 1) · Autonomous run.

## 0. Root cause analysis

Platform (SF-1..12 merge) bán được hàng end-to-end nhưng thiếu lớp engagement/trust: đăng nhập chỉ email/password, không tự bảo vệ tài khoản, khách mất cơ hội mua lại khi hàng về, không cài-PWA/đổi-theme/chat được. D22 đóng gói 6 tính năng này làm batch cuối — **SCOPE ĐÓNG SAU SF-15**. Strategy: additive backend (services đã merge) + FE slices nhỏ; không đụng contracts, không đụng file-slice SF-13/14, không viết chat engine hay OTP SMS.

## 1. Problem

Khách không vào được bằng Google/Facebook; user không bật 2FA được; PDP hết hàng chỉ để khách bỏ đi; web không cài lên desktop, không dark mode, không chat. Ảnh hưởng: mất conversion + trust. Người chịu ảnh hưởng: khách mua + chủ shop (bán lại hàng restock).

## 2. Scope

**IN** (đúng pack): OAuth Google/Facebook (find-or-create + link email) · 2FA TOTP (setup/QR/backup codes/login verify/disable) · stock alert (API + restock checker + email 1 lần + PDP input) · PWA (manifest + SW + icons) · dark mode (ui-kit tokens + toggle shell/storefront) · live chat embed (env) · IT tests.

**OUT**: Apple/Zalo OAuth, SMS OTP, chat engine tự viết, PWA offline checkout, sửa contracts/**, đụng packages/auth + packages/contracts + file-slice SF-13/14, admin dark (optional — chỉ storefront + shell).

**Success criteria (binary)**: ACCEPTANCE pack — login Google → đúng tài khoản cũ khi email trùng; bật 2FA → login lại hỏi mã, backup code 1 lần, tắt cần password+mã; PDP hết hàng → email restock đúng 1 lần; DevTools thấy manifest + SW active, cài được; dark toggle giữ nguyên sau reload, theo `prefers-color-scheme` lần đầu; chat load khi có env, im lặng khi không; §5.16 epic spec đạt.

## 3. Touch map

```
backend/services/identity-service/**        (oauth/ + twofa/ packages additive; V11; SecurityConfig permitAll; Me.twoFactorEnabled)
backend/services/catalog-service/**         (stockalert/ package: V12 + entity/repo + public API + internal claim + inventory client; SecurityConfig POST permitAll)
backend/services/notification-service/.../stockalert/**  (file-slice: scheduler + client + mailer — KHÔNG đụng file SF-10/13/14 khác)
backend/gateway/src/main/resources/routes/gateway-auth.yml (+2 public-paths) · gateway-routes.yml (storefront predicate +manifest/sw/icons — additive ghi chú)
frontend/apps/mfe-account/src/**            (api.ts challenge-aware + OAuthButtons + OAuthCallbackPage + TwofaPages + AccountPage section + expose MF)
frontend/apps/shell/src/**                  (App.tsx route branches + main.tsx theme toggle + chat injector + remotes.d.ts)
frontend/apps/storefront-web/**             (components/pdp/StockAlertInput + app/manifest.ts + public/ + sw.js + register SW + ThemeToggle + LiveChat + layout metadata)
frontend/packages/ui-kit/src/styles/tokens.css  ([data-theme='dark'] additive)
frontend/e2e/tests/                          (spec mới: 2fa + stock-alert + pwa + dark)
infra/dev/mock-oauth-provider.mjs            (dev tool — browser verify không cần Google thật)
.env.example (append OAUTH_*, IDENTITY_2FA_KEY, LIVECHAT_*, NEXT_PUBLIC_/VITE_ chat)
```

## 4. Design

### 4.1 OAuth Google/Facebook (identity-service)

**Data** (`V11__oauth_twofa.sql`): `user_identities(id, user_id FK users, provider VARCHAR(16), provider_id VARCHAR(191), created_at, UNIQUE(provider, provider_id))`; `oauth_one_time_codes(id, code_hash UNIQUE, user_id, expires_at, consumed_at)` (exchange lazy-delete hết hạn); `users.password_hash` → **DROP NOT NULL** (OAuth-only user = NULL); entity `passwordHash` nullable.

**Flow** (đúng contract):
1. `GET /api/identity/oauth/{provider}/authorize` → provider không hỗ trợ → 400 problem+json. Có key → dựng redirect_uri `${identity.oauth.public-base-url}/api/identity/oauth/{provider}/callback`, state = JWT HS256 ngắn (5', claim: provider + nonce; **key HS256 random per-boot** — state chỉ cần sống 1 round-trip, không thêm env, single-instance MVP), 302 sang consent Google/Facebook (scope `openid email profile` / `email,public_profile`).
2. `GET .../callback?code&state` (hoặc `?error=`): **validate state BẮT BUỘC** (chữ ký, exp, khớp provider) — state thiếu/sai/hết hạn → 302 FE `?error=state_mismatch`, KHÔNG BAO GIỜ đổi code (chống login CSRF). Hợp lệ → đổi code lấy token + profile qua RestClient tới provider endpoints (Google: `oauth2.googleapis.com/token` + `openidconnect.googleapis.com/v1/userinfo`; Facebook: `graph.facebook.com/v19.0/oauth/access_token` + `/me?fields=id,name,email`): **email handling** — Google `email_verified != true` hoặc profile không có email → 302 `?error=no_email` (không link/create — chống account-takeover qua email chưa verify); email normalize lowercase. find user_identity theo (provider, provider_id) → có: login user đó; không: tìm user theo email → có: **link** (insert user_identities, không duplicate user); không: **create user** (email từ provider, fullName từ name, password_hash NULL, role CUSTOMER, publish `user.created` outbox như register). → sinh one-time code (32B random, SHA-256 hash lưu bảng `oauth_one_time_codes` trong V11, TTL 60s, single-use, gắn user_id; exchange/cấp mới lazy-delete row hết hạn) → `302` về `${identity.oauth.fe-redirect-base}/login/oauth/callback?code=...` (error → `?error=<code>`). Thu hồi (revoke) không làm — MVP.
3. `POST /api/identity/oauth/exchange` {code} → one-time code hợp lệ → đánh dấu used + issue `LoginSuccess` (accessToken + refresh cookie như login thường) — **ADR-1**: endpoint additive không có trong freeze (gap đã flag REQUIREMENT-GAP lên FI-310; contract mô tả flow nhưng không freeze bước này; precedent SF-13 audit endpoint).
4. `GET /.well-known/oauth-providers` → `{"google":bool,"facebook":bool}` theo env có key — **ADR-2** (nút login ẩn/hiện, single source of truth).

**Config** (`identity.oauth.*`): `google.client-id/secret`, `facebook.client-id/secret`, `public-base-url` (default `http://localhost:8080`), `fe-redirect-base` (default `http://localhost:5173`). Không key provider đó → authorize 400 + well-known false (nút ẩn). Gateway: `/api/identity/.well-known/**` ĐÃ public sẵn (gateway-auth dòng 21 — critic verify) → chỉ thêm `/api/identity/oauth/**` + `/api/identity/2fa/verify` + `/api/inventory/availability` (public GET cho guest stock-alert, §4.3).

**SecurityConfig**: permitAll `GET /oauth/**`, `POST /oauth/exchange`, `GET /.well-known/oauth-providers`. Stateless giữ nguyên (state qua signed JWT, không session).

**Login guard**: `login()` password — user OAuth-only (hash NULL) → `passwordEncoder.matches(raw, null)` NPE → sửa: hash NULL hoặc không match → 401 thống nhất.

### 4.2 2FA TOTP (identity-service)

**Data** (cùng V11): `two_factor(user_id PK FK users, secret_enc BYTEA (AES-GCM), enabled BOOL, pending_secret_enc BYTEA NULL, backup_codes TEXT[] (BCrypt hashes), created_at, enabled_at)`; `two_factor_challenges(id, user_id, token_hash UNIQUE, expires_at, consumed_at NULL, failed_attempts INT DEFAULT 0)`.

**APIs** (đúng contract shape):
- `POST /api/identity/2fa/setup` (JWT) → đang enabled → 409; sinh secret Base32 (java-otp, 160-bit, issuer "ShopVN", account = email) → lưu pending_enc → `TwoFactorSetupResponse{secret, otpauthUrl}` (QR render client-side từ otpauthUrl).
- `POST /api/identity/2fa/enable` (JWT, {code}) → verify TOTPAgainst pending (window ±1 step) → khớp: secret=pending, enabled=true, sinh 10 backup codes (8 ký tự A-Z0-9, BCrypt từng mã, plaintext trả đúng 1 lần) → `TwoFactorEnableResponse{recoveryCodes[]}`; sai → 400.
- `POST /api/identity/2fa/disable` (JWT) → body contract `{password}` (required, **giữ nguyên — không thêm field vào schema đóng băng**) + property optional `code` (JSON additional-property, FE gọi qua executeRequest route local như updateProfile precedent — **REQUIREMENT-GAP #2 đã flag lên FI-310**: pack ACCEPTANCE "tắt 2FA cần password + mã" không thể hiện trong `TwoFactorDisableRequest` frozen). Server behavior: password sai → 403; thiếu/sai `code` (TOTP hoặc backup) → 400 — client contract-compliant gửi `{password}` thôi nhận 400 (contract đã liệt kê response 400 nên tương thích).
- Login: password đúng + enabled → **không** issue token; tạo challenge (random 32B, hash lưu, TTL 5') → `TwoFactorChallenge{twoFactorRequired:true, challengeToken}` (HTTP 200, khớp oneOf LoginResponse).
- `POST /api/identity/2fa/verify` {challengeToken, code} (không JWT) → token còn hạn + chưa dùng; code = TOTP hiện tại (window ±1) hoặc 1 backup code (match → **xóa mã khỏi mảng** — dùng 1 lần) → issue `LoginSuccess` + refresh cookie như login. **Attempt cap**: code sai → KHÔNG consume token nhưng `failed_attempts++`; đạt 5 → consume luôn (phải login lại). Token consumed sai/hết hạn → 401.
- `Me` → `twoFactorEnabled` từ bảng (bỏ hardcoded false).

**Crypto**: AES-256-GCM mã hóa secret TOTP, key env `IDENTITY_2FA_KEY` (Base64 32B) — **không có key: profile dev dùng dev-key mặc định + WARN log; profile khác FAIL-FAST lúc boot** (không bao giờ chạy 2FA với key im lặng); dev-key ghi rõ trong `.env.example` chỉ dành dev. BCrypt cho backup codes + challenge token hash. State OAuth HS256: key SecureRandom per-boot (không env). TOTP lib: `com.eatthepath:java-otp:0.4.0` (0 deps, pin version properties như parent convention).

### 4.3 Stock alert (catalog + notification file-slice)

**Data** (catalog `V12__stock_alerts.sql`): `stock_alerts(id UUID PK, user_email VARCHAR(254), product_id UUID, variant_id UUID, status VARCHAR(16) ACTIVE|NOTIFIED, created_at, notified_at NULL)` + partial unique index `(user_email, variant_id) WHERE status='ACTIVE'` (dedupe đăng ký đang chờ).

**API** (đúng freeze): `POST /api/catalog/products/{slug}/stock-alert` `{email, variantId}` public → slug không tồn tại/không PUBLISHED → 404; email sai format/variant không thuộc product → 400 (validation service-level như `AdminCatalogService.bad`); **variant đang còn hàng (availability > 0) → 400** "Sản phẩm đang còn hàng" (chặn spam + giữ语义 alert = chỉ đăng ký khi hết hàng; client đã ẩn form khi còn hàng, server guard chống bypass); OK → upsert idempotent (đã có ACTIVE cùng email+variant → 202 không tạo dup) → 202. SecurityConfig: permitAll POST đúng path này.

**Restock flow** (chốt — ADR-3: không event mới vì contracts/events READ-ONLY; không REST generic của notification vì SF-13 song song có thể cùng thêm):
- catalog: `inventory/InventoryAvailabilityClient` (RestClient, `INVENTORY_BASE_URL`, timeout 1s) — gọi `GET /inventory/availability?variantIds=...` (cap 100).
- catalog internal: path `/api/catalog/internal/stock-alerts/**` — **shared-secret header `X-Internal-Token: ${CATALOG_INTERNAL_TOKEN}`** (catalog filter chặn 401 khi sai/thiếu; KHÔNG permitAll mù quáng — `/api/catalog/**` public ở gateway nên không có secret là rò PII email). Notification gọi URL service TRỰC TIẾP (`catalog.base-url` :8082, không qua gateway — pattern `notify.identity.base-url` sẵn có), kèm header.
  - `GET .../candidates?limit=50` → ACTIVE alerts của các variant có availability > 0 (check inventory, cache 30s per variant-batch), kèm product/variant name (vi) + slug để mail.
  - `POST .../claim` `{ids[]}` → atomic `UPDATE ... SET status='NOTIFIED', notified_at=now() WHERE id IN (...) AND status='ACTIVE'` → trả các row đã flip (idempotent claim — hai consumer tranh nhau chỉ 1 thắng).
- notification `stockalert/` (file-slice): `StockAlertProperties` riêng (prefix `notify.stock-alert`: catalog base-url + internal token + storefront-url + interval; KHÔNG đụng NotifyProperties SF-10); `StockAlertScheduler` (`@Scheduled fixedDelay ${notify.stock-alert.interval-ms:60000}`) → GET candidates → POST claim → từng alert gửi email (subject "Hàng về rồi — {product}", body HTML tiếng Việt, link PDP `${storefront-url}/vi/p/{slug}` — có locale prefix, route thật là `[locale]/p/[slug]`) qua JavaMailSender (pattern ThankYouMailer) → SendLog ghi từng email (status SENT/FAILED). Claim trước, gửi sau → **đúng 1 lần** (crash giữa chừng = mất mail, không dup — chấp nhận, ghi ADR).

**FE PDP** (`storefront-web/components/pdp/StockAlertInput.tsx`, client): tái dùng pattern AddToCart — check `GET /api/inventory/availability?variantIds=<variantId>` (qua Next rewrite /api) cho variant đang chọn: available > 0 → ẩn; = 0 → hiện form "Nhắn tôi khi có hàng" (input email + nút) → POST `/api/catalog/products/{slug}/stock-alert` → success → banner xác nhận; **fetch lỗi/401/network → available = null → ẨN form** (không hiện form khi không biết trạng thái — guest cần endpoint public: thêm `/api/inventory/availability` vào gateway public-paths, cùng lúc Fix cho badge "Hết hàng" của AddToCart với guest). Không đổi catalog PDP API (ADR-3b — AddToCart đã check availability client-side).

### 4.4 PWA (storefront-web)

- `app/manifest.ts` (Next route → `/manifest.webmanifest`): name "ShopVN", short_name, start_url `/vi`, display `standalone`, background/theme_color từ tokens (`--c-bg` / `--c-primary`), icons 192+512 PNG (+ maskable).
- `public/` tạo mới: `icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png` (180) — sinh từ 1 SVG logo chữ "S" nền đỏ (script python3 một-lần, commit PNG); `public/sw.js` **hand-written (ADR-4 — không thêm next-pwa dep)**: precache tối thiểu (manifest + offline fallback), cache-first cho `/_next/static/**` + icons, network-first cho navigation (fallback cache), **bypass `/api/**`** (không cache API), activate dọn cache cũ, skipWaiting.
- Root `app/layout.tsx`: metadata `applicationName`, `manifest`, `appleWebApp`, `icons`; client component `PwaRegister.tsx` ('use client') register `/sw.js` (prod only — dev skip để tránh cache nóng DateTime).
- gateway-routes.yml: storefront-web predicate **append** `/manifest.webmanifest,/sw.js,/icons/**,/apple-touch-icon.png` (additive, comment ghi SF-15).

### 4.5 Dark mode (ui-kit + shell + storefront-web)

- `ui-kit/src/styles/tokens.css`: thêm block `[data-theme='dark']` **additive cuối file** (cùng specificity với pattern admin hiện có — source-order thắng), đè palette nền/chữ/border/surface/tint; giữ tên biến nguyên (header convention "chỉ thêm").
- Shell: `ThemeToggle` component (client) — icon mặt trời/mặt trăng, viết vào `localStorage['ecommerce.theme']` ('light'|'dark'|null), null = theo `prefers-color-scheme`; set `document.documentElement.dataset.theme` = 'storefront'|'dark'; boot script inline trong `index.html` đọc localStorage + media query TRƯỚC paint (chống FOUC), main.tsx bỏ hard-set 'storefront' (chỉ set khi chưa có giá trị).
- storefront-web: cùng logic — root layout chèn script inline anti-FOUC + `ThemeToggle` client component trong Header (sau LocaleSwitcher). Reload giữ nguyên ✓; lần đầu theo system ✓.
- Admin MFE: không đổi (optional theo pack).

### 4.6 Live chat (storefront-web + shell)

- storefront-web: `LiveChat.tsx` client — `NEXT_PUBLIC_LIVECHAT_LICENSE_ID` có → inject `<script src="https://embed.tawk.to/{id}/default">` async; không → render null (không lỗi).
- shell: cùng logic qua `VITE_LIVECHAT_LICENSE_ID` trong main.tsx (inject 1 lần, guard window flag).
- Không tự viết engine; env thiếu = không load hoàn toàn.

### 4.7 Gateway + env

- gateway-auth.yml public-paths **append**: `/api/identity/oauth/**`, `/api/identity/2fa/verify`, `/api/inventory/availability` (pattern "THÊM 1 DÒNG" có sẵn trong file).
- gateway-routes.yml storefront predicate append PWA paths (4.4).
- `.env.example` append: `OAUTH_GOOGLE_CLIENT_ID/SECRET`, `OAUTH_FACEBOOK_CLIENT_ID/SECRET`, `IDENTITY_OAUTH_PUBLIC_BASE_URL`, `IDENTITY_OAUTH_FE_REDIRECT_BASE`, `IDENTITY_2FA_KEY`, `NEXT_PUBLIC_LIVECHAT_LICENSE_ID`, `VITE_LIVECHAT_LICENSE_ID`.

### 4.8 Test strategy

- **identity IT** (WireMock mock provider — pattern payment-service), **thuộc Task 1 (OAuth) + Task 2 (2FA)**: OAuth callback find-or-create + link-email-không-duplicate + error param + state sai → `?error=state_mismatch`; exchange single-use; well-known on/off theo env; OAuth-only user login password → 401; email chưa verify → `?error=no_email`. 2FA: setup→enable (sai code 400, đúng 200 + 10 codes) → login → challenge → verify TOTP (sinh code từ secret trong test bằng java-otp) → backup code 1 lần (dùng lại 401) → sai 5 lần → challenge consume → disable sai password 403 / thiếu mã 400 / đúng 204 → login thường quay lại OK.
- **e2e Playwright** (`frontend/e2e/tests/engagement.spec.ts`, chạy trên `make dev` — next dev): dark toggle persist qua reload; PDP hết hàng → stock-alert form success; **manifest.webmanifest 200 + JSON hợp lệ + icons link có mặt (KHÔNG assert `serviceWorker.ready` — PwaRegister dev-skip, quyết định ghi ở Task 7/11; SW active + cài được verify bằng storefront prod-build ở walkthrough Task 11)**.
- **catalog IT** (WireMock inventory): stock-alert POST 202 + idempotent dup + slug 404 + variant sai 400; internal candidates chỉ trả variant available (WireMock trả availability 0 rồi 3); claim atomic flip + claim lần 2 rỗng.
- **notification IT** (WireMock catalog internal + Mailpit thật): scheduler poll → gửi mail đúng nội dung → SendLog SENT → poll lại KHÔNG gửi lần 2 (claim rỗng) = "email 1 lần".
- **e2e Playwright** (`frontend/e2e/tests/engagement.spec.ts`, stack `make dev` — chi tiết ở bullet e2e phía trên, KHÔNG assert serviceWorker.ready).
- FE unit (vitest nơi sẵn có): ThemeToggle logic (localStorage/media query mock), StockAlertInput render condition.
- Browser verify (Rule 0, Task 11 — đi 7 dòng ACCEPTANCE pack): login Google qua **mock provider thật** (`infra/dev/mock-oauth-provider.mjs` — consumer của nó); 2FA turn-around (QR → mã TOTP app thật/test-harness → backup code → disable); restock email đọc trong **Mailpit UI**; PWA: storefront **prod build** (`next build && next start` port phụ) → DevTools thấy manifest + SW active + có thể cài; dark toggle; chat env on/off.

## 5. Impl outline

Thứ tự task (bracket): (1) identity oauth backend → (2) oauth UI → (3) 2fa backend → (4) 2fa UI → (5) catalog stock-alert API → (6) restock checker + email + PDP input → (7) PWA → (8) dark → (9) chat → (10) IT + e2e tổng. Mỗi task 1 atomic commit (`feat(scope): ...`); gateway/env gộp đúng task liên quan. Test đi trước/song song theo TDD nơi được (IT harness có sẵn).

## 6. Risks & unknowns

- **Migration đụng SF-13** (identity V11 của họ password-reset): re-check story branch TRƯỚC merge; đụng → renumber V12/V13 (file self-contained, rename an toàn).
- `password_hash` DROP NOT NULL: entity nullable + login guard; register flow không đổi (vẫn NOT NULL logic mức app).
- **Port :3000 đang 500** lúc khảo sát — xác định process chủ (lsof) trước browser verify; không tin health.
- `packages/auth login()` throw khi twoFactorRequired (comment "SF-15"): xử lý trong `mfe-account/src/api.ts` (không đụng packages/auth — ngoài touch map).
- Java 21 + Boot 3.3.5: java-otp 0.4.0 tương thích (pure Java 8+); WireMock 3.9.1 pin theo payment-service.
- TOTP verify và đồng hồ: window ±1 bước 30s — IT sinh code cùng JVM không trôi giờ; browser verify dùng app thật có thể lệch — chấp nhận window.
- Live chat: máy dev không có internet ra tawk.to → verify = script tag xuất hiện/không xuất hiện đúng env (không bắt buộc widget load thật).
