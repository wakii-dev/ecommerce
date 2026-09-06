# SF-3 — identity + account — Design Spec

> Date: 2026-09-06 · Issue: FI-313 · Epic: FI-310 · Tier: 2 · Autonomous mode (spec-critic gate)
> Spec-critic round 1: FIX-P0-FIRST → đã patch 2 P0 (Me.phone read-path · admin-prefixes thực) + 7 P1 (claims roles[] · AuthConfig.identityBaseUrl · fetchImpl=authStore.fetch · bump registry · authReady guard · logout public · dev env contract) → PASS. P2 ghi nhận: login FE narrow 2FA-throw (đã fold §4.4), email lowercase (fold §4.2), swagger dev dùng direct port, multi-tab refresh race chấp nhận dev tradeoff, seed KHÔNG publish event (fold §4.2), JWKS qua gateway self-hop là chủ đích (independent từ convention strip).
> Nguồn: context pack `docs/superpowers/contexts/sf-3.md` + epic spec `2026-09-06-ecommerce-platform-design.md` (D7 auth) + contract freeze `contracts/openapi/identity.yaml`
> Status: Approved (autonomous — spec-critic PASS, self-answered từ pack; mọi epic-level question đã answered)

## 1. Problem

Greenfield: SF-1 (infra + template + gateway skeleton) và SF-2 (contracts freeze + packages/auth·ui-kit·i18n + federation harness) đã merge, nhưng chưa có AI đăng nhập được. SF-3 sinh identity-service từ template + wiring auth toàn hệ thống + MFE remote ĐẦU TIÊN trên federation harness thật. JWT RS256 + RBAC ở đây là nền cho 14 SF sau — sai RBAC = sai toàn hệ thống.

**Strategy (từ pack):** contract-first (code theo identity.yaml freeze), fork template-service, mọi file shared chỉ additive (routes per-service file, pom module append, shell append blocks).

## 2. Scope

**IN:**
1. `backend/services/identity-service/` — register/login/refresh/logout/me/jwks/admin-users, JWT RS256, refresh rotation cookie, RBAC `@PreAuthorize`, seed admin, outbox `user.created`
2. Gateway auth wiring — route `routes/identity.yml` + `routes/gateway-auth.yml` (public-paths tập trung) + JWT filter `/api/**` qua JWKS + guard `/api/admin/**` role ADMIN (403 server-side)
3. `frontend/apps/mfe-account` — remote mới (port 5176, name `mfe_account`): LoginPage / RegisterPage / AccountPage + AuthWidget đăng ký HeaderSlots
4. Shell integration (giới hạn): remote manifest + 3 lazy routes + AuthProvider wrap + Vite proxy `/api` → gateway + eager bootstrap import
5. `packages/auth` — module MỚI `login()/register()/logout()` (additive export; pack ghi SF-3 dùng API này từ packages/auth)

**OUT (boundary pack):** my-orders thật (link placeholder `/account/orders` — SF-9) · wishlist/my-reviews (SF-8) · social login / 2FA / password-reset (D21/D22 → SF-13/15) · sửa `contracts/` + `packages/contracts` + `packages/ui-kit` + `packages/i18n` (READ-ONLY) · route block service khác · KHÔNG đụng file SF-4/5 (song song).

