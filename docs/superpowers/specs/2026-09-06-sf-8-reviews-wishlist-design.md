# SF-8 Reviews + Wishlist — Design Spec (FI-318)

Status: Approved (autonomous — self-answered per context pack + epic spec; epic-level Q&A đã đóng từ bracket/user)
Sources: `docs/superpowers/contexts/sf-8.md` (spec slice — AUTHORITY) · epic spec `2026-09-06-ecommerce-platform-design.md` (§3.2, §6.1.5/6.1.6, D4) · contracts `catalog.yaml` + `events/order.confirmed.schema.json` + `events/review.moderated.schema.json` (READ-ONLY) · Phase 0 impact analysis (chat, 2026-09-06)

## 1. Problem

Storefront chưa có social proof kiểu Tiki: khách không viết/đọc được review, không có wishlist. SF-8 thêm review pipeline (PENDING → APPROVED/REJECTED + rating aggregate denormalized) + verified-purchase "Mua đã xác nhận" qua **synthetic `order.confirmed` harness** (không đợi SF-9 ordering) + wishlist — tất cả trong catalog-service (đúng bảng ownership §3.2 epic: catalog sở hữu reviews/wishlist/rating aggregate) + 2 FE slice (storefront-web reviews/wishlist components, mfe-account wishlist/my-reviews pages).

## 2. Scope

**In:** catalog-service (8082, db_catalog): Flyway migration MỚI `V11__reviews_wishlist.sql` (3 bảng + indexes; V1/V10 không đụng); Review APIs (submit/list-public/admin moderation + `review.moderated` outbox); `GET/PUT/DELETE /api/catalog/me/reviews*` (additive — xem Q1); rating aggregate transactional; verified-purchase consumer `order.confirmed` (idempotent); `ReviewSeedTool` (profile test) publish synthetic event; wishlist APIs 4 endpoints; IT Testcontainers (PG + RabbitMQ). storefront-web: `components/reviews/*` (PDP reviews section SSR + write modal client + badge verified + pagination + breakdown bars + my-PENDING edit/delete), `components/wishlist/*` (heart PDP + ProductCard), chèn tối thiểu vào `p/[slug]/page.tsx` + `ProductCardView.tsx`; `lib/account-session.ts` (client session boot — additive file mới). mfe-account: `pages/wishlist/*` + `pages/my-reviews/*` + exposes append. Shell: App.tsx +2 route branches + remotes.d.ts +2 declares (append).

**Out (KHÔNG làm):** moderation UI admin (SF-7 mock, live wiring SF-10), notification email (`review.moderated` consumer SF-10), ordering thật/E2E (SF-10), contracts sửa (READ-ONLY), `mfe-account/pages/*` khác, stock-alert/uploads (D21), sửa SF-4 code ngoài 2 điểm chèn đã liệt kê.

## 3. Brainstorm Q&A (self-answered, autonomous)

