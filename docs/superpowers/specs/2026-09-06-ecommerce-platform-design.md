# Ecommerce Platform — Epic Spec (Story Design)

> Date: 2026-09-06 · Status: DRAFT (spec-critic pending) · Repo: `/Users/hoivu/orca/projects/ecommerce` (greenfield, empty)
> Pipeline: IDEA-BRIEF → phase0-impact-analyst (10 dims) → clarifying (4 decisions USER) → this spec

---

## 1. IDEA-BRIEF (8 chiều)

| Chiều | Nội dung |
|---|---|
| **Task** | Xây từ đầu (greenfield) website ecommerce full-featured: storefront cho khách mua + admin panel cho vận hành, kiến trúc backend microservices + frontend micro frontends |
| **Output** | Web app chạy local bằng 1 lệnh: `docker compose up` (infra) + `make dev` (apps). Gồm 7 backend services + API gateway + 5 frontend apps (shell host + 4 remotes) + shared packages |
| **Users** | (a) Khách mua hàng: guest duyệt/search, đăng ký/đăng nhập, giỏ hàng, checkout, thanh toán Stripe, theo dõi đơn, review, wishlist. (b) Admin: quản lý sản phẩm/danh mục, duyệt review, quản lý coupon, xử lý đơn, xem dashboard |
| **Constraints** | MUST: microservices (DB-per-service, event-driven, contract-first), micro frontend (runtime federation), khả năng mở rộng cao (adapter interfaces, additive contracts, ADR), admin quản trị đầy đủ. MUST-NOT: hard-cross-DB join, auth chỉ ở UI, secret trong code |
| **Input** | Không có Figma, không có code, không có data → UI đi qua designer mock-prototype (3 hướng, user chọn); seed data sinh tự động |
| **Context** | Repo rỗng hoàn toàn (1 initial commit, branch `master`). Orca + Linear team `FI` sẵn sàng. Story chạy qua story-workflow: epic + 10 SF theo tier |
| **Success criteria** | Xem §5 — 7 tiêu chí binary, demo được |
| **Out-of-scope** | Mobile app, SSR/SEO server-render, K8s/helm manifests, CI/CD production pipeline, thanh toán thật production, social login, real-time WebSocket, multi-vendor/marketplace |

## 2. Quyết định đã chốt (decision log)

