# ADR 0005 — SF-15 OAuth: two additive endpoints beyond the frozen identity.yaml

Date: 2026-09-07 · Status: Accepted (interim — flagged REQUIREMENT-GAP on FI-310) · Decides FI-325

## Context

`contracts/openapi/identity.yaml` (frozen SF-2) pins `GET /api/identity/oauth/{provider}/authorize`
and `GET /api/identity/oauth/{provider}/callback`. The callback description says the service
exchanges the provider code, find-or-creates the user, then *"302 về FE kèm code một-lần (query)"* —
but no endpoint is frozen for the FE to exchange that one-time code for tokens. The existing login
flow has no path for it (`/auth/login` = password, `/auth/refresh` = cookie-only).

The browser topology makes the gap real: the OAuth callback 302 arrives on the gateway origin
(:8080) while the shell MFE lives on :5173 (dev) — a refresh cookie set on the 302 cannot be used
by the shell (SameSite cookies are not sent on cross-origin XHR). The FE therefore MUST complete
login with a same-origin POST carrying the one-time code.

Separately, the context pack requires "không có key → nút login ẩn" for social buttons; the FE
needs to know which providers identity has credentials for. The contract has no such discovery
surface.

## Decision

SF-15 adds two additive endpoints in identity-service (no frozen path or schema is modified):

1. **`POST /api/identity/oauth/exchange`** — body `{code}`; validates the single-use one-time code
   (DB-stored, 60 s TTL, consumed on use), returns `LoginSuccess` + Set-Cookie refresh token,
   identical to password login. This is the minimal completion of the flow the contract itself
   describes ("Flow chi tiet SF-15").
2. **`GET /.well-known/oauth-providers`** — public, returns `{"google":bool,"facebook":bool}`
   driven purely by presence of `OAUTH_*_CLIENT_ID/SECRET` env. Single source of truth for button
   visibility.

Both are documented in the SF-15 spec; a REQUIREMENT-GAP note is posted on FI-310 asking the
coordinator to bless (or amend contracts for) these two endpoints. Implementation proceeds — the
endpoints change nothing frozen, and the precedent exists (SF-13 admin-audit endpoint exception).

## Consequences

- Contract lint/OpenAPI diff stays green (no file under `contracts/**` changes).
- If the coordinator later freezes the endpoints into identity.yaml, only the contract file and
  generated clients change — paths/shapes here are designed to match the eventual freeze.
- Security: one-time codes are 256-bit random, hashed at rest (SHA-256), single-use, 60 s TTL;
  `exchange` is rate-limitable at the gateway like other public auth endpoints.