**Success = 5 ACCEPTANCE (user-visible, pack):**
1. Đăng ký user mới → được login, header hiện tên; refresh trang vẫn đăng nhập (refresh cookie)
2. Access token hết hạn (15') → API call tự refresh, user không thấy lỗi
3. Token customer gọi `GET /api/admin/**` → 403 TỪ GATEWAY (server-side)
4. Admin seed login được; logout → refresh token revoked (reuse → 401)
5. Trang `/account` hiện đúng profile, sửa được full_name/phone

## 3. Touch map

```
TẠO      backend/services/identity-service/**            (fork template, port 8081, db_identity)
TẠO      backend/gateway/src/main/resources/routes/identity.yml
TẠO      backend/gateway/src/main/resources/routes/gateway-auth.yml
TẠO      frontend/apps/mfe-account/**
SỬA+     backend/pom.xml                                  (+1 module, append)
SỬA+     backend/gateway/pom.xml                          (+spring-boot-starter-oauth2-resource-server)
SỬA      backend/gateway/src/main/java/.../config/CorsConfig.java  (+@Order HIGHEST — preflight phải chạy TRƯỚC security chain)
SỬA+     frontend/apps/shell/vite.config.ts               (+remote account block + server.proxy /api)
SỬA+     frontend/apps/shell/src/remotes.d.ts             (+declare module 'account/*')
SỬA+     frontend/apps/shell/src/App.tsx                  (AuthProvider wrap + 3 lazy routes)
SỬA+     frontend/apps/shell/src/main.tsx                 (eager import account/bootstrap, catch warn)
SỬA+     frontend/packages/auth/src/{api.ts,index.ts,AuthStore.ts,package.json}  (module mới + AuthConfig +1 field + test)
SỬA+     frontend/pnpm-lock.yaml                          (importer mfe-account — pnpm install)
KHÔNG ĐỘNG  Makefile (đã wire svc=identity + dev-fe mfe-account) · docker-compose.yml (db_identity có sẵn)
           · pnpm-workspace.yaml (glob apps/* đủ) · contracts/** · packages/{contracts,ui-kit,i18n}
```

## 4. Design

### 4.1 Path conventions (quyết định StripPrefix — ghi cho SF-4/5 copy)

- Qua gateway: `/api/identity/auth/login` (đúng contract freeze).
- Gateway route: `StripPrefix=2` (bỏ `/api/identity`) — **service map path ngắn** `/auth/login`, `/me`, `/admin/users`, `/.well-known/jwks.json`. Lý do: comment SF-1 "service nhận path còn lại sau /api/<service>" + springdoc/actuator của service sống ở root (`/swagger-ui.html`, `/actuator/health` — qua gateway `/api/identity/swagger-ui.html`, `/api/identity/actuator/health` đều đúng). Placeholder `StripPrefix=1` của SF-1 mâu thuẫn chính comment của nó — giải quyết theo semantics, document tại identity.yml.
- Cookie `refresh_token` **Path=/api/identity** (path của BROWSER qua gateway, không phải path nội bộ service) — env `IDENTITY_COOKIE_PATH` default `/api/identity`, IT override.

### 4.2 identity-service (Java 21, Spring Boot 3, port 8081, db_identity)

**Flyway `V1__users_roles_refresh.sql`:**
```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(255) NOT NULL UNIQUE,
  password_hash varchar(100) NOT NULL,
  full_name     varchar(255) NOT NULL,
  phone         varchar(32),
  role          varchar(16)  NOT NULL DEFAULT 'CUSTOMER'
                CHECK (role IN ('CUSTOMER','ADMIN')),
  status        varchar(16)  NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,          -- SHA-256 hex của raw token
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```
Role là single column (pack pin "role enum customer/admin"); API expose `roles: [ROLE]` (mảng 1 phần tử) khớp contract.

**Deps:** fork pom template + `spring-boot-starter-security` + `spring-boot-starter-oauth2-resource-server` (Nimbus: vừa ENCODE vừa DECODE RS256 — D7 "native"). Flyway/postgres/springdoc/common-lib giữ nguyên template.

**JWT:** key từ `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH` — application.yml default `../infra/keys/jwt-{private,public}.pem` (make dev chạy `cd backend && mvn` nên relative từ `backend/` đúng repo root; IT override bằng key sinh trong test). `kid` = `${JWT_KID:identity-1}`. TTL access = `${JWT_ACCESS_TTL_SECONDS:900}` (15'). Claims: `sub` (user id), `role` (string — cho converter `ROLE_*` Spring), **`roles: [role]`** (mảng — `AuthStore.toUser()` đọc array, thiếu thì FE `hasRole()` luôn false), `email`, `fullName`. Email **normalize lowercase** ở register + login lookup (UNIQUE case-sensitive của PG). Sign bằng `NimbusJwtEncoder` + `RSAKey` (private); service verify token của chính mình bằng public key (resource-server decoder từ file, KHÔNG self-fetch JWKS). Seed admin KHÔNG publish `user.created` (schema ghi rõ event = khi đăng ký thành công; seed là system action).

**Refresh token:** raw = 32 byte random base64url cho cookie; DB chỉ giữ SHA-256 hex. TTL 30 ngày. **Rotation:** refresh thành công → revoke row cũ (set `revoked_at`) + cấp row mới + Set-Cookie mới. Reuse row đã revoke → 401 (đúng ACCEPTANCE 4). Logout → revoke + Set-Cookie Max-Age=0 → 204.

**Cookie:** `refresh_token` httpOnly, SameSite=Lax, Path=/api/identity, Max-Age 2592000. Không `Secure` (dev http). Same-origin qua Vite proxy nên Lax đủ (spec §3.4: "dev qua Vite proxy → gateway").

**Security config (service):** resource server decoder từ public key file; permitAll: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/.well-known/jwks.json`, `/actuator/health/**`, swagger paths; còn lại authenticated. `@EnableMethodSecurity` — `GET /admin/users` có `@PreAuthorize("hasRole('ADMIN')")`. JWT converter: claim `role` → authority `ROLE_<role>` (gateway + service cùng mapping — defense in depth).

**APIs (đúng contract freeze, RFC 7807 qua common-lib `ApiError`):**
| Method path (service) | Qua gateway | Request → Response |
|---|---|---|
| POST /auth/register | /api/identity/auth/register | `{email format, password ≥8, fullName ≥1}` → **201 UserSummary** `{id,email,fullName,roles}`; 409 email trùng; 400 validate |
| POST /auth/login | /api/identity/auth/login | → **200 LoginSuccess** `{accessToken, tokenType:Bearer, expiresIn:900, user}` + Set-Cookie; 401 sai creds |
| POST /auth/refresh | /api/identity/auth/refresh | không body, cookie → **200 RefreshResponse** `{accessToken, expiresIn}` + Set-Cookie (rotate); 401 hết hạn/sai/reuse |
| POST /auth/logout | /api/identity/auth/logout | cookie → **204** + revoke + xóa cookie; 401 không cookie |
| GET /me | /api/identity/me | bearer → **200 Me** `{id,email,fullName,phone,roles,twoFactorEnabled:false}` — `phone` trả undocumented (GAP — §6) |
| PATCH /me | /api/identity/me | `{fullName?, phone?}` → **200 Me** (GAP — xem §6) |
| GET /.well-known/jwks.json | /api/identity/.well-known/jwks.json | → **200 Jwks** `{keys:[{kty:RSA,kid,alg:RS256,use:sig,n,e}]}` |
| GET /admin/users | /api/identity/admin/users | bearer ADMIN, `?page&size&q` → **200 AdminUserPage**; 401/403 |

2FA/OAuth/password endpoints trong contract: **KHÔNG implement** (D21/D22 — SF-13/15; contract đã freeze sẵn path nhưng pack SF-3 không giao).

**Register flow:** validate (@Bean Validation) → kiểm `existsByEmail` → insert + `OutboxWriter.write("user.created", {userId,email,fullName,roles,createdAt}, X-Request-Id)` **cùng transaction** (common-lib MANDATORY propagation) → 201. Duplicate race → catch `DataIntegrityViolationException` → 409. Auto-login là việc FE (register 201 → gọi login — contract-compliant).

**Seed admin:** ApplicationRunner idempotent — đọc `ADMIN_EMAIL`/`ADMIN_PASSWORD` (application.yml default `admin@ecommerce.local`/`admin123` — giá trị dev khớp .env.example; prod phải set env thật); user chưa tồn tại → tạo role ADMIN (bcrypt); tồn tại → skip; KHÔNG publish `user.created`.

**Outbox relay:** enabled (template config giữ nguyên) — publish `user.created` lên exchange `ecommerce.events`. IT chỉ assert **row outbox** trong transaction (relay đã được common-lib + template IT chứng minh — tier-gate: SF-3 chỉ test những gì SF-3 + tier trước cung cấp).

### 4.3 Gateway (Spring Cloud Gateway WebFlux, port 8080)

**Deps:** + `spring-boot-starter-oauth2-resource-server`.

**`routes/identity.yml` (file MỚI — SF-3 sở hữu):**
```yaml
spring.cloud.gateway.routes:
  - id: identity
    uri: ${IDENTITY_URI:http://localhost:8081}
    predicates: [ "Path=/api/identity/**" ]
    filters: [ "StripPrefix=2" ]
```

**`routes/gateway-auth.yml` (file MỚI — public-paths TẬP TRUNG 1 FILE):**
```yaml
ecom.gateway.auth:
  jwks-uri: ${IDENTITY_JWKS_URI:http://localhost:8080/api/identity/.well-known/jwks.json}
  public-paths:                      # additive per SF sau (SF-5 thêm webhook vào đây)
    - /api/smoke
    - /actuator/**
    - /api/*/actuator/**
    - /api/identity/auth/register
    - /api/identity/auth/login
    - /api/identity/auth/refresh
    - /api/identity/auth/logout      # contract: cookie-only, không bearerAuth — token hết hạn vẫn logout được
    - /api/identity/.well-known/**
    - /api/catalog/**                # guest browse — SF-4
  admin-prefixes:
    - /api/admin/**                  # chữ ACCEPTANCE (path chưa có route → 403 trước 404)
    - /api/identity/admin/**         # endpoint admin THẬT hiện có — guard ở gateway + @PreAuthorize (D7 2 lớp)
    # Convention cho SF sau: thêm prefix admin của service mình (vd /api/ordering/admin/**)
```
JWKS URI mặc định đi QUA chính gateway (public path) → không phụ thuộc convention strip nội bộ.

**SecurityConfig (WebFlux):** `SecurityWebFilterChain` — publicPaths `permitAll()` → `/api/admin/**` `hasRole("ADMIN")` → `/api/**` `authenticated()` → còn lại permit (static/swagger gateway). Decoder = `NimbusReactiveJwtDecoder.withJwkSetUri(jwksUri)` (verify RS256 qua JWKS identity — spec §3.4 pin; identity down → 401 dev-acceptable). Converter claim `role` → `ROLE_*`. Unauthenticated trên protected → **401**; authenticated thiếu role → **403** (authorization chạy TRƯỚC route dispatch nên `/api/admin/**` chưa có route vẫn 403/404 đúng thứ tự: 403 khi role sai — ACCEPTANCE 3).

**CorsConfig:** thêm `@Order(Ordered.HIGHEST_PRECEDENCE)` — preflight OPTIONS phải chạy TRƯỚC security chain, không thì preflight của API cần auth bị 401 (1 dòng additive vào file SF-1, bắt buộc cho auth wiring đúng).

**application.yml:** `spring.config.import` + `optional:classpath:routes/*.yml` (wildcard — SF-4/5 chỉ drop file mới, không đụng application.yml).

### 4.4 packages/auth — module API (additive)

`AuthStore.ts` (có trong touch map): `AuthConfig` thêm field **`identityBaseUrl?: string`** (1 dòng, additive) — `configureAuth` hiện có là nguồn config DUY NHẤT (không thêm hàm trùng tên).

`src/api.ts` MỚI + export từ index (login/register/logout/updateProfile — không đụng code cũ):
```ts
login(input): Promise<AuthUser>        // POST login → setToken → trả user; response twoFactorRequired → throw '2FA chưa hỗ trợ (SF-15)'
register(input): Promise<AuthUser>     // POST register (201) → login tự động (auto-login) → trả user
logout(): Promise<void>                // POST logout (xóa cookie server) + authStore.logout()
updateProfile(input): Promise<Me-like> // PATCH /api/identity/me (gap endpoint — §6)
```
Client dựng bằng `createIdentityClient` từ `@ecommerce/contracts` với `baseURL = config.identityBaseUrl ?? ''` (rỗng = same-origin qua proxy), **`fetchImpl: authStore.fetch`** (bắt buộc — 401 → single-flight refresh → retry trên MỌI API call, ACCEPTANCE 2; `executeRequest` tự gắn Authorization nhưng KHÔNG tự refresh), `getToken: authStore.getToken`. `@ecommerce/auth` thêm dep `@ecommerce/contracts: workspace:*`. `updateProfile` không có trong generated client → gọi `executeRequest` với `RouteDef` local `['PATCH','/api/identity/me']` (exports sẵn, KHÔNG sửa contracts). Lỗi → `ApiErrorClient` (FE map message + field errors). Unit test vitest với fetchImpl stub: register→auto-login · 409/401 error mapping · **401→refresh→retry (stub trả 401 rồi 200 → assert refresh đúng 1 lần + request lặp)**.

### 4.5 mfe-account (remote MỚI — port 5176, federation name `mfe_account`)

```
frontend/apps/mfe-account/
├── package.json        (@ecommerce/mfe-account; deps = skeleton + @ecommerce/contracts — toàn catalog:/workspace:*)
├── vite.config.ts      (defineMfeConfig name mfe_account, exposes 5 module, port 5176, proxy /api → :8080)
├── index.html · tsconfig.json
└── src/
    ├── main.tsx        (standalone debug page — pattern skeleton)
    ├── bootstrap.tsx   (expose './bootstrap': initAccountShell({HeaderSlots}))
    ├── AuthWidget.tsx  (expose './AuthWidget' — đăng ký slot 'right')
    ├── api.ts          (configureAuth + helpers goi packages/auth)
    └── pages/ LoginPage.tsx · RegisterPage.tsx · AccountPage.tsx   (expose './LoginPage' ...)
```

**bootstrap (đăng ký TỪ remote — pack pin, KHÔNG sửa Header của shell; pattern MỚI thiết kế tại đây — skeleton chỉ có pattern đăng ký từ phía shell):** shell gọi `initAccountShell(ctx)` 1 lần lúc boot (eager) với `ctx = { HeaderSlots, navigate, onRegistryChange }` → `configureAuth` (refreshUrl `/api/identity/auth/refresh`, loginPath `/login`, identityBaseUrl '') + `HeaderSlots.register('right', 'account-auth', AuthWidget)` + **gọi `ctx.onRegistryChange?.()`** (HeaderSlots không có subscription — không bump thì widget guest không hiện cho tới re-render khác) + export `authReady: Promise<boolean>` = kết quả `authStore.refresh()` boot-time (F5 → cookie → phiên phục hồi — ACCEPTANCE 1; AccountPage guard **chờ authReady settle rồi mới quyết redirect** — không thì F5 tại /account bị ném về /login do race).

**AuthWidget:** guest → 2 link "Đăng nhập" / "Đăng ký" (`navigate` shell router — nhận qua props `navigate` từ bootstrap ctx để không mang router riêng vào host); logged-in → nút tên (first word fullName, fallback email prefix) mở dropdown: Tài khoản → `/account` · Đơn hàng của tôi → `/account/orders` (placeholder SF-9) · Đăng xuất (logout API + navigate `/login`). Style theo direction A: surface + border + radius-md + shadow-2, item hover `#FAFAFA`, ghost hover chữ primary.

**Pages theo design direction A (tokens ui-kit, Be Vietnam Pro, primary #F53D2D):**
- **Login/Register:** card center max-w 400, title 24px/800, field Input + label 13px/600, button primary full-width cao 44 (loading → disabled + "Đang xử lý…"), error banner tint danger (#FDEBEC chữ #C0151F) map từ ApiErrorClient (409/401 + field errors), client validation (email format, password ≥8, fullName ≥1) hiện lỗi dưới field trước khi submit. Link chéo login↔register. Success → navigate `/account`.
- **Account:** guard client-side — **chờ `authReady` (boot refresh) settle** rồi chưa login mới `navigate /login`; hiển thị email + badge role (primary tint) + form fullName + phone (prefill từ `Me` — `phone` undocumented trả kèm, §6) + nút Lưu → `updateProfile` → toast/inline "Đã lưu" → state mới; 401 bất ngờ → authStore tự refresh qua fetch wrapper. Layout 2 cột: info card + form card.

**i18n:** dùng key có sẵn (`nav.login/register/logout/account`, `auth.*`, `actions.save`, `common.*`); key thiếu ("Đơn hàng của tôi", label form…) → `t('key', 'Nghĩa tiếng Việt')` fallback (catalogs READ-ONLY — ghi chú amendment sau).

### 4.6 Shell integration (append-only, ≤4 file nhỏ)

- `vite.config.ts`: `remotes.account = { type:'module', name:'mfe_account', entry: ${REMOTE_ACCOUNT_URL:5176}/remoteEntry.js }` + `server.proxy['/api'] → http://localhost:8080` (**cookie same-origin** — bắt buộc để refresh cookie hoạt động).
- `remotes.d.ts`: `declare module 'account/*'`.
- `App.tsx`: wrap `<AuthProvider>` (packages/auth shared singleton — remote cùng context) + routes `/login` `/register` `/account` → lazy import từ `'account/*'` trong ErrorBoundary (remote down → fallback, không trắng trang).
- `main.tsx`: sau khi register ShellNav → `import('account/bootstrap').then(m => m.initAccountShell({ HeaderSlots, navigate, onRegistryChange: bumpRegistry })).catch(console.warn)` — eager (widget có mặt trên MỌI trang), remote down chỉ warn. App.tsx chia sẻ cùng `bumpRegistry` (useReducer) cho cả RemotePage lẫn bootstrap.

### 4.7 Data flow (đủ 5 ACCEPTANCE)

```
Register: form → POST register → 201 → login() → accessToken (memory) + cookie → header tên (claim fullName)
F5:       boot → authStore.refresh() → cookie → accessToken mới → header tên
15' hết:  fetch wrapper → 401 → single-flight refresh → retry → user không thấy lỗi
Customer: fetch /api/admin/users → gateway: signature OK, role=CUSTOMER → 403 (server-side)
Admin:    seed login → role=ADMIN → mọi /api/admin/** qua guard
Logout:   POST logout → revoke row + xóa cookie → reuse cookie cũ → 401
Profile:  /account → PATCH me → Me mới → header cập nhật (claim mới qua token sau refresh; UI set trực tiếp)
```

## 5. Testing

| Lớp | Nội dung |
|---|---|
| IT identity (Testcontainers PG, keys sinh trong test) | register happy/409/400 · login 200+Set-Cookie/401 · refresh rotate + reuse-401 · logout revoke · me 401/200 · PATCH me · jwks shape · admin customer-403/admin-200/pagination/q · seed idempotent · outbox row `user.created` đúng envelope |
| IT gateway (`com.sun.net.httpserver` stub JWKS + identity; `IDENTITY_URI` trỏ về stub) | no-token protected → 401 · customer token → `/api/identity/admin/users` **403 TỪ GATEWAY** (stub chứng minh: không tới service) · admin token → **200 passthrough** (stub trả 200) · customer → `/api/admin/**` (chưa route) 403 · public paths qua không cần token · smoke SF-1 vẫn xanh · request-id propagate |
| Unit FE (vitest) | packages/auth api: login/register-auto-login/logout/updateProfile + error mapping |
| Browser Rule 0 (3 tầng) | DOM đo form/menu · VISUAL screenshot login/register/account + header guest/logged-in so direction A · FLOW: register → tên trên header → F5 giữ phiên → /account sửa fullName → save → reload → logout → đăng xuất sạch → login admin seed → console fetch /api/admin/users = 403 với token customer |
| Gate cuối | `~/.claude/bin/story-verify sf-3-identity-account` sạch |

**Giới hạn verifiable:** chờ thật 15' không khả thi trong walkthrough — cơ chế expired→401→refresh→retry chứng minh bằng IT (TTL ngắn inject được qua `JWT_ACCESS_TTL_SECONDS`) + browser chứng minh refresh-on-boot (cùng code path).

## 6. CONTRACT GAP (đã flag)

identity.yaml freeze **không có** endpoint sửa profile nhưng ACCEPTANCE 5 đòi sửa full_name/phone. Xử lý: implement `PATCH /api/identity/me` server-side (undocumented) + FE gọi trực tiếp; **REQUIREMENT-GAP đã comment lên FI-310** với đề xuất amendment **ĐỦ HAI CHIỀU**: (a) `PATCH /api/identity/me` + `UpdateMeRequest {fullName?, phone?}` → 200 Me; (b) schema **`Me` thêm `phone` (optional)** — không thì GET /me không prefill được phone và save→reload mất hiển thị (P0 spec-critic). Server trả `phone` + nhận PATCH undocumented từ bây giờ. KHÔNG tự sửa `contracts/`.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| StripPrefix 1-vs-2 mâu thuẫn trong artifact SF-1 | Quyết strip 2 theo semantics + springdoc/actuator root; document tại routes/identity.yml + Linear (SF-4/5 copy) |
| Placeholder gateway-routes.yml còn hướng dẫn cũ ("un-comment block · StripPrefix=1") | KHÔNG sửa file SF-1; convention mới (file riêng `routes/<svc>.yml` + strip 2) ghi ở identity.yml comment + audit comment FI-313 + sẽ được nhắc trong hand-off SF-4/5 |
| CORS preflight chết sau khi bật security | `@Order(HIGHEST)` cho CorsWebFilter (file SF-1, 1 dòng) |
| Cookie cross-origin | Vite proxy same-origin (shell + mfe-account); SameSite=Lax |
| Gateway JWKS fetch khi identity down | 401 dev-acceptable; JWKS đi qua gateway public path |
| Federation: remote down vỡ shell | bootstrap import `.catch(warn)`; lazy pages trong ErrorBoundary (pattern SF-2) |
| pnpm-lock / pom.xml conflict SF-4/5 | append-only regions; coordinator serialize lúc merge |
| Testcontainers docker-java API version (bài học máy này) | copy `docker-java.properties` từ template test resources (api.version=1.44) |