| # | Quyết định | Nguồn |
|---|---|---|
| D1 | Backend: **Java 21 + Spring Boot 3.x**, Maven multi-module, Spring Cloud Gateway | **USER** (chọn Spring Boot qua clarifying) |
| D2 | Frontend: **Vite + React 18 + Module Federation** (`@module-federation/enhanced`) cho app pages (checkout/account/admin), pnpm + Turborepo. **Amended bởi D16**: storefront public pages chuyển sang Next.js SSR | **USER** |
| D3 | Payment: **Stripe test mode** (stripe-java, webhook có signature verify, Stripe.js confirm phía client) — vẫn giữ `PaymentProviderAdapter` interface để sau này cắm VNPay/MoMo | **USER** |
| D4 | Scope MVP: core + **Reviews & ratings + Coupons/vouchers + Wishlist** (tất cả) | **USER** |
| D5 | API style: REST contract-first, OpenAPI 3.1 specs là source of truth trong `contracts/`; TS clients sinh bằng openapi-typescript; Java side springdoc + contract-conformance test | AGENT (phase0), nhất quán với D1-D2 |
| D6 | Event broker: **RabbitMQ** (topic exchange, DLQ, transactional outbox polling relay) | AGENT (phase0) |
| D7 | Auth: email/password, **JWT RS256** (identity ký, services verify qua JWKS; gateway + service guard đều check `role` claim server-side) | AGENT (phase0, điều chỉnh RS256 vì Spring resource-server hỗ trợ native) |
| D8 | Datastore: 1 container Postgres, **DB-per-service** (`db_identity`, `db_catalog`, `db_ordering`, `db_payment`, `db_inventory`); Redis cho cart + cache; **MongoDB cho event/audit log (D14)**; cấm cross-DB join | AGENT (phase0) + USER (Mongo) |
| D9 | Đặt reviews + wishlist vào **catalog-service** (cùng bounded context product); coupons vào **ordering-service** (gần logic tính tổng đơn). ADR ghi rõ đường extract thành service riêng khi cần → extensibility | AGENT quyết (BALANCED mode — flag: nếu user muốn tách service riêng, nói trước APPROVE) |
| D10 | i18n: **vi mặc định + en** (i18next, vi/en catalogs trong `packages/i18n`); tiền tệ **VND** (Stripe zero-decimal) | AGENT (phase0 assumption, giữ nguyên) |
| D11 | UI: Tailwind CSS + ui-kit tự build primitives (token hóa 2 theme storefront/admin), TanStack Query, react-router | AGENT (BALANCED mode) |
| D12 | Deploy: docker-compose (dev: infra-only + apps trên host; profile `full`: toàn bộ containerized). Dockerfile per app. K8s chỉ ADR migration path | AGENT (phase0) |
| D13 | **Design/product reference: https://tiki.vn** — storefront benchmark theo pattern UX Tiki (xem §4.1). Reference pattern, KHÔNG copy logo/brand/assets/data | **USER** (thêm sau spec draft) |
| D14 | **MongoDB = central event/audit log store** (polyglot persistence): `log-service` (port 8088) fan-in TẤT CẢ domain events từ RabbitMQ → Mongo collection `event_log`. Consume-only — KHÔNG contract REST mới. Xem qua mongo-express (:8089). Admin activity page = backlog | **USER** (thêm sau APPROVE, trước SF-2 freeze) + AGENT chốt thiết kế fan-in |
| D15 | **Elasticsearch = search engine chính** trong catalog-service qua `SearchEngine` interface (EsEngine khi có `ELASTICSEARCH_URI` / PgFtsEngine fallback — degraded không crash). Indexer consume `product.changed` + bulk reindex startup. ES 8 single-node, heap cap 512m, security off (dev). Contract search API KHÔNG đổi. ADR ghi extract-path thành search-service riêng | **USER** (thêm sau APPROVE, trước SF-4) + AGENT chốt abstraction |
| D16 | **Next.js SSR cho SEO** (hybrid model): `storefront-web` (Next.js App Router, port 3000) server-render các trang PUBLIC: home, PLP, PDP, search, coupon center + sitemap.xml/robots.txt + JSON-LD Product schema + OG tags (ISR/revalidate qua catalog API). **Shell Vite MF giữ lại cho app pages cần auth** (cart/checkout/account/admin — không cần SEO). Gateway route: `/`, `/c/*`, `/p/*`, `/search`, `/coupons` → Next :3000; còn lại → shell. Contract API KHÔNG đổi. Anti-duplicate: home/PLP/PDP chỉ tồn tại ở Next, KHÔNG làm bản Vite | **USER** (sau APPROVE, trước SF-2 freeze — timing tốt) + AGENT chốt hybrid split |
| D17 | **i18n cho cả DATA** (mở rộng D10): content do admin nhập đa ngôn ngữ — AGENT chốt: **JSONB `{vi, en}`** trên products/categories/coupons (name, description, seo_title, seo_description); **UGC (reviews) giữ nguyên ngôn ngữ tác giả** (không dịch); API GET content nhận `?locale=` + `Accept-Language`, **fallback `vi`** khi thiếu bản dịch; admin CRUD nhận/cập nhật full `{vi, en}` object; storefront-web path-prefix **`/en/*` + hreflang alternates** (SEO đa ngôn ngữ); admin form tabs vi/en; seed bilingual; ES index theo locale (search `?locale=en` query field `en`); email vi-only MVP; tiền tệ luôn VND | **USER** (sau APPROVE, trước SF-2 freeze) + AGENT chốt pattern |

## 3. Kiến trúc

### 3.1 Repo layout (proposed scaffold — greenfield)

