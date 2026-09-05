# SF-3 Context Pack — identity + account

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)

1. **identity-service** từ template (`backend/services/identity-service/`, port 8081, db_identity): Flyway `V1__users_roles_refresh.sql` — `users` (id uuid, email unique, password_hash bcrypt, full_name, phone, role enum customer/admin, status, created_at), `refresh_tokens` (token_hash, user_id, expires_at, revoked_at).
2. **APIs theo `identity.yaml`**: `POST /api/identity/register` (email format + password ≥ 8) → auto-login; `POST /api/identity/login` → `{accessToken}` + Set-Cookie refresh httpOnly 30d; `POST /api/identity/refresh` (rotate token); `POST /api/identity/logout` (revoke); `GET /api/identity/me`; `GET /api/identity/.well-known/jwks.json` (RSA từ `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH` — Makefile `keys` của SF-1 generate). Access JWT RS256 15', claims: `sub`, `role`, `email`.
3. **RBAC**: spring-security oauth2-resource-server + method security `@PreAuthorize("hasRole('ADMIN')")` cho `GET /api/identity/admin/users` (paginate, filter — cho admin users page sau).
4. **Seed admin** idempotent (ApplicationRunner hoặc afterMigrate): từ env `ADMIN_EMAIL`/`ADMIN_PASSWORD` (SF-1 .env.example).
5. **publish `user.created`** qua outbox (envelope + relay của common-lib).
6. **Gateway wiring** (append-only): route block identity + global JWT filter cho `/api/**` (verify qua JWKS identity); public paths: `/api/identity/register|login|refresh`, `/api/catalog/**` (browse guest), actuator; route `/api/admin/**` yêu cầu claim `role=ADMIN` → 403 khi thiếu. Public-paths config tập trung 1 file rõ ràng.
7. **`frontend/apps/mfe-account`** (remote mới): exposes `/login`, `/register`, `/account` (profile). Pages theo design direction (`docs/superpowers/designs/fi310-storefront-direction.md`) + ui-kit; form validation + error states + loading; dùng packages/auth (`login()`, `register()`, `useAuth()`).
8. **Shell integration** (giới hạn manifest + slots): routes `/login|/register|/account` → remote account; **header: đăng ký auth widget qua HeaderSlots** (icon account → menu guest: Đăng nhập/Đăng ký; logged-in: tên + Tài khoản + Đơn hàng của tôi (link placeholder `/account/orders` — SF-9) + Đăng xuất) — đăng ký TỪ bootstrap của mfe-account (eager import), KHÔNG sửa file Header của shell.

## Touch map (files SF-3 tạo/sở hữu)

```
backend/services/identity-service/**
backend/gateway/src/main/resources/routes/identity.yml (+ auth global filter file — phần JWT là của SF-3, các route block khác không đụng)
frontend/apps/mfe-account/**
frontend/apps/shell: remote manifest + slot mount entry (append 1 block)
```
READ-ONLY: `contracts/**`, `packages/{contracts,ui-kit,i18n}`, các services khác (chưa tồn tại).

## Dep states

- SF-1 merged: infra compose, gateway skeleton + request-id, template, common-lib (outbox/envelope/ApiError), Makefile `keys`.
- SF-2 merged: contracts frozen (identity.yaml), packages/auth + ui-kit + i18n, shell host + slot registry, design direction hand-off tồn tại.
- SF-4/5 CÙNG T2 SONG SONG — KHÔNG giả định chúng đã merge; SF-3 KHÔNG phụ thuộc chúng.

## ACCEPTANCE (user-visible)

- Đăng ký user mới → được login, header hiện tên; refresh trang vẫn đăng nhập (refresh cookie).
- Access token hết hạn (15') → API call tự refresh, user không thấy lỗi.
- Token customer gọi `GET /api/admin/**` (bất kỳ) → 403 TỪ GATEWAY (server-side, không phải UI chặn).
- Admin seed login được; logout → refresh token revoked (reuse → 401).
- Trang `/account` hiện đúng profile, sửa được full_name/phone.

## Boundary (KHÔNG làm)

- KHÔNG làm my-orders thật (placeholder link — SF-9 làm `pages/orders/*`).
- KHÔNG wishlist/my-reviews (SF-8 slices).
- KHÔNG social login, KHÔNG email password-reset (backlog).
- KHÔNG sửa contracts; phát hiện gap → flag coordinator (protocol REQUIREMENT-GAP lên epic).
- KHÔNG đụng route block của service khác trong gateway.
