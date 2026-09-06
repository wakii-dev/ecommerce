# SF-12 Affiliate — Plan (FI-322)

> Spec: `docs/superpowers/specs/2026-09-07-sf-12-affiliate-design.md` · Context pack: `docs/superpowers/contexts/sf-12.md`
> Worktree: `sf-12-affiliate` (branch `wakii-dev/sf-12-affiliate`) · Base: `story/fi310-ecommerce-platform`

## Task 1 — Service scaffold + infra appends
Fork template → `backend/services/affiliate-service` (pom, App class, application.yml :8092/db_affiliate, Dockerfile, V1 outbox + V10 affiliate schema, PingController bỏ). Appends: `backend/pom.xml` module, Makefile dev case, docker-compose block, `.env.example`, db init `db_affiliate`.
**Exit:** `mvn -pl services/affiliate-service test` boot xanh (health IT).

## Task 2 — Registry + admin APIs (contract)
Entities/repos/services/controllers: register · me · me/ledger · admin list/approve/reject/rate/stats + suspend/reactivate (additive). SecurityConfig JWKS. Code gen 8 ký tự. Gateway route + auth appends.
**Exit:** IT registry (register 202/409/re-DK, approve sinh code + rate 5, reject, rate 0/60 → 400, 403 customer).

## Task 3 — Track click (public + cookie)
`POST /api/affiliate/track/click`: validate code APPROVED → Set-Cookie aff_ref 30d httpOnly path=/ SameSite=Lax + record click (dedupe code+ip_hash 10', SHA-256 salted ip/UA) → 204; code sai/SUSPENDED → 204 không cookie; thiếu refCode → 400.
**Exit:** IT TrackClickTest từng case.

## Task 4 — Ledger consumer
Queue `affiliate.orders` ← order.confirmed/cancelled/failed. IdempotentConsumer + order_id unique. Commission `floor(total×rate/100)`; rate nullable → `AFFILIATE_DEFAULT_RATE`. Cancelled/failed → xóa PENDING.
**Exit:** IT AffiliateLedgerConsumerTest (synthetic qua RabbitMQ container: rate đúng, idempotent, cancel gỡ, rate mới, code lạ skip, suspend skip).

## Task 5 — storefront middleware + mfe-checkout cookie
middleware.ts: ?ref → POST track + forward Set-Cookie + rewrite strip ?ref. mfe-checkout: lib/affiliateRef.ts + CheckoutPage truyền affiliateCode + stub Order mang field.
**Exit:** unit FE + build turbo xanh.

## Task 6 — mfe-account slice + shell route
pages/affiliate/{AffiliatePage,affiliateApi,AffiliateNavLink}.tsx; vite exposes; bootstrap đăng ký nav; shell App.tsx route `/account/affiliate`.
**Exit:** build xanh; trang chạy dưới shell (browser verify).

## Task 7 — mfe-admin AffiliatesPage LIVE
pages/AffiliatesPage.tsx (bảng + filter status + approve/reject/suspend/reactivate + rate edit + stats mini); guard.ts append; AdminApp case; i18n vi/en.
**Exit:** build xanh; admin duyệt được affiliate từ UI.

## Task 8 — Verify + review + merge
Full IT suite xanh → Rule 0 browser walkthrough (đăng ký → admin duyệt → link ?ref → cookie → synthetic CONFIRMED → dashboard hoa hồng; admin đổi rate/suspend) → code-reviewer trên diff → fix → APPROVED → merge về story branch + audit comment merge-hash.
**Exit:** story-verify gate sạch → FI-322 Done.

## Verify (Phase 5) — acceptance pack
- [ ] User DK → PENDING; admin duyệt → ACTIVE code + rate 5%
- [ ] `?ref=CODE` → URL sạch + cookie 30 ngày + click tracked
- [ ] Mua qua cookie → CONFIRMED → dashboard conversion +1, earnings total×rate
- [ ] Suspend → không track nữa (không lỗi khách); đổi rate → đơn sau rate mới
- [ ] Order hủy/fail → entry EARNED(PENDING) bị gỡ
- [ ] §5.14: link sai → không tracking không lỗi
