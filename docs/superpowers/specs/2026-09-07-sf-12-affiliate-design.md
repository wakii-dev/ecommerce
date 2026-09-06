# SF-12 Affiliate — Design Notes (spec slice resolution)

> Story: FI-310 · SF: FI-322 · Context pack: `docs/superpowers/contexts/sf-12.md` (scope authority)
> Frozen contract: `contracts/openapi/affiliate.yaml` (API authority — READ-ONLY)
> Trạng thái: thi hành theo context pack + contract; mọi drift resolve bên dưới (contract WINS).

## 1. Drift resolutions (context pack ↔ affiliate.yaml — contract WINS)

| # | Pack ghi | Contract freeze | Quyết SF-12 |
|---|---|---|---|
| 1 | `GET /track?code=` | `POST /api/affiliate/track/click` body `{refCode}` | Theo contract. Service set cookie `aff_ref` (30d, httpOnly, path=/, SameSite=Lax) qua Set-Cookie; **204 luôn** kể cả code sai (không lộ trạng thái). Storefront middleware gọi POST server-side (GATEWAY_URL) + forward Set-Cookie. |
| 2 | Status `PENDING/APPROVED/SUSPENDED`, ledger `EARNED/PAID` | `PENDING/APPROVED/REJECTED`, ledger `PENDING/CONFIRMED` | Theo contract. DB giữ superset: thêm `SUSPENDED` (additive) cho acceptance "suspend → link không track". |
| 3 | `POST /{id}/suspend` | chỉ `approve`/`reject` (reject: PENDING-only) | Thêm endpoint additive `POST /admin/affiliates/{id}/suspend` (APPROVED→SUSPENDED) + `/reactivate` (SUSPENDED→APPROVED). Contract file KHÔNG đổi. |
| 4 | `GET /resolve?code=` cho ordering validate | không có trong contract | **Không cần** — ordering (SF-9, đã merge) KHÔNG gọi validate; chỉ truyền `affiliate_code` vào order + order.confirmed. Code lạ ở consumer → skip im lặng (đúng acceptance "link sai → không tracking, không lỗi"). |
| 5 | `GET /me/stats?days=30` | `/me` (stats tổng) + `/me/ledger` | Dùng 2 endpoint contract. |
| 6 | — | `POST /internal/loyalty/redeem` | SF-14 (D22) — không implement ở SF-12. |
| 7 | cancel → "xóa entry EARNED chưa PAID" | ledger `PENDING→CONFIRMED` | order.cancelled/failed → xóa entry `PENDING` (chưa CONFIRMED) theo order_id. Không có transition CONFIRMED tự động ở SF-12 (payout thủ công — boundary pack). |

## 2. Service design (affiliate-service :8092, db_affiliate)

- Fork template (SF-1 conventions): `scanBasePackages="com.ecommerce"`, `@EntityScan` domain + `com.ecommerce.common.outbox`, port 8092, Flyway `V1__init.sql` (outbox + processed_messages) + `V10__affiliate.sql`. Outbox relay `enabled: false` (không publish).
- **Flyway V10:**
  - `affiliates`: id UUID PK · user_id UUID UNIQUE NOT NULL · code VARCHAR(8) UNIQUE NULL (null tới khi APPROVED) · status VARCHAR(16) NOT NULL DEFAULT PENDING · commission_rate NUMERIC(4,2) NULL (fallback env `AFFILIATE_DEFAULT_RATE=5`) · portfolio_url VARCHAR(500) · note VARCHAR(1000) · payout_note VARCHAR(500) · created_at TIMESTAMPTZ.
  - `clicks`: id UUID PK · code VARCHAR(8) · affiliate_id UUID · occurred_at TIMESTAMPTZ · ip_hash VARCHAR(64) · user_agent_hash VARCHAR(64). Index (code, ip_hash, occurred_at). Dedupe record: 1 click/(code, ip_hash)/10'.
  - `ledger`: id UUID PK · affiliate_id UUID NOT NULL · order_id VARCHAR(64) UNIQUE NOT NULL · order_total BIGINT · rate NUMERIC(4,2) · commission BIGINT · status VARCHAR(16) DEFAULT PENDING · created_at TIMESTAMPTZ.
