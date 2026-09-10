<div align="center">

# 🛒 Ecommerce Platform

**Website thương mại điện tử đầy đủ tính năng — kiến trúc microservices + micro frontends**

Storefront lấy cảm hứng UX từ [tiki.vn](https://tiki.vn) · Thanh toán Stripe test · Checkout saga phân tán

![Java](https://img.shields.io/badge/Java-21-orange) ![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.x-6DB33F) ![Next.js](https://img.shields.io/badge/Next.js-SSR%2FISR-000000) ![React](https://img.shields.io/badge/React-18-61DAFB) ![Vite MF](https://img.shields.io/badge/Vite-Module%20Federation-646CFF) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791) ![Redis](https://img.shields.io/badge/Redis-7-DC382D) ![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3-FF6600) ![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248) ![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8-005571) ![Stripe](https://img.shields.io/badge/Stripe-test-635BFF)

🎉 **GA v1.1** — story [FI-310](https://linear.app/my-app-hoivu/issue/FI-310) (15/15 SF) + **[FI-366 QA & Polish](https://linear.app/my-app-hoivu/issue/FI-366)** (full-suite xanh lần đầu) · [📊 Tiến độ](#-tiến-độ-story) · [🚢 Release plan](#-release-plan--5-phases)

</div>

---

## 🏗️ Kiến trúc

```mermaid
flowchart LR
    B["🌐 Browser"]
    subgraph FE["Frontends — hybrid (D16)"]
        NW["storefront-web (Next.js :3000)<br/>SSR/ISR · SEO · JSON-LD"]
        SHELL["Shell MF :5173<br/>checkout · account · admin"]
    end
    GW["🚪 API Gateway :8080<br/>JWT RS256 · RBAC · request-id"]
    subgraph SVC["Spring Boot 3 microservices"]
        ID["identity<br/>:8081"]
        CAT["catalog<br/>:8082"]
        CART["cart<br/>:8083"]
        INV["inventory<br/>:8084"]
        ORD["ordering<br/>:8085 · saga"]
        PAY["payment<br/>:8086"]
        NOTI["notification<br/>:8087"]
        LOG["log<br/>:8088"]
        PDF["🐍 invoice<br/>:8090 PDF"]
        PART["partner-api<br/>:8091 Open API"]
        AFF["affiliate<br/>:8092"]
    end
    subgraph DS["Polyglot persistence"]
        PG[("PostgreSQL<br/>5 DB / service")]
        RD[("Redis")]
        ES[("Elasticsearch<br/>search")]
        MO[("MongoDB<br/>event_log")]
        MQ{{"RabbitMQ<br/>events + saga"}}
    end
    STR["💳 Stripe test"]

    B --> NW
    B --> SHELL
    NW --> GW
    SHELL --> GW
    GW --> SVC
    CAT -.search.-> ES
    ID & CAT & INV & ORD & PAY --> PG
    CART --> RD
    LOG --> MO
    SVC <--> MQ
    ORD <--> STR
```

**Nguyên tắc:** database-per-service (cấm cross-DB join) · contract-first (OpenAPI freeze trước khi code) · transactional outbox + idempotent consumers · saga orchestration có compensation · event schema additive-only.

---

## 🧩 Services

| Service | Port | Trách nhiệm | Datastore |
|---|---|---|---|
| `gateway` | 8080 | Routing, JWT verify, RBAC guard, request-id, CORS, serve static MFE (prod) | — |
| `identity` | 8081 | Đăng ký/đăng nhập, JWT RS256, refresh rotation, JWKS | `db_identity` |
| `catalog` | 8082 | Products · categories · variants · **search (ES chính + PG FTS fallback)** · reviews · wishlist · cache | `db_catalog` + ES |
| `cart` | 8083 | Guest cart (cart_token), user cart, merge-on-login | Redis |
| `inventory` | 8084 | Stock theo variant, reservation TTL 30' all-or-nothing | `db_inventory` |
| `ordering` | 8085 | Orders, **checkout saga**, coupons, state machine, admin stats | `db_ordering` |
| `payment` | 8086 | Stripe test (intent/webhook/refund), `PaymentProviderAdapter` SPI | `db_payment` |
| `notification` | 8087 | Email (Mailpit): xác nhận/hủy đơn, review | `db_notification` |
| `log` | 8088 | Fan-in **mọi domain event** → Mongo `event_log` (audit trail) | MongoDB |
| `invoice` 🐍 | 8090 | **Python (FastAPI + ReportLab)** — stateless PDF renderer hóa đơn VN (internal-only) | — |
| `partner-api` | 8091 | **Open API cho đối tác** `/open-api/v1/**`: API key + rate-limit, catalog/orders, webhook HMAC, docs portal | `db_partner` |
| `affiliate` | 8092 | Affiliate: ref code, attribution 30 ngày, ledger hoa hồng | `db_affiliate` |

## 🖥️ Micro frontends

| App | Vai trò |
|---|---|
| `storefront-web` | **Next.js SSR/ISR (SEO)**: home (hero, flash deal countdown) · PLP kiểu Tiki · PDP (JSON-LD Product + OG) · search · coupon center · sitemap/robots |
| `shell` | MF host (app pages cần auth): layout, routing, auth context, header slots (auth/cart-badge) |
| `mfe-checkout` | Cart · checkout 3 bước · coupon · Stripe.js confirm · cart badge |
| `mfe-account` | Login/register · profile · my orders · wishlist · reviews |
| `mfe-admin` | Dashboard KPI + charts · products/categories CRUD (có trường SEO) · coupons · moderation · orders |

**Shared packages:** `contracts` (OpenAPI → TS codegen) · `auth` (token singleton federation-shared) · `ui-kit` (2 theme) · `i18n` (vi/en) · `config`.

---

## ✨ Tính năng MVP

| Storefront | Admin | Kiến trúc nổi bật |
|---|---|---|
| Duyệt/search/filter/sort kiểu Tiki | Dashboard KPI + biểu đồ | **Checkout saga** 4 services, 4 compensation edges |
| Flash deal countdown, badge giảm giá | Products/categories CRUD → thấy ngay trên storefront | **Polyglot persistence** — đúng DB cho đúng việc |
| Giỏ hàng guest + merge-on-login | Coupons CRUD (%, fixed, window, limit) | **Swap engine không đổi contract** — ES↔PG FTS, Stripe↔PSP khác |
| Checkout + Stripe test + email | Reviews moderation + badge "Mua đã xác nhận" | Event audit trail trên Mongo |
| **PDP chuẩn SEO**: SSR + JSON-LD Product + OG + sitemap | SEO override per-product (seoTitle/description/slug) | **Hybrid rendering**: Next.js SSR (SEO) + Vite MF (app) |
| **Đa ngôn ngữ vi/en** — kể cả dữ liệu sản phẩm (`/en/*` + hreflang) | Form sản phẩm tabs vi/en, fallback tự động | **i18n data**: JSONB {vi,en} trong Postgres, ES index per-locale |
| **Open API đối tác**: `/open-api/v1` API key + webhook HMAC + docs portal | Quản lý affiliate: duyệt, rate, stats | **Affiliate**: ref link, attribution 30 ngày, ledger hoa hồng event-driven |
| **COD** + **RMA đổi trả refund Stripe** + **GHN shipping** có tracking | **Loyalty điểm** earn 1% / burn checkout | **Login Google/Facebook + 2FA TOTP**, stock alert email, PWA + dark mode, live chat |
| My orders / wishlist / reviews · **tải hóa đơn PDF** | Orders: ship/deliver/cancel + low-stock + **tải hóa đơn** | **Polyglot**: Python (FastAPI/ReportLab) PDF service — stateless renderer tách khỏi business |
| — | **Email cảm ơn** kèm hóa đơn PDF khi mua hàng | RBAC server-side 2 lớp (gateway + service) |

---

## 🚀 Getting started — 1 lệnh chạy cả hệ (SF-10)

```bash
# Yêu cầu: JDK 21 · Maven 3.9+ · Docker Desktop · Node 20+ · pnpm 10 (corepack enable)
cp .env.example .env
# điền STRIPE_SECRET_KEY (sk_test_…) + STRIPE_WEBHOOK_SECRET (whsec_…) +
# VITE_STRIPE_PUBLISHABLE_KEY (pk_test_…) — trống → payment degraded 503 (không crash)

make dev       # FULL STACK: compose infra + 10 JVM + invoice + 5 FE app (turbo parallel)
make seed      # deterministic seed: admin@demo.vn · user@demo.vn · WELCOME10/GIAM50K · 2 đơn CONFIRMED · 1 review APPROVED
make e2e       # Playwright E2E (cần stack đang sống) — frontend/e2e
```

Lần đầu `mvn install` để đẩy parent + common-lib vào `~/.m2` nếu chưa.
Dừng stack: `make dev-stop` (kill theo PID — infra vẫn chạy) · chạy 1 service
riêng lẻ: `make dev svc=catalog` (identity catalog cart inventory ordering
payment notification log affiliate partner-api invoice gateway).

**Dev 1-origin entry (SF-3 — [ADR 0008](docs/adr/0008-dev-one-origin-entry.md)):**
`make dev` xong mở **MỘT URL `http://localhost:3000`** — storefront + mọi shell
route (`/cart` `/checkout` `/account` `/login`…) + `/admin`, hết 2-URL dev.
HMR sống cả 2 phía (Next + shell fast-refresh; remote edit → trang tự reload —
giới hạn plugin MF, ADR 0008). Remotes load same-origin `/remotes/<name>/` qua
entry — mirror prod Dockerfile.web. Kiến trúc chi tiết xem **Kiến trúc chạy**
dưới đây — trong dev mọi route shell đi qua entry (Next rewrites proxy về
:5173).

| Port | App | Truy cập trực tiếp? |
|---|---|---|
| **:3000** | **entry** (Next front-router) | **URL duy nhất để vào** |
| :5173 | shell Vite (MF host) | chỉ khi debug 2-origin |
| :5175 · :5176 · :5177 · :5178 | checkout · account · admin · skeleton | chỉ khi debug 2-origin |

Tắt 1-origin → 2-origin legacy: set `REMOTE_*_URL` + `NEXT_PUBLIC_SHELL_URL`
absolute trong `.env` (banner `make dev` in chế độ hiện tại; `.env` cũ còn
absolute → stack vẫn chạy nhưng ở chế độ legacy).

**100% containerized:**

```bash
make full        # compose --profile full: mọi service + gateway + FE containers
                 # gateway :8080 là public entry duy nhất (D16 route split)
make full-stop
```

**Kiến trúc chạy (D16 route split):** storefront-web Next SSR (:3000 / qua
gateway) cho public pages `/`, `/c/*`, `/p/*`, `/search`, `/coupons`,
sitemap/robots · shell (:5173 dev / static qua gateway profile full) cho
`/cart`, `/checkout`, `/account`, `/admin` · API `/api/**` qua gateway :8080
(JWT RS256 + RBAC + request-id).

**Port DB:** postgres host = **5433** (đổi `PG_HOST_PORT` trong `.env`).
**Infra UIs:** RabbitMQ `:15672` · Mailpit `:8025` · mongo-express `:8089`
(event_log) · Elasticsearch `:9200` · stripe-cli (profile `stripe`).

**🔑 Tài khoản demo (deterministic seed — `make seed`):**

| Vai trò | Email | Mật khẩu | Ghi chú |
|---|---|---|---|
| **Admin** | `admin@demo.vn` | `admin123` (`ADMIN_PASSWORD`) | `/admin` — orders/invoice/reviews/stats LIVE |
| Customer | `user@demo.vn` | `Demo#2026` (`DEMO_USER_PASSWORD`) | 2 đơn CONFIRMED + review verified sẵn |
| Customer | tự đăng ký `/register` | — | `/admin` → 403 (RBAC 2 lớp) |

**💳 Thẻ Stripe test:** `4242 4242 4242 4242` thành công · `4000 0000 0000 0002`
declined → saga compensation (đơn FAILED + trả stock + trả coupon). Không có
keys → checkout báo payment_unconfigured rõ ràng (503 fail-loud — regression
`PaymentDegradedTest`); golden-path E2E hard-assert keys thật (SF-1).

**🔁 Webhook Stripe local (runbook — SF-1):** đơn PAID/CONFIRMED đi QUA WEBHOOK
(`payment_intent.succeeded` — không có confirm-sync endpoint), nên local cần
`stripe listen` forward về payment-service:

```bash
# 1. .env: STRIPE_SECRET_KEY=sk_test_… + VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…
make stripe-listen        # 2. stripe-cli (compose) forward → :8086/payment/webhook
#    → target in ra STRIPE_WEBHOOK_SECRET=whsec_…
# 3. dán whsec vào .env → restart payment (đọc secret lúc boot):
make dev svc=payment
# 4. giữ stripe-listen chạy trong lúc demo/E2E. Test tay không qua checkout:
#    docker logs ecommerce-stripe-cli-listen   # xem forward live
```

whsec ổn định giữa các lần chạy (CLI tái dùng webhook endpoint theo account +
URL) — khỏi dán lại mỗi lần `make stripe-listen`. Thiếu whsec/forward:
intent confirm OK trên Stripe nhưng đơn kẹt không CONFIRMED (E2E poll timeout).

**📖 Kịch bản demo 5 phút:** [docs/demo-script.md](docs/demo-script.md) ·
**📚 ADR:** [docs/adr/](docs/adr/) — saga+outbox · contracts freeze · auth
RS256 · service boundaries.

---

## 🧱 Bracket — 15 SF · 7 tier

```mermaid
flowchart TD
    subgraph T0["TIER 0"]
        N1["SF-1 platform-foundation<br/>FI-311 · 13 tasks<br/>✅ Done"]
    end
    subgraph T1["TIER 1"]
        N2["SF-2 contracts-design<br/>FI-312 · 14 tasks<br/>✅ Done"]
    end
    subgraph T2["TIER 2"]
        N3["SF-3 identity + account<br/>FI-313 · 13 tasks<br/>✅ Done"]
        N4["SF-4 catalog + browse<br/>FI-314 · 15 tasks<br/>✅ Done"]
        N5["SF-5 inventory + payment<br/>FI-315 · 13 tasks<br/>✅ Done"]
    end
    subgraph T3["TIER 3"]
        N6["SF-6 cart + checkout UX<br/>FI-316 · 14 tasks<br/>✅ Done"]
        N7["SF-7 admin MFE<br/>FI-317 · 11 tasks<br/>✅ Done"]
        N8["SF-8 reviews + wishlist<br/>FI-318 · 12 tasks<br/>🔨 In Progress"]
        N9["SF-9 ordering saga<br/>FI-319 · 14 tasks<br/>✅ Done"]
    end
    subgraph T4["TIER 4"]
        N11["SF-11 partner Open API<br/>FI-321 · 10 tasks"]
        N12["SF-12 affiliate<br/>FI-322 · 10 tasks"]
    end
    subgraph T5["TIER 5"]
        N10["SF-10 convergence + ship<br/>FI-320 · 13 tasks<br/>✅ Done"]
    end
    subgraph T6["TIER 6"]
        N13["SF-13 essentials<br/>FI-323 · 13 tasks<br/>🔨 In Progress"]
        N14["SF-14 commerce ext<br/>FI-324 · 13 tasks<br/>🔨 In Progress"]
        N15["SF-15 engagement<br/>FI-325 · 10 tasks<br/>🔨 In Progress"]
    end
    N1 --> N2
    N2 --> N3
    N2 --> N4
    N2 --> N5
    N3 --> N6
    N4 --> N6
    N5 --> N6
    N3 --> N7
    N4 --> N7
    N5 --> N7
    N3 --> N8
    N4 --> N8
    N5 --> N9
    N4 --> N11
    N9 --> N11
    N3 --> N12
    N6 --> N12
    N9 --> N12
    N7 --> N14
    N9 --> N14
    N10 --> N14
    N3 --> N15
    N4 --> N15
    N5 --> N15
    N10 --> N15
    N6 --> N10
    N7 --> N10
    N8 --> N10
    N9 --> N10
    N11 --> N10
    N12 --> N10
    classDef done fill:#26AA99,stroke:#1d8275,color:#fff
    classDef running fill:#FF9C08,stroke:#d68206,color:#fff
    classDef todo fill:#555,stroke:#444,color:#eee
    class N1,N2,N3,N4,N5,N6 done
    class N7,N8,N9 running
    class N10,N11,N12,N13,N14,N15 todo
```

> Bản render tương tác (hết hạn ~30 ngày): [share.onorca.dev/a/YghPe0uD5FEQ](https://share.onorca.dev/a/YghPe0uD5FEQ) · Nguồn: [`docs/superpowers/brackets/fi310-ecommerce-platform.md`](docs/superpowers/brackets/fi310-ecommerce-platform.md)

## 📊 Tiến độ story

| SF | Nội dung | Issue | Trạng thái |
|---|---|---|---|
| SF-1 | Nền móng: monorepo, compose, gateway, service template | [FI-311](https://linear.app/my-app-hoivu/issue/FI-311) | ✅ Done |
| SF-2 | Contracts freeze (10 OpenAPI + events), ui-kit, federation harness, design direction | [FI-312](https://linear.app/my-app-hoivu/issue/FI-312) | ✅ Done |
| SF-3 | Identity + account | [FI-313](https://linear.app/my-app-hoivu/issue/FI-313) | ✅ Done |
| SF-4 | Catalog + browse Tiki-style (storefront **Next.js SSR**) + Elasticsearch | [FI-314](https://linear.app/my-app-hoivu/issue/FI-314) | ✅ Done |
| SF-5 | Inventory + payment services | [FI-315](https://linear.app/my-app-hoivu/issue/FI-315) | ✅ Done |
| SF-6 | Cart + checkout UX | [FI-316](https://linear.app/my-app-hoivu/issue/FI-316) | ✅ Done |
| SF-7 | Admin MFE | [FI-317](https://linear.app/my-app-hoivu/issue/FI-317) | ✅ Done |
| SF-8 | Reviews + wishlist | [FI-318](https://linear.app/my-app-hoivu/issue/FI-318) | 🔨 In Progress |
| SF-9 | Ordering saga + coupons | [FI-319](https://linear.app/my-app-hoivu/issue/FI-319) | ✅ Done |
| SF-10 | Convergence + E2E + ship | [FI-320](https://linear.app/my-app-hoivu/issue/FI-320) | ✅ Done |
| SF-11 | Partner Open API (`/open-api/v1`) | [FI-321](https://linear.app/my-app-hoivu/issue/FI-321) | ✅ Done |
| SF-12 | Affiliate module | [FI-322](https://linear.app/my-app-hoivu/issue/FI-322) | ✅ Done |
| SF-13 | Essentials: password reset, COD, MinIO upload, abandoned cart, audit viewer, related, GA4, CSV, newsletter | [FI-323](https://linear.app/my-app-hoivu/issue/FI-323) | ✅ Done |
| SF-14 | Commerce extensions: RMA đổi trả, GHN shipping, loyalty điểm | [FI-324](https://linear.app/my-app-hoivu/issue/FI-324) | ✅ Done |
| SF-15 | Engagement: social login + 2FA, stock alert, PWA + dark mode, live chat | [FI-325](https://linear.app/my-app-hoivu/issue/FI-325) | ✅ Done |

---

## 🚢 Release plan — 5 phases

Release **từng phase một**: phase xong → tag + GitHub Release trên repo; merge `main` do người quyết định ở mỗi phase.

| Phase | Nội dung | Release khi |
|---|---|---|
| **P1** Foundation | Nền móng + contracts freeze + design direction + federation harness | SF-1 ✅ + SF-2 xong | ✅ **[phase-1 released + merged main](https://github.com/wakii-dev/ecommerce/releases/tag/phase-1)** |
| **P2** Catalog & Identity | Đăng ký/đăng nhập · storefront Next.js SEO · search ES · tồn kho + Stripe nền | SF-3 ✅ + SF-4 ✅ + SF-5 ✅ | ✅ **[phase-2 released + merged main](https://github.com/wakii-dev/ecommerce/pull/2)** |
| **P3** Transaction MVP | Giỏ → checkout (coupon, Stripe/COD) → saga → đơn + hóa đơn PDF · admin vận hành | SF-6 ✅ + SF-7 ✅ + SF-9 ✅ | ✅ **[phase-3 released + merged main](https://github.com/wakii-dev/ecommerce/pull/3)** |
| **P4** Growth & Partners | Reviews + wishlist · partner Open API + webhooks · affiliate hoa hồng | SF-8 ✅ + SF-11 ✅ + SF-12 ✅ | ✅ **[phase-4 released](https://github.com/wakii-dev/ecommerce/releases/tag/phase-4)** |
| **P5** Complete v1 | Convergence E2E + essentials + RMA/GHN/loyalty + social/2FA/PWA | 15/15 ✅ | ✅ **[phase-5 GA merged main](https://github.com/wakii-dev/ecommerce/pull/6)** |
| **P6** QA & Polish v1.1 | Full-suite xanh lần đầu + bug fixes + UI polish vs direction A | FI-366: SF-1 ✅ + SF-2 ✅ | ✅ **[phase-6 merged main](https://github.com/wakii-dev/ecommerce/pull/8)** |
| **P7** No-Fallback & Feature-Complete | Stripe keys tự lắp + E2E golden path FULL thật · Coupon CRUD A3 (GET list + toggle + FE form) · Honesty pass (zero dead link + registry ADR) | FI-369: 3/3 ✅ | 🚢 **[phase-7 released](https://github.com/wakii-dev/ecommerce/releases/tag/phase-7)** — merge [PR #9](https://github.com/wakii-dev/ecommerce/pull/9) |
| **P5** Complete v1 | Convergence E2E · notification + essentials · RMA/GHN/loyalty · social/2FA/PWA/dark/chat | SF-10 + SF-13 + SF-14 + SF-15 |

## 🧪 QA — fresh-boot harness (FI-406, QA Sweep SF-2)

Tái tạo demo từ zero-state an toàn: **backup → wipe → build → up → seed → probes** —
cơ chế DUY NHẤT bắt bug config-drift/data-lifecycle chỉ nổ ở fresh volume + boot
100% container.

```bash
# ⚠️ DESTRUCTIVE — down -v XÓA pgdata/redis/mongo/minio (demo data + uploaded images).
# Consent story-level: coordinator set confirm flag PER-RUN. KHÔNG có --force.
QA_FRESH_BOOT_CONFIRM=1 make qa-fresh-boot
```

- **Gate kép:** thiếu confirm → exit 3; demo stack đang chạy / port 8080/3000/5173-5178/9099
  bị giữ / disk <20GB / RAM VM <6GB → exit 3 (blast-radius per-volume in trước khi wipe:
  `mongodata` event_log + `miniodata` uploaded images **MẤT VĨNH VIỄN** — không backup).
- **Exit codes:** `0` OK · `3` gate refuse · `4` backup/seed fail · `5` build fail
  (daemon wedge có hướng dẫn restart + resume `QA_FRESH_BOOT_RESUME=BUILD` — cần
  `.run/qa-fresh-boot-wiped` từ run trước) · `6` probe fail (findings minh bạch, stack
  vẫn seeded) · `7` UP health-gate fail (abort trước seed).
- **Log:** `/tmp/qa-fresh-boot-<ts>.log` — timestamp từng stage + tổng thời gian.
- **Backup:** `backups/qa-<ts>/<db>.sql.gz` (9 DB postgres — gitignored) + RESTORE-TEST
  per-DB vào throwaway DB trước khi wipe được phép.

### Runbook — restore từ backup

```bash
# 1. Bật infra + đợi postgres healthy
docker compose up -d postgres   # đợi: docker inspect -f '{{.State.Health.Status}}' $(docker compose ps -q postgres)

# 2. Tạo DB + restore từng dump (9 DB: db_affiliate db_catalog db_identity
#    db_inventory db_notification db_ordering db_partner db_payment db_template)
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE db_catalog;"
gunzip -c backups/qa-<ts>/db_catalog.sql.gz | docker compose exec -T postgres psql -U postgres -d db_catalog
#    … lặp cho từng DB

# 3. Lên full stack + seed lại phần không có trong postgres
docker compose --profile full --profile stripe up -d --build
make seed
```

> Lưu ý: mongo (event_log) + minio (uploaded images) **không có backup** — restore từ
> backup không khôi phục được 2 phần này (seed/minio-init chỉ tạo lại khung).

## 📚 Tài liệu

| | |
|---|---|
| 📐 **Epic spec** | [`docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md`](docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md) — kiến trúc, decision log D1-D15, success criteria, saga design |
| 🧱 **Bracket** | [`docs/superpowers/brackets/fi310-ecommerce-platform.md`](docs/superpowers/brackets/fi310-ecommerce-platform.md) — 10 SF × 5 tier |
| 📦 **Context packs** | [`docs/superpowers/contexts/`](docs/superpowers/contexts/) — spec slice per SF |
| 🗂 **ADR** | `docs/adr/` — quyết định kiến trúc chi tiết (SF-10 hoàn thiện) |

---

## 🧪 QA static audit (SF-1 — FI-405)

`make qa-audit` — 4 detector tĩnh (config-audit · s2s-auth-matrix · rbac-matrix · contracts-freshness), non-destructive (không docker/HTTP/.env), < 5 phút.
Report: [`docs/superpowers/qa/report-sf1.md`](docs/superpowers/qa/report-sf1.md) — finding ID `CFG-xx` / `S2S-xx` / `RBAC-xx` / `CT-xx` (triage + fix = SF-4).
Exit: `0` = 0 finding CHƯA fix · `1` = có finding chưa fix · `2` = script error (fail-loud).
