# ADR 0003 — Auth RS256: identity sign, services verify qua JWKS

Date: 2026-09-07 · Status: Accepted · Deciders: epic FI-310

## Context
Nhiều service cần biết "user này là ai, role gì" mà không gọi identity mỗi
request. Refresh token phải sống qua cross-origin (shell :5173, Next :3000,
gateway :8080 — cùng host localhost khác port).

## Decision
1. **JWT RS256 (asymmetric)**: identity-service giữ private key
   (`infra/keys/jwt-private.pem`, `make keys` sinh, gitignored), ký access
   token 15' (`roles` claim, `sub` = user id, `email` cho fat payload).
2. **Verify local qua JWKS**: service/gateway fetch
   `/.well-known/jwks.json` (public key) rồi verify SIG locally — không gọi
   identity mỗi request, không shared secret giữa các service.
3. **Refresh token httpOnly cookie** (rotation, bảng `refresh_tokens` hash):
   access token in-memory FE (`packages/auth` AuthStore singleton) — KHÔNG
   localStorage (XSS). 401 → single-flight refresh → retry 1 lần.
4. **2 lớp RBAC**: gateway chặn `admin-prefixes` (`/api/**/admin/**` →
   ROLE_ADMIN) TRƯỚC route dispatch + `@PreAuthorize` trong service (defense
   in depth). Cookie không phân biệt port (localhost) → handoff shell/Next;
   localStorage thì CÓ port scope → chỉ dùng cookie cho auth.
5. **Service accounts** (interim GAP FI-310): notification/partner đăng ký
   account + login qua identity PUBLIC API, role ADMIN gán bằng seed script —
   tới khi có internal service-token endpoint.

## Consequences
- Service scale độc lập; revocation dựa vào TTL ngắn 15' + refresh rotation.
- Key leak = toàn hệ thống — private key chỉ identity + `make keys` local.
- Token expiry 15' nghĩa JWT env-interim (CATALOG_API_TOKEN) phải mint lại
  mỗi 15' — chấp nhận dev, production cần internal token endpoint.

## Alternatives rejected
- **HS256 shared secret** — mọi service giữ được signing key, không phân biệt
  ai phát hành.
- **Session tập trung (identity check mỗi request)** — latency + SPOF.
- **JWT trong localStorage** — XSS steals token.