- **APIs** (controllers map FULL `/api/affiliate/**` — precedent catalog/cart, gateway KHÔNG StripPrefix): register (JWT, 202; REJECTED → đăng ký lại = reset PENDING; PENDING/APPROVED/SUSPENDED → 409) · me (JWT; 404 khi chưa có) · me/ledger (page) · track/click (public) · admin list/approve/reject/rate/stats (+ suspend/reactivate additive). Code sinh 8 ký tự `[A-HJ-NP-Z2-9]` (loại ký tự dễ nhầm), retry unique.
- **Commission:** `floor(order_total × rate / 100)` (BigDecimal, RoundingMode.FLOOR — VND làm tròn xuống §6.1.3 analogy). Rate chốt tại thời điểm CONFIRMED event (ledger cũ giữ rate cũ — contract).
- **Consumer:** queue `affiliate.orders` ← `order.confirmed`, `order.cancelled`, `order.failed`; `IdempotentConsumer` (marker eventId, MỘT queue — pattern ordering) + `order_id UNIQUE` lớp 2. confirmed: `affiliateCode` != null → affiliate theo code + status APPROVED → insert ledger PENDING. cancelled/failed: xóa ledger PENDING theo orderId.
- **Security:** SecurityConfig resource-server JWKS identity (như ordering); public `/api/affiliate/track/click` + actuator/swagger; `/api/affiliate/admin/**` hasRole ADMIN. Gateway: route block (no strip) + auth.yml appends (public track + admin prefix).

## 3. Frontend wiring (additive edits đúng slice)

- **storefront-web `middleware.ts`** (edit nhỏ): thấy `?ref=` → fetch POST `{GATEWAY_URL}/api/affiliate/track/click` (try/catch — fail không chặn page) → forward Set-Cookie `aff_ref` → rewrite URL strip `?ref` (giữ query khác).
- **mfe-checkout** (edit nhỏ): `lib/affiliateRef.ts` đọc cookie `aff_ref` → `CheckoutPage` truyền `affiliateCode` vào `createOrder` input → stub Order mang theo (SF-10 live wiring dẫn vào POST /orders thật).
- **mfe-account `pages/affiliate/*`** (file-slice OWN): AffiliatePage (chưa DK → form; PENDING → banner; APPROVED → code + rate + stats cards + link generator copy + bảng ledger; REJECTED → banner + DK lại) + affiliateApi (createAffiliateClient + authStore.fetch) + AffiliateNavLink (header slot, pattern OrdersNavLink). vite exposes `./AffiliatePage`; bootstrap đăng ký nav; shell App.tsx route `/account/affiliate` lazy.
- **mfe-admin**: `pages/AffiliatesPage.tsx` (LIVE — bảng + filter status + approve/reject/suspend/reactivate + sửa rate + stats mini) + guard.ts append nav/route + AdminApp case + i18n vi/en keys `admin.nav.affiliates` + `admin.affiliates.*`.

## 4. Infra (append-only)

gateway-routes.yml (affiliate block) · gateway-auth.yml (2 dòng) · docker-compose.yml (affiliate-service profile full) · Makefile (dev case affiliate) · .env.example (`AFFILIATE_DEFAULT_RATE=5`, `AFFILIATE_IP_SALT`, URL affiliate) · `infra/db/init/01-create-dbs.sh` (db_affiliate) · `backend/pom.xml` module.

## 5. Tests (mọi dòng IT pack mục 8 + ACCEPTANCE)

AffiliateRegistryTest · TrackClickTest (cookie/click/silent/suspend) · AffiliateLedgerConsumerTest (synthetic order.confirmed RabbitMQ thật: rate đúng, idempotent re-delivery, cancel/failed gỡ entry, rate mới cho đơn sau, code lạ skip, suspend skip) · FE: middleware/cookie-read unit theo pattern có sẵn.

## 6. ACCEPTANCE mapping (context pack)

1. Đăng ký → PENDING; admin duyệt → ACTIVE với code + rate 5% → RegistryTest + admin UI.
2. Click `?ref=CODE` → URL sạch + cookie 30d + click tracked → middleware + TrackClickTest + browser.
3. Mua qua cookie → CONFIRMED → conversion +1, earnings = total×5% → ConsumerTest + dashboard.
4. Suspend → link không track (không lỗi); đổi rate → đơn sau rate mới → ConsumerTest + admin UI.
5. Order hủy/fail sau ledger → entry bị gỡ → ConsumerTest.
6. §5.14 assert: cookie attribution + dashboard conversion/hoa hồng + admin duyệt/đổi rate + link sai không lỗi.