```
ecommerce/
├── Makefile · docker-compose.yml · README.md · .env.example
├── contracts/                          # SOURCE OF TRUTH — freeze ở Tier 1
│   ├── openapi/{identity,catalog,cart,ordering,payment,inventory,notification}.yaml
│   │                                   #   (admin stats read endpoints nằm trong ordering.yaml + inventory.yaml — không BFF riêng)
│   └── events/*.schema.json            # envelope + payload JSON Schema, additive-only
├── backend/                            # Maven multi-module (parent pom: Spring Boot 3.x, Java 21)
│   ├── gateway/                        # Spring Cloud Gateway: routes, JWT check, RBAC route guard,
│   │                                   #   request-id filter, CORS, rate-limit, serve static MFE (profile full)
│   ├── services/
│   │   ├── identity-service/           # register/login/refresh, users, roles, seed admin → db_identity
│   │   ├── catalog-service/            # products, categories, search (PG FTS), reviews, wishlist → db_catalog
│   │   ├── cart-service/               # guest+user cart Redis, merge-on-login → Redis
│   │   ├── inventory-service/          # stock, reservation TTL → db_inventory
│   │   ├── ordering-service/           # orders + saga orchestrator + outbox + coupons → db_ordering
│   │   ├── payment-service/            # Stripe intents + webhook + adapter SPI → db_payment
│   │   ├── notification-service/       # consumes events → email (Mailpit dev)
│   │   └── log-service/                # fan-in TẤT CẢ domain events → Mongo event_log (D14)
│   └── shared/common-lib/              # event envelope + outbox base + error model + security config
├── frontend/                           # pnpm workspace + Turborepo
│   ├── apps/
│   │   ├── storefront-web/             # Next.js App Router (SSR/ISR — D16): home, PLP, PDP, search,
│   │   │                               #   coupon center + sitemap/robots/JSON-LD/OG — SEO public pages
│   │   ├── shell/                      # MFE host (app pages): layout, routing, auth context, remotes:
│   │   │                               #   mfe-checkout, mfe-account, mfe-admin
│   │   ├── mfe-checkout/               # cart + checkout steps + Stripe.js confirm + confirmation
│   │   ├── mfe-account/                # login/register/profile/orders/wishlist
│   │   └── mfe-admin/                  # admin: products, categories, coupons, reviews moderation, orders, dashboard
│   └── packages/
│       ├── contracts/                  # GENERATED TS types + API clients (từ contracts/, không sửa tay)
│       ├── auth/                       # token store singleton + refresh + role guard (federation shared)
│       ├── ui-kit/                     # tokens + primitives + 2 theme (storefront/admin)
│       ├── i18n/                       # vi/en catalogs
│       └── config/                     # tsconfig/eslint/vite presets + env parsing
├── infra/
│   ├── docker/                         # Dockerfile per app/service
│   └── db/init/                        # tạo 5 DB trên 1 PG container
└── docs/adr/                           # ADR: saga, contracts policy, auth flow, service-boundary choices
```

### 3.2 Services + boundaries