| # | Câu hỏi | Trả lời |
|---|---------|---------|
| Q1 | `GET /api/catalog/me/reviews` + PUT/DELETE me/reviews KHÔNG có trong catalog.yaml freeze — làm sao? | Gap thật (pack slice liệt kê rõ + ACCEPTANCE dòng 5 cần my-reviews page): implement server-side **additive** (không sửa contract), **REQUIREMENT-GAP comment lên FI-310** (pattern Q5 SF-4 — `official` filter cũng vậy; kèm luôn 2 gap khác: summary contract POST reviews ghi "chi user mua hang" mâu thuẫn epic §6.1.6 mọi-user-được-review — implement theo epic/pack; và các endpoint `/me/reviews*` mới hoàn toàn). Shape `MeReviewPage {items[{id,productId,productName,rating,title,content,status,verifiedPurchase,createdAt}],page,size,total}`; filter query `productId` optional (PDP client block dùng). PUT/DELETE chỉ owner + chỉ khi PENDING; **không-phải-owner → 404** (không lộ tồn tại review của người khác — deterministic cho IT); owner nhưng trạng thái ≠ PENDING → 409. |
| Q2 | Migration số mấy? Pack ghi `V2__reviews_wishlist.sql` | Pack mâu thuẫn code thật: V1 header "V2-V9 reserve cho schema nền" + domain migrations từ V10 (SF-4). V2 chạy TRƯỚC V10 fresh-DB → FK `products` vỡ. Dùng **`V11__reviews_wishlist.sql`** — ghi rõ commit + audit log. |
| Q3 | Bảng schema? | `reviews(id UUID PK, product_id UUID NOT NULL FK products, user_id UUID NOT NULL, user_name VARCHAR(255) NOT NULL, rating INT CHECK 1..5, title VARCHAR(255), content TEXT NOT NULL, status VARCHAR(16) DEFAULT 'PENDING' CHECK IN(PENDING,APPROVED,REJECTED), verified BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now(), **CONSTRAINT uq_reviews_user_product UNIQUE (user_id, product_id)** — race-safe cho policy 409 Q4: 2 submit đồng thời vượt lookup vẫn bị DB chặn, service map violation → 409)`; `review_eligibility(user_id, product_id FK, order_id, created_at, PK(user_id,product_id))` — mua 2 lần vẫn 1 row (verified là boolean); `wishlist_items(user_id, product_id FK, created_at, PK(user_id,product_id))`. Indexes: `reviews(product_id,status,created_at DESC)`, `reviews(user_id,created_at DESC)`. |
| Q4 | Submit review — auth + điều kiện? | JWT bắt buộc (Spring Security `anyRequest().authenticated()` đã cover POST products/** — SecurityConfig KHÔNG đổi). Product phải tồn tại + PUBLISHED + chưa soft-delete → else 404. `user_id` = claim `sub`, `user_name` = claim `fullName` (fallback email local-part). `verified` = EXISTS review_eligibility(user_id, product_id) lúc submit. Status luôn PENDING lúc tạo. Response **202 no-body** (đúng contract `'202': Đã nhận — chờ duyệt` — KHÔNG trả Review body; FE toast là client-side text). Duplicate policy: **1 review/user/product** — submit lần 2 cùng (user_id, product_id) → **409** (service check + UNIQUE constraint V11 chống race — spec-critic P2; user sửa nội dung qua PUT me/reviews khi PENDING). **Hệ quả chấp nhận (ghi vào REQUIREMENT-GAP/audit):** review bị REJECTED khóa vĩnh viễn user đó re-review product (resubmit 409, edit 409) — chủ đích, không phải bug. Rating 1..5 validate, content non-blank → 400 qua GlobalExceptionHandler. |
| Q5 | Public list reviews? | GET `/products/{slug}/reviews?page&size` — CHỈ APPROVED, `created_at DESC`; response `ReviewList{items, breakdown, total}` (khớp contract); breakdown key `"5".."1"` LUÔN đủ (fill 0) từ GROUP BY; product không tồn tại/draft → 404 (khớp contract 404). UGC không i18n (D17). |
| Q6 | Rating aggregate thế nào? | Trong CÙng tx moderation (approve/reject): lock product row pessimistic (`@Lock(PESSIMISTIC_WRITE)`) → recompute `rating_avg = ROUND(AVG(rating),1)` + `rating_count = COUNT(*)` trên APPROVED-only → update 2 cột products (SF-4 đã đọc sẵn). Reject: recompute idempotent (rejected chưa bao giờ được tính). Chỉ review transition PENDING→* mới chạm aggregate. |
| Q7 | Double-transition (approve review đã APPROVED)? | Guard: chỉ PENDING → APPROVED/REJECTED; trạng thái khác → **409 CONFLICT** (RFC 7807 — contract không liệt kê 409 nhưng dưới-spec error responses là bình thường; test có). Idempotency moderation không yêu cầu. |
| Q8 | `review.moderated` outbox? | `OutboxWriter.write("review.moderated", payload, correlationId)` trong CÙNG tx transition (MANDATORY propagation — pattern AdminCatalogService). Payload đúng schema: `{reviewId, productId, userId, status APPROVED\|REJECTED, rating, moderatedAt}`. Relay sẵn chạy (outbox.relay.enabled dev). correlationId từ header `X-Request-Id` nếu có. |
| Q9 | Verified-purchase consumer? | Queue mới `q.catalog.order-confirmed.eligibility` bind routing `order.confirmed` trên exchange `ecommerce.events` (append RabbitMqConfig — KHÔNG đụng bean cũ, declare idempotent). Parse `EventEnvelope` (raw String + ObjectMapper — pattern duy nhất); guard eventType; idempotency marker **`elig:{eventId}`** (per-group prefix — 2 queue khác có thể cùng nhận eventId). Mỗi item: `INSERT (user_id,product_id,order_id) ON CONFLICT DO NOTHING` (native — dedupe DB-level). UUID parse fail → WARN + ack (poison-safe như CacheInvalidateConsumer, KHÔNG requeue). |
| Q10 | ReviewSeedTool demo không cần ordering? | `ApplicationRunner` gated: profile `test` + property `catalog.review-seed.enabled=true` + props `catalog.review-seed.user-id`, `catalog.review-seed.product-id` (comma-list), `catalog.review-seed.order-id` (default random). Publish `EventEnvelope` `order.confirmed` qua `AmqpTemplate` vào exchange `ecommerce.events` — payload khít schema SF-2 (items có productId/variantId/qty/price/name). Dev chạy: `SPRING_PROFILES_ACTIVE=test ... --catalog.review-seed.enabled=true --catalog.review-seed.user-id=<uuid> ...` hoặc qua `make dev svc=catalog-service` + env. |
| Q11 | Wishlist APIs? | Đúng contract: `GET /me/wishlist?page&size&locale` → `ProductCardPage` (join wishlist_items→products PUBLISHED, mới nhất trước, resolve locale reuse mapping SF-4); `GET /me/wishlist/ids` → `{productIds[]}`; `PUT /me/wishlist/{productId}` → 204 idempotent (product PUBLISHED tồn tại else 404); `DELETE /me/wishlist/{productId}` → **204 LUÔN** (idempotent — không có row vẫn 204, kể cả product đã hard-delete; contract không định nghĩa 404 cho DELETE). |
| Q12 | FE client components lấy JWT thế nào (Next app riêng với shell)? | Dùng `@ecommerce/auth` (Zweck — SF-2 package): storefront-web thêm dep `@ecommerce/auth` + `transpilePackages` append. `lib/account-session.ts` (client): `ensureSession()` = `configureAuth({refreshUrl:'/api/identity/auth/refresh'})` + single-flight `authStore.refresh()` (cookie `refresh_token` path `/api/identity` — host-scoped, đi qua Next rewrites `/api` → gateway). Token in-memory; mọi call qua `authStore.fetch` (401 → single-flight refresh → retry). Sau logout ở shell, Next boot refresh fail → guest. |
| Q13 | Guest click heart / viết review? | Link `/account` (shell) — đúng pack. Heart guest vẫn render (outline), click → điều hướng; modal guest → CTA "Đăng nhập để viết đánh giá" link `/account`. |
| Q14 | PDP reviews section SSR + caching? | Server component fetch `listProductReviews` **no-store** (moderation phải thấy ngay — khác ISR 60 product). Pagination qua searchParams `?reviewPage=N` (server re-render; link-based). Breakdown bars CSS width %. Badge "Mua đã xác nhận"/"Verified purchase" khi `verifiedPurchase`. Chèn vào `#tab-reviews` panel (thay "Sắp ra mắt"). Write modal + my-PENDING manage = client component trong cùng section. |
| Q15 | Heart trên ProductCard (server component bọc `<a>`)? | `WishlistHeart` client component absolute top-right trong `.p-card`; click `preventDefault` + `stopPropagation` (không điều hướng). State: module-level ids cache fetch 1 lần `/me/wishlist/ids` khi authenticated; toggle PUT/DELETE optimistic. PDP: heart đặt cạnh tên/price trong `pdp-info` (page.tsx chèn). |
| Q16 | mfe-account pages? | `pages/wishlist/WishlistPage.tsx` (authReady guard như AccountPage → guest appNavigate('/login'); grid card local (ảnh/tên/giá/sao/link `/p/{slug}` + nút Xóa → DELETE → refetch); `pages/my-reviews/MyReviewsPage.tsx` (GET /me/reviews → list + Badge status PENDING vàng/APPROVED xanh/REJECTED đỏ + tên product + sao + nội dung + ngày). Fetch self-contained trong từng page dir (file-slice — KHÔNG import chéo ra ngoài slice). Exposes append `./WishlistPage`, `./MyReviewsPage` + standalone `?page=` query không cần (shell route). |
| Q17 | Shell manifest? | `App.tsx` +2 lazy import `account/WishlistPage`, `account/MyReviewsPage` + 2 branch exact-match `/account/wishlist`, `/account/reviews` (AccountErrorFallback + Suspense như branches sẵn có); `remotes.d.ts` +2 declare. KHÔNG đụng phần khác shell. |
| Q18 | IT tests? | Testcontainers PG (harness chuẩn) + RabbitMQ container (pattern CacheInvalidateTest — container SINGLETON per JVM qua AbstractIntegrationTest static init / static field, KHÔNG `@Container` per-class — context cache chết class thứ 2): (1) submit 401 không token / **202** có token (không body); public list KHÔNG thấy PENDING; rating 0/6 → 400; product draft → 404; submit trùng (user, product) lần 2 → 409. (2) admin default list PENDING; approve → public thấy + aggregate đúng (avg 1 chữ số, count); reject → không thấy + aggregate giữ; double-transition → 409; outbox row `review.moderated` status APPROVED/REJECTED payload khít schema. (3) verified: publish synthetic `order.confirmed` (user A, product X) qua exchange thật → chờ consume → review A verified=true, user B false; publish trùng eventId → vẫn 1 eligibility row. (4) wishlist: CRUD + dedupe + 401 + 404 product lạ PUT + GET page enrich + ids; DELETE không-có vẫn 204. (5) me/reviews: chỉ thấy của mình; PUT/DELETE PENDING ok; APPROVED → 409; user khác → 404. |
| Q19 | FE tests? | vitest storefront-web (có script `test`): helper breakdown width %, buildReviewPayload, heart toggle state reducer. mfe-account: KHÔNG có test script (verified package.json) → typecheck + build xanh là đủ. |
| Q20 | Badge/aggregate khi seed rating cũ? | Seed SF-4 đã đặt rating_avg/rating_count tĩnh trên products. SF-8 KHÔNG backfill: aggregate chỉ đổi khi moderation xảy ra (recompute từ reviews thật sẽ "mất" rating seed — chấp nhận: moderation là nguồn sự thật mới; seed review thật nếu cần demo). |

## 4. Architecture

```
PDP (Next :3000) ── SSR GET /api/catalog/products/{slug}/reviews (no-store) ──► catalog :8082
   │ write modal (client) ── POST /products/{slug}/reviews (Bearer authStore) ──► PENDING
   │ heart (client) ── PUT/DELETE /api/catalog/me/wishlist/{productId} ──► wishlist_items
shell :5173 ── /account/wishlist, /account/reviews ──► mfe-account pages ──► /api/catalog/me/*
                                                                │
admin curl/Swagger ── POST /admin/reviews/{id}/approve ──► tx: status=APPROVED
                                                                ├─ recompute products.rating_avg/count (lock product)
                                                                └─ outbox ──► review.moderated ──► RabbitMQ (SF-10 consume)
ReviewSeedTool (profile test) ── publish order.confirmed ──► q.catalog.order-confirmed.eligibility
                                                                └─ INSERT review_eligibility (idempotent, dedupe)
```

**catalog-service packages mới:** `reviews` (ReviewEntity, ReviewEligibilityEntity, ReviewRepository, ReviewEligibilityRepository, ReviewService, RatingAggregateService, web/ReviewController, web/MeReviewController, web/AdminReviewController, web/dto/*), `wishlist` (WishlistItemEntity, WishlistRepository, WishlistService, web/WishlistController), `reviews.consumer/OrderConfirmedEligibilityConsumer`, `reviews.seedtool/ReviewSeedTool`. RabbitMqConfig: append queue+binding. Migration V11.

**FE:** storefront-web `components/reviews/{ProductReviewsSection,WriteReviewModal,ReviewBadge}.tsx`, `components/wishlist/{WishlistHeart}.tsx`, `lib/account-session.ts`, `lib/reviews-api.ts` (server fetch wrapper). mfe-account `pages/wishlist/*`, `pages/my-reviews/*`.

## 5. Error handling

- API lỗi: 400/401/403/404/409 qua common-lib GlobalExceptionHandler (RFC 7807) — không tự chế shape.
- Consumer poison message: parse fail / UUID sai → WARN + ack (không requeue, không crash listener) — như CacheInvalidateConsumer.
- Consumer lỗi DB tạm thời: rethrow → requeue mặc định Spring (at-least-once + idempotency marker chịu).
- FE mọi call authenticated: 401 → authStore single-flight refresh → retry 1 lần; vẫn fail → guest UI (link /account).
- Reviews fetch fail (server): section render degraded "Không tải được đánh giá" — không crash PDP (pattern CatalogUnavailableError).
- Wishlist heart fail toggle: revert optimistic state + console/toast êm.

## 6. Testing

- **Backend IT** (Q18 list — 5 nhóm, Testcontainers PG + RabbitMQ; tag `integration`, `*Test` naming — nhớ bài học *IT skip im lặng; container singleton shared harness, không `@Container` per-class).
- **FE vitest** (Q19).
- **Gate verify**: từng dòng ACCEPTANCE context pack + Rule 0 browser 3 tầng (DOM đo → Orca browser screenshot → flow trọn: login → PDP viết review → toast → approve bằng curl admin → review hiện + ProductCard rating đổi → heart toggle → /account/wishlist → /account/reviews) + synthetic event qua ReviewSeedTool cho badge verified.
- **Con số aggregate kỳ vọng (pin để verify không đoán):** demo tạo 3 review APPROVED rating 5,4,4 + 1 REJECTED rating 5 cho cùng product → sau approve đủ 3: ProductCard/PLP đọc `rating_avg = 4.3`, `rating_count = 3` (rejected KHÔNG tính); approve review thứ 4 (nếu có) → 4.3→4.5 với (5,4,4,5). Trước moderation đầu tiên product giữ rating seed SF-4 (không backfill — Q20); mọi con số kiểm tra = recompute từ bộ APPROVED thật, KHÔNG so với rating seed.

## 7. Risks

- Migration numbering V11 ≠ pack V2 (Q2) — đã có lý do kỹ thuật, ghi audit.
- `/me/reviews*` + filter `productId` không có trong contract freeze — additive + REQUIREMENT-GAP FI-310 (Q1).
- pnpm-lock churn (thêm `@ecommerce/auth` vào storefront-web) — regen + commit lockfile; các SF song song cũng đụng lockfile → merge coordinator serialize (audit ghi sẵn).
- Shell App.tsx là file dùng chung — edit tối thiểu 2 branches + 2 imports, additive-only.
- ISR/Next cache: reviews fetch no-store tránh stale moderation (Q14); PDP product info vẫn ISR 60 (SF-4 không đổi).
- Token in-memory mất khi F5 trên PDP: boot session lại qua refresh cookie (Q12) — cookie path `/api/identity` đã verify.
- Concurrent moderation race → pessimistic lock product row (Q6).
- Seed `rating_avg` cũ bị thay khi có moderation thật (Q20 — chấp nhận, ghi nhận).