| Service | Sở hữu | DB | Events publish | Events consume |
|---|---|---|---|---|
| identity | users, roles, JWT (RS256 private), refresh | db_identity | user.created | — |
| catalog | products, categories, images, reviews, wishlist, rating aggregate; **content i18n JSONB {vi,en} (D17)**; **search qua SearchEngine: ES chính + PG FTS fallback (D15)** | db_catalog + **Elasticsearch index `products`** | product.changed, review.moderated | order.confirmed (verified-purchase + rating aggregate — fat payload §6.1) |
| cart | guest/user cart, merge-on-login | Redis | — | order.confirmed (xóa cart items theo user + items) |
| inventory | stock, reservations (TTL 30') | db_inventory | inventory.reserved, inventory.released, inventory.committed | order.paid (commit reservation), order.cancelled/order.failed (release) |
| ordering | orders, order_items, coupons, checkout saga, outbox | db_ordering | order.created, order.paid, order.confirmed, order.cancelled, order.failed (created/paid: published for future consumers — additive) | payment.succeeded, payment.failed |
| payment | payment_intents (Stripe), webhook events, adapter SPI | db_payment | payment.succeeded, payment.failed | (Stripe webhook in) |
| notification | email templates, send log | (log/db nhẹ) | — | order.confirmed, order.cancelled, review.moderated |
| log | activity/audit log tập trung (event_log) | **MongoDB** (D14) | — | TẤT CẢ domain events (queue bind topic `#`) |

Command edges (sync REST, không MQ — pin): ordering → inventory `POST /reservations` (all-or-nothing, TTL 30'), ordering → payment `POST /intents`. Compensation/commit đi qua events (bảng trên) để có retry semantics.

### 3.3 Checkout saga (orchestration trong ordering-service) — artifact phức tạp nhất

```
MFE checkout ── POST /orders (Idempotency-Key, couponCode?) ──▶ ordering:
   re-price server-side từ catalog (authority — cart chỉ là duyệt) → tạo ORDER_PENDING + saga state
   → reserve coupon usage (nguyên tử) → REST inventory/reservations (all-or-nothing, TTL 30')
      [fail bất kỳ → release phần đã làm + ORDER_FAILED]
   → REST payment/intents (idempotent) → trả order {clientSecret}
MFE ── Stripe.js confirmCardPayment ──▶ Stripe ── webhook (verify signature) ──▶ payment
   ── event payment.succeeded ──▶ ordering: ORDER_PAID ──▶ order.paid
   → inventory commit reservation → inventory.committed → ordering ORDER_CONFIRMED
   ── order.confirmed (fat payload §6.1) ──▶ notification (email) + cart (clear) + catalog (verified-purchase)
```

**Compensation edges (pin — mọi nhánh phải có test fail-injection ở SF-9):**
- reserve fail / payment declined → release reservation + release coupon usage → ORDER_FAILED
- TTL 30' không thanh toán → scheduler release reservation + coupon → ORDER_CANCELLED (system)
- **Late payment**: payment.succeeded tới khi order đã terminal (TTL hết) → ordering gọi `adapter.refund` + email — real scenario (user quên tab Stripe)
- Admin cancel sau khi PAID (trước SHIPPED) → `adapter.refund` → ORDER_CANCELLED

**PaymentProviderAdapter SPI:** `createIntent / void / refund / verifyWebhook` — Stripe là adapter đầu tiên (D3); VNPay/MoMo sau này = adapter mới.

Toàn bộ publish qua **transactional outbox** (bảng outbox + relay polling), consume **idempotent** (processed-message table). Correlation: `x-request-id` từ gateway propagate cả HTTP lẫn RabbitMQ headers.

### 3.4 Auth flow

Login → identity cấp access JWT (RS256, 15', claim `role`) + refresh cookie httpOnly. Shell giữ token qua `packages/auth` singleton (federation shared — mọi remote dùng chung, không tự fetch riêng). Gateway verify JWT + route guard `/api/admin/**` yêu cầu `role=admin`; từng service verify lại (defense in depth). Same-origin cho cookie: dev qua Vite proxy → gateway; prod: gateway serve static + reverse proxy.

### 3.5 Micro frontend composition

**Hybrid rendering (D16):** hai lớp frontend, mỗi lớp đúng việc:

- **`storefront-web` (Next.js App Router :3000) — SEO public**: server-render home/PLP/PDP/search/coupon center (ISR + revalidate qua catalog API), sitemap.xml + robots.txt sinh từ catalog, JSON-LD `Product`/`Offer` schema + OG tags trên PDP. Fetch thẳng catalog API qua gateway (server-side) — không qua MF.
- **Shell Vite MF — app pages cần auth**: remote manifest theo env (`REMOTE_*_URL`), MF 2.0 runtime; remotes: **mfe-checkout, mfe-account, mfe-admin**; `shared` singletons: react, react-dom, packages/auth, ui-kit, i18n (routing của shell). Cart/checkout/account/admin không cần SEO (auth-gated) → CSR là đủ.
- **Gateway route split**: `/`, `/c/*`, `/p/*`, `/search`, `/coupons`, `/sitemap.xml`, `/robots.txt` → Next :3000; `/cart`, `/checkout`, `/account`, `/admin` (+ `/api/**`) → shell static/gateway. Cross-link giữa 2 lớp bằng URL thuần (header shell + header Next cùng ngôn ngữ thiết kế, link `/checkout` từ PDP "Mua ngay").
- Dev: Next dev server + 4 Vite servers chạy chọn lọc; prod profile `full`: Next standalone build (container) + remotes static qua gateway.
- Anti-duplicate (cứng): home/PLP/PDP/search/coupon center **CHỈ tồn tại ở Next** — cấm làm bản Vite tương ứng.

### 3.6 Order state machine (pin cho contracts freeze — ordering.yaml)

`PENDING → PAID → CONFIRMED → SHIPPED → DELIVERED` + terminal `CANCELLED`, `FAILED`.

| Transition | Khởi tạo |
|---|---|
| PENDING→PAID | system (webhook payment.succeeded) |
| PAID→CONFIRMED | system (reservation committed) |
| CONFIRMED→SHIPPED | admin |
| SHIPPED→DELIVERED | admin |
| PENDING→CANCELLED | admin |
| PAID/CONFIRMED→CANCELLED | admin (kèm refund) |
| PENDING→FAILED | system (reserve fail / declined / TTL) |
| →CANCELLED | system (TTL 30') |

Mọi transition emit order.* event. Admin KHÔNG có nút "confirm" — CONFIRMED là tự động (khớp luồng Tiki: đã thanh toán → đang xử lý).

## 4. Feature scope (đóng băng — thứ user demo được)

### 4.1 Storefront benchmark Tiki (D13)

Storefront mô phỏng pattern UX của tiki.vn (không clone brand):

- **Header:** logo + search bar nổi bật trung tâm (autocomplete suggestion theo category) + cart icon có badge số lượng + account menu. Sticky. Ownership: header là của **shell** (SF-2 dựng layout; badge/mini-cart wire live ở SF-6).
- **Home:** hero banner carousel → **flash-deal section** (hàng ngang + đếm ngược) → featured danh mục → grid sản phẩm đề xuất.
- **Product card:** ảnh, tên 2 dòng, giá + giá gạch, **badge giảm %**, rating sao + số lượt đánh giá, badge "Chính hãng"/"Freeship".
- **PLP:** sidebar cây danh mục + filter (giá, rating, brand) + sort + pagination — giống layout category page của Tiki.
- **PDP:** gallery lớn trái, info phải (giá, badge, variant, qty, add-to-cart nổi), mô tả + spec tab, reviews section.
- **Coupon center:** trang danh sách coupon khả dụng, nút copy mã.
- Admin + account không có reference Tiki — thiết kế sạch chung theo ui-kit.

### 4.2 Feature list

**Storefront:** home (hero + flash deal + featured), PLP (grid, filter category/price/rating, sort, pagination), search (PG FTS + suggest), PDP (gallery, giá VND, tồn kho, variants đơn giản size/color, add-to-cart, reviews section + viết review, wishlist heart), cart (guest + login merge), checkout (địa chỉ, vận chuyển flat-fee demo, coupon, review đơn, Stripe test payment), xác nhận đơn + email, my orders (lịch sử + chi tiết + trạng thái), my wishlist, my reviews, coupon center.

**Admin (mfe-admin, RBAC):** dashboard (KPI: doanh thu/đơn/top sản phẩm/low-stock + biểu đồ), products CRUD (table + form + ảnh, publish/draft), categories CRUD, coupons CRUD (%, fixed, window, usage limit), reviews moderation (queue duyệt/ẩn), orders (list, filter, detail, chuyển trạng thái theo §3.6: ship/deliver/cancel — KHÔNG có nút confirm), users (list + role view). Dashboard data: ordering.yaml (revenue-by-day, orders-summary, top-products) + inventory.yaml (low-stock) — endpoint read-only, freeze tại SF-2, không BFF riêng.

**Notification:** email xác nhận đơn/hủy/duyệt review qua Mailpit (dev UI xem được).

## 5. Success criteria (binary, demo được)

1. `docker compose up -d` + `make dev` → full stack 1 lệnh; profile `full` containerized chạy được.
2. **Golden path E2E (Playwright)**: guest duyệt → search → PDP → đăng ký → add to cart → apply coupon → checkout → Stripe test pay → thấy confirmation + email trong Mailpit → đơn hiện trong admin với đúng trạng thái.
3. Admin tạo product qua UI → product xuất hiện trên storefront (cache invalidate đúng).
4. Mỗi service chạy standalone (`make dev svc=identity`) với compose infra.
5. Gateway từ chối `/api/admin/**` không có JWT `role=admin` (401/403 — server-side enforcement).
6. Review flow: mua xong → viết review → admin duyệt → review hiện trên PDP với badge verified.
7. Saga compensation: fail-injection (payment declined) → stock được release, order FAILED, không rò rỉ reservation.
8. Mongo `event_log` (mongo-express :8089) có documents cho TẤT CẢ domain events xảy ra trong demo — action ở UI → dòng log xuất hiện.
9. Elasticsearch: index `products` có documents sau seed/reindex (`curl :9200/products/_count` > 0); search endpoint trả kết quả qua ES; ES down → fallback PG FTS (degraded, không crash).
10. **SEO (D16)**: view-source trang PDP → HTML chứa tên + giá sản phẩm (server-render, không phải shell rỗng); `/sitemap.xml` + `/robots.txt` trả 200 với URL products; PDP có JSON-LD `Product` schema + OG tags.
11. **i18n data (D17)**: `/en/p/<slug-en>` → PDP hiển thị nội dung tiếng Anh (seed bilingual); `<link hreflang>` alternate có trong head; admin nhập thiếu bản en → trang en fallback hiện nội dung vi (không crash).

## 6. SF split (10 SF — mỗi SF 8-15 tasks, contract-first)

| SF | Tên | Tier | Depends | Theme (~tasks) |
|---|---|---|---|---|
| SF-1 | platform-foundation | 0 | — | Repo scaffold (Makefile, compose infra PG/Redis/RabbitMQ/Mailpit/Mongo+mongo-express/Elasticsearch/stripe-cli, db init), Maven parent + **service template module** (health/springdoc/Flyway/Testcontainers/Dockerfile), frontend pnpm+turbo scaffold, gateway skeleton (routes/request-id/CORS), shared common-lib (envelope/outbox base/error), contracts dir skeleton (~14) |
| SF-2 | contracts-design-foundation | 1 | SF-1 | **Freeze toàn bộ OpenAPI specs (7 service) + JSON Schema events (fat payloads — §6.1) + order state machine (§3.6) + admin stats endpoints**, TS codegen → packages/contracts, packages/auth (RS256 decode/refresh singleton), ui-kit v1 (tokens + primitives + 2 theme), i18n vi/en, designer mock-prototype 3 hướng Tiki-inspired (§4.1) → USER CHỌN, **federation harness (shell + 1 skeleton remote qua MF 2.0 runtime — shared singletons 1 instance, pattern `REMOTE_*_URL` proven; gate: harness xanh trước khi T2 fork)**. Freeze contracts KHÔNG chờ designer choice (contract trước; ui-kit tokens theo hướng được chọn sau) — 1 lựa chọn hướng GLOBAL, các SF sau implement screens theo hướng đó (~14) |
| SF-3 | identity + account | 2 | SF-2 | identity-service (register/login/refresh/JWT RS256/RBAC, seed admin), mfe-account (login/register/profile — orders page là placeholder cho tới SF-9), gateway auth wiring, shell header auth state (~11) |
| SF-4 | catalog + browse | 2 | SF-2 | catalog-service (products/categories/images/Redis cache+invalidate/seed, compare_price + flash_sale_ends_at + rating_avg/rating_count denormalized, **content i18n JSONB {vi,en} + locale resolution (D17)**, **search: SearchEngine interface — EsEngine chính + PgFtsEngine fallback (D15), indexer per-locale + bulk reindex startup**), **storefront-web Next.js (D16+D17): `[locale]` routing vi/en + hreflang, home SSR + flash deal countdown, PLP SSR (sidebar/filter/sort/pagination), PDP SSR (gallery/variant/JSON-LD/OG) + add-to-cart stub, search page, coupon center, sitemap.xml/robots.txt** (~15) |
| SF-5 | inventory + payment services | 2 | SF-2 | inventory-service (stock, variant-level reservations TTL, `POST /reservations` all-or-nothing + commit/release qua events), payment-service (Stripe intent/webhook verify/adapter SPI createIntent-void-refund/outbox), integration harness Testcontainers (~10) |
| SF-6 | cart + checkout UX | 3 | SF-3, SF-4, SF-5 | cart-service (Redis guest+user qua cart_token cookie, merge-on-login POST /cart/merge, removed-product filter), mfe-checkout (cart UI, checkout steps, coupon apply, Stripe.js confirm — Stripe test keys từ `.env`, không key → lỗi rõ ràng không crash, confirmation page) — **gate: checkout/coupon/Stripe-confirm build trên contract stubs của ordering; live wiring tại SF-10** (~12) |
| SF-7 | admin MFE | 3 | SF-3, SF-4, SF-5 | mfe-admin shell + RBAC guards, products/categories CRUD (**live** — catalog có từ T2; **form tabs vi/en cho các trường i18n — D17**), coupons CRUD + reviews moderation queue + orders list/detail + revenue stats (**mock-gate** theo contract — ordering chưa có ở T3; low-stock live qua SF-5), live-data verify SF-10 (~14) |
| SF-8 | reviews + wishlist | 3 | SF-3, SF-4 | reviews aggregate trong catalog-service (moderation states, verified-purchase từ order.confirmed — **event harness Testcontainers với synthetic order.confirmed**, không đòi ordering chạy thật), **PDP (storefront-web Next) reviews section + write-review modal (client component — file-slice SF-8)** (mọi user đăng nhập viết được, badge verified qua event), wishlist APIs + heart (Next PDP/PLP + shell account) + wishlist page, my-reviews (~11) |
| SF-9 | ordering saga + coupons | 3 | SF-5 | ordering-service + saga orchestrator (reserve sync all-or-nothing, compensation edges + late-payment refund — §3.3, fail-injection tests) + outbox relay, coupons validate/usage-reserve, order state machine §3.6 + my-orders APIs **+ my-orders UI trong mfe-account (`pages/orders/*` — file-slice)** (~13) |
| SF-10 | convergence + ship | 4 | SF-6, SF-7, SF-8, SF-9 | Checkout **live wiring** (mfe-checkout → ordering thật), **notification-service (email Mailpit) + log-service (Mongo `event_log` fan-in — D14)**, golden-path Playwright E2E + admin CRUD spec + **review-flow E2E (§5.6)** + saga fail spec (§5.7) + asserts §5.3 (admin tạo product → thấy trên storefront) / §5.4 (mỗi service standalone) / §5.5 (gateway 403 admin), deterministic seed (coupon code cố định, product names cho search, Stripe test cards 4242-success + 4000...0002-declined), profile `full` compose + static MFE hosting qua gateway + **final mounts: đủ 4 remote apps + shell host, full route table, `make dev` full-stack**, demo README + script, ADR hoàn thiện, perf/security sanity (~14) |

**Anti-duplicate check (đã liệt kê tasks mọi SF):** scaffold service → SF-1 template (SF khác chỉ invoke = Zweck); auth FE → SF-2 packages/auth (SF khác consume); UI primitives → SF-2 ui-kit; i18n infra → SF-2 (keys per-SF là Zweck); admin shell → SF-7; contracts → SF-2 freeze. Không pattern nào lặp ≥2 SF ngoài Zweck-merges. Không SF < 8 tasks.

### 6.1 Contract-freeze inputs (đóng băng tại SF-2 — mọi SF code theo đây, không tự chế)

1. **Giá:** server-side re-price tại POST /orders từ catalog (authority); cart là duyệt hiển thị.
2. **Sản phẩm bị xóa/hết khi ở trong cart:** cart lọc mục + nhãn "Không còn khả dụng"; reserve fail ở saga → ORDER_FAILED (path có sẵn).
3. **Coupon:** reserve usage nguyên tử lúc POST /orders (không vượt usage-limit kể cả concurrent), finalize tại CONFIRMED, release khi FAILED/CANCELLED; usage đã reserve được honor kể cả coupon expire sau đó; % trên VND làm tròn xuống (floor).
4. **Inventory theo variant** (không per-product): `variant_id` xuất hiện trong cart item, order line, reservation schema.
5. **order.confirmed fat payload:** `{order_id, user_id, email, items[{product_id, variant_id, qty, price}], subtotal, discount, total, coupon_code}` — đủ cho cả 3 consumer (notification/cart/catalog) không cần call-back HTTP.
6. **Review permission:** mọi user đã đăng nhập viết được review (vào moderation queue); badge "Mua đã xác nhận" chỉ gán khi khớp order.confirmed.
7. **Guest cart identity:** cart-service cấp `cart_token` (cookie); merge khi login qua POST /cart/merge (JWT + cart_token).
8. **Admin stats read endpoints:** ordering.yaml (`GET /admin/stats/revenue-by-day`, `/admin/stats/orders-summary`, `/admin/stats/top-products`) + inventory.yaml (`GET /admin/inventory/low-stock`) — read-only, không BFF.
9. **Locale conventions (D17):** mọi GET content endpoint nhận `?locale=vi|en` (override) + `Accept-Language` header; response resolve theo locale với **fallback `vi`**; admin write endpoints nhận full `{vi, en}` object cho các trường i18n (đánh dấu `*I18n` trong schema); slug: vi-slug dùng cho URL mặc định, en-slug riêng (`/en/p/<slug-en>`); UGC (reviews) không dịch.

**Exit criteria Tier 0-1 (pin):** SF-1 gate = `docker compose up` infra healthy + template service boot `/actuator/health` xanh (Testcontainers) + turbo build xanh + gateway smoke route 200. SF-2 gate = 7 OpenAPI specs validate + codegen compile + packages/auth unit tests xanh + **federation harness xanh** + USER đã chọn design direction (riêng — KHÔNG chặn contract freeze).

**Tier-gate:** gate mỗi SF CHỈ test những gì SF đó + các tier trước cung cấp. SF-4: add-to-cart stub theo cart contract. SF-6: checkout/coupon/Stripe-confirm trên ordering contract stubs + payment thật (SF-5) — live end-to-end ở SF-10. SF-7: orders/coupons-CRUD/moderation/revenue mock theo contract; products/categories + low-stock live (SF-5). SF-8: verified-purchase qua synthetic event harness, không đòi ordering thật. Cross-SF flow thật (golden path, review E2E, saga fail) chỉ ở SF-10.

**Shared-file ownership (quy tắc merge song song):** (a) **shell** remote-manifest + routes + slot mounts — append-only per SF; header components (search/auth/cart-badge) qua **slot registry**: remote đăng ký widget từ app của mình, KHÔNG sửa file Header của shell; mount-verify cuối ở SF-10; (b) **mfe-account** — file-slice: SF-8 sở hữu `pages/wishlist/*` + `pages/my-reviews/*`, SF-9 sở hữu `pages/orders/*`, router registry additive-only; (b2) **storefront-web (Next)** — SF-4 sở hữu toàn bộ trừ: SF-8 sở hữu `components/reviews/*` + `components/wishlist/*` + khu vực PDP reviews section (chèn qua slot/props do SF-4 định sẵn); (c) **gateway routes** — append-only block per service + route split D16 (Next vs shell — SF-4 thêm khối Next, SF-6/7/9 thêm block service mình); (d) **Makefile** — append-only target block per service; (e) **`contracts/` + `packages/contracts/`** — READ-ONLY sau khi SF-2 merge: SF dùng generated clients as-is, phát hiện freeze hỏng → flag coordinator amendment task, KHÔNG tự sửa; (f) `pnpm-lock.yaml` — pre-pin Tier 1, post-merge coordinator `pnpm install` regenerate, SF ưu tiên deps đã có trong workspace (Next deps do SF-4 thêm — coordinator serialize lúc merge); (g) `docker-compose.yml` — append-only block per service.

**Parallelism:** T2 chạy 3 SF song song (SF-3/4/5), T3 chạy 4 SF song song (SF-6/7/8/9 — file sets rời nhau theo shared-file ownership phía trên) — nhờ contracts freeze + append-only rules.

## 7. Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Checkout saga phức tạp (4 services, distributed tx) — risk lớn nhất | Orchestration (không choreography) trong ordering; outbox polling; idempotency keys; 1/3 tasks SF-9 dành cho compensation + fail-injection; E2E golden path ở SF-10 test đúng luồng này |
| R2 | 16 processes local (8 JVM + 5 Vite + infra) — nặng macOS | Infra-only compose; JVM apps chạy host qua `make dev`; chọn lọc MFE servers; profile `full` là opt-in; Spring Boot 3.x + virtual threads nhẹ hơn; documented memory expectations |
| R3 | Merge conflicts shared files khi 3 SF song song | Contracts freeze T1; lockfile pre-pin; compose append-only; ui-kit additive-only; coordinator-serialized merge |
| R4 | Spring Boot boilerplate × 7 services | SF-1 service template + Makefile targets; common-lib gói sẵn security/outbox/error |
| R5 | Stripe test cần API keys | `.env.example` + seed docs; không key → payment service khởi động nhưng checkout trả lỗi rõ ràng (không crash); stripe-cli trong compose forward webhook |
| R6 | Scope creep "đầy đủ tính năng" | Scope §4 ĐÓNG BĂNG; ngoài scope → Linear backlog items, không SF |
| R7 | MFE composition sai (N bản React, token drift) | shared singletons bắt buộc trong shell config; packages/auth là ĐÚNG MỘT nguồn token; SF-2 verify federation trước khi tier sau fork |

## 8. Assumptions (không hỏi lại — BALANCED mode, flag ở đây)

- Auth chỉ email/password (không social login) — D7.
- Shipping: flat-fee demo, không tích hợp carrier.
- Product variants đơn giản (size/color options, không auto-generated SKU matrix).
- Seed data: ~24 sản phẩm generic theo 4-6 danh mục kiểu Tiki (Điện tử, Thời trang, Nhà cửa, Sách, Làm đẹp...), ảnh placeholder.
- Flash-deal (§4.1) không có engine riêng: product có `compare_price` (giá gạch → badge %) + `flash_sale_ends_at` nullable (đếm ngược); admin chỉnh 2 trường này trong product form. Rating sao trên card đọc từ `rating_avg`/`rating_count` denormalized (seed sẵn, SF-8 cập nhật qua events).
- Stripe test keys từ user `.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); không key → payment service khởi động degraded, checkout báo lỗi rõ ràng (R5).
- Currency VND, locale vi mặc định; i18n `en` chỉ phủ chrome chung (nav/labels) — dịch đầy đủ là backlog.
- Search tiếng Việt (D15): Elasticsearch `standard` analyzer là engine chính; PG FTS (`simple` + `unaccent`) là fallback — cả hai chấp nhận khớp seed-term chính xác, không stemming tiếng Việt đầy đủ (acceptance §5.2/§5.9 theo seed-term).
- JVM 21 có sẵn trên máy; nếu không, Makefile check + hướng dẫn.
