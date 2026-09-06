# SF-8 reviews-wishlist — Implementation Plan (FI-318)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review + wishlist hoạt động: mọi user đăng nhập viết review (PENDING), admin approve qua API → hiện PDP + badge "Mua đã xác nhận" (verified-purchase qua synthetic `order.confirmed` harness — KHÔNG cần ordering), `rating_avg/rating_count` ProductCard cập nhật; wishlist heart PDP/PLP + trang wishlist + my-reviews trong mfe-account.

**Architecture:** Tất cả trong catalog-service (đúng ownership epic §3.2) — packages MỚI `reviews/` + `wishlist/` (không sửa code SF-4). Moderation approve/reject trong 1 tx: transition + pessimistic-lock product + recompute aggregate + OutboxWriter `review.moderated`. Verified-purchase: consumer queue `q.catalog.order-confirmed.eligibility` ← `order.confirmed` (fat payload) → `review_eligibility` (idempotent `elig:` prefix per-group). FE: storefront-web Next client components dùng `@ecommerce/auth` (refresh cookie path `/api/identity` qua rewrites `/api`); mfe-account 2 page mới + shell append 2 routes.

**Tech Stack:** Spring Boot 3.3.5/Java 21 · Flyway/PG 16 (V11) · spring-amqp · common-lib OutboxWriter/IdempotentConsumer/EventEnvelope · Testcontainers PG+RabbitMQ · Next 14.2 · @ecommerce/{contracts,auth,ui-kit,i18n} · Vite MF (mfe-account)

**Linear Issue:** FI-318 · **Nhánh đích:** `story/fi310-ecommerce-platform` · **Spec:** `docs/superpowers/specs/2026-09-06-sf-8-reviews-wishlist-design.md` + pack `docs/superpowers/contexts/sf-8.md`

---

## Conventions dùng chung mọi task (đọc trước khi chạy task nào)

1. **Contract = LAW:** schema khớp `contracts/openapi/catalog.yaml` — `Review {id, userId, userName, rating, title?, content, verifiedPurchase, createdAt}`, `ReviewList {items[], breakdown{"5".."1"}, total}`, `ReviewSubmitRequest {rating, title?, content}`, `ReviewAdmin = Review + {productId, status}`, `ReviewAdminPage {items,page,size,total}`, `WishlistIds {productIds[]}`, wishlist GET → `ProductCardPage`. Submit → **202 no-body**. Page 1-based, size default 20 max 100. Giá VND integer. Error RFC 7807 common-lib. **Additive ngoài contract (đã REQUIREMENT-GAP FI-310):** `GET /api/catalog/me/reviews?productId=&page=&size=` + `PUT/DELETE /api/catalog/me/reviews/{id}`.
2. **Boundary READ-ONLY:** `contracts/**`, `frontend/packages/**` (import-only), `V10__catalog.sql`, `V1__init.sql`, code SF-4 ngoài 3 điểm chèn ghi rõ (PDP `page.tsx`, `ProductCardView.tsx`, shell `App.tsx`+`remotes.d.ts` — edit tối thiểu additive), pages mfe-account khác, gateway-routes (block catalog sẵn — KHÔNG đụng). Shared files append-only: `RabbitMqConfig.java` (bean mới, KHÔNG sửa bean cũ), `next.config.ts` transpilePackages, mfe-account `vite.config.ts` exposes, pnpm package.json deps.
3. **Java layout:** package `com.ecommerce.catalog.reviews.*` + `com.ecommerce.catalog.wishlist.*` (tách khỏi packages SF-4); DTOs `web/dto/` đặt trong package reviews/wishlist tương ứng (không đụng dto SF-4). Migration **`V11__reviews_wishlist.sql`** (KHÔNG phải V2 — V2-V9 reserve theo header V1, V10 là SF-4; V2 chạy trước V10 vỡ FK fresh-DB — quyết định có ghi spec Q2).
4. **Events:** producer `OutboxWriter.write("review.moderated", payload, correlationId)` **MANDATORY trong tx moderation**; payload khít `contracts/events/review.moderated.schema.json` `{reviewId, productId, userId, status APPROVED|REJECTED, rating, moderatedAt}`. Consumer queue `q.catalog.order-confirmed.eligibility` bind routing `order.confirmed` trên exchange `ecommerce.events`; envelope parse raw String + ObjectMapper (pattern CacheInvalidateConsumer); marker `IdempotentConsumer.tryConsume("elig:" + eventId)` cùng `@Transactional`; poison (parse/UUID fail) → WARN + ack KHÔNG requeue.
5. **Auth:** JWT `sub` = user UUID, `fullName` claim = user_name (fallback email local-part). SecurityConfig KHÔNG đổi — `anyRequest().authenticated()` cover POST reviews + `/me/**`; `/api/catalog/admin/**` hasRole ADMIN sẵn. IT mint token bằng `AbstractIntegrationTest.mintToken(role)` — **sub = "it-admin" hằng**: IT review cần sub khác nhau theo user → tạo **class `ReviewsItHarness extends AbstractIntegrationTest` đặt Ở PACKAGE `com.ecommerce.catalog` (test root — CÙNG package với base, vì `JWT_KEY_PAIR` là package-private KHÔNG subclass-visible xuyên package — plan-critic P1)** với `protected static String mintTokenFor(String sub, String role)` tự ký bằng `JWT_KEY_PAIR`; các IT reviews/wishlist (package con) extends harness này. KHÔNG sửa file SF-4.
6. **Commit:** mỗi task 1 atomic commit, stage ĐÚNG file từ `git status` (KHÔNG `git add -A`). Format `<type>(<scope>): <summary>`. KHÔNG `--no-verify`.
7. **Chạy IT:** `mvn -pl services/catalog-service -am verify` từ `backend/`; `*Test` naming (KHÔNG *IT — skip im lặng); container singleton qua `AbstractIntegrationTest` (KHÔNG `@Container` per-class ngoài container MỚI của class — RabbitMQ container static field dùng chung trong class; lưu ý context-cache: subclass KHÔNG re-declare webEnvironment). Exit criteria: failsafe `Tests run: > 0` thật.
8. **Frontend:** storefront-web client components gọi relative `/api/...` (rewrites proxy); server components fetch GATEWAY_URL trực tiếp. Auth client: `lib/account-session.ts` — `ensureSession()` single-flight `configureAuth({refreshUrl:'/api/identity/auth/refresh'})` + `authStore.refresh()`; mọi authenticated call qua `authStore.fetch` (401 → single-flight refresh → retry 1 lần). Guest → link `/account`. mfe-account pages guard `authReady` (pattern AccountPage) → guest `appNavigate('/login')`; fetch self-contained trong page dir. i18n copy vi/en inline object (pattern COPY của SF-4 pages).
9. **Aggregate pin (verify không đoán):** sau approve bộ {5,4,4} → `rating_avg=4.3`, `rating_count=3`; REJECTED không tính. KHÔNG so với rating seed SF-4 (không backfill — moderation là nguồn sự thật mới).

---

### Task 1: flyway-reviews-wishlist-tables

**Files:** Create `backend/services/catalog-service/src/main/resources/db/migration/V11__reviews_wishlist.sql`, `domain/ReviewEntity.java`, `domain/ReviewEligibilityEntity.java`, `domain/WishlistItemEntity.java`, `domain/ReviewStatus.java`, `repo/ReviewRepository.java`, `repo/ReviewEligibilityRepository.java`, `repo/WishlistItemRepository.java`

- [ ] V11: 3 bảng theo spec Q3 — `reviews` (UNIQUE(user_id,product_id), CHECK rating 1..5, CHECK status), `review_eligibility` (PK user+product, FK product), `wishlist_items` (PK user+product, FK product); indexes `reviews(product_id,status,created_at DESC)` + `reviews(user_id,created_at DESC)`; header comment giải thích V11 (không V2)
- [ ] Entities JPA (`@JdbcTypeCode(SqlTypes.JSON)` không cần — mọi cột scalar; UUID dùng `UuidGenerator`/`@JdbcTypeCode(SqlTypes.CHAR)` theo style ProductEntity — đọc entity SF-4 trước để khớp mapping UUID) + `ReviewStatus` enum PENDING/APPROVED/REJECTED
- [ ] Repos Spring Data: `ReviewRepository` (existsByUserIdAndProductId, findAllByProductIdAndStatusOrderByCreatedAtDesc(Pageable), countByProductIdAndStatusGroupByRating native/JPQL, findAllByUserIdOrderByCreatedAtDesc, findById + owner checks ở service), `ReviewEligibilityRepository` (native `INSERT ... ON CONFLICT DO NOTHING` + existsByUserIdAndProductId), `WishlistItemRepository` (findAllByUserIdOrderByCreatedAtDesc Pageable, existsByUserIdAndProductId, deleteByUserIdAndProductId)
- [ ] Verify: `mvn -pl services/catalog-service -am verify` — thêm 1 test flyway trong `CatalogFlywayMigrationTest` style (mở rộng test có sẵn nếu nó generic; nếu không → test riêng `ReviewsWishlistMigrationTest` assert 3 bảng + unique constraint tồn tại qua JDBC metadata)
- [ ] Commit: `feat(catalog): flyway V11 — reviews/review_eligibility/wishlist_items + entities + repos`

### Task 2: reviews-apis-submit-public-list

**Files:** Create `reviews/ReviewService.java`, `reviews/web/ReviewController.java`, `reviews/web/dto/{ReviewDto,ReviewListDto,ReviewSubmitRequest}.java`, `reviews/RatingAggregateService.java` (khung — dùng ở Task 3)

- [ ] `POST /api/catalog/products/{slug}/reviews` (JWT): resolve product theo slug vi/en + PUBLISHED + chưa soft-delete (404); parse `sub` UUID (400 nếu hỏng); duplicate check `existsByUserIdAndProductId` → 409 (bắt thêm `DataIntegrityViolationException` UNIQUE → 409 race-safe); verified = `reviewEligibility.exists`; status PENDING; **return 202 no-body**; validate rating 1..5 + content non-blank → 400
- [ ] `GET /api/catalog/products/{slug}/reviews?page&size`: chỉ APPROVED, created_at DESC; breakdown `"5".."1"` LUÔN đủ key (GROUP BY status=APPROVED, fill 0); product không tồn tại/draft → 404; trả `ReviewList`
- [ ] ReviewDto khớp contract đúng tên field (userId/userName/verifiedPurchase/createdAt ISO-8601)
- [ ] Verify: build xanh; IT thuộc Task 8
- [ ] Commit: `feat(catalog): review submit (202 PENDING, dup 409) + public list approved + breakdown`

### Task 3: reviews-moderation-admin-aggregate

**Files:** Modify `reviews/RatingAggregateService.java` (điền), Create `reviews/web/AdminReviewController.java`, `reviews/web/dto/{ReviewAdminDto,ReviewAdminPageDto}.java`

- [ ] `GET /api/catalog/admin/reviews?status&page&size` (ADMIN path-guard sẵn): default PENDING; trả `ReviewAdminPage` (Review + productId + status)
- [ ] `POST /api/catalog/admin/reviews/{id}/approve|reject`: load review 404; **chỉ PENDING → được transition, khác → 409**; trong 1 `@Transactional`: set status + `OutboxWriter.write("review.moderated", payload, requestId)` (payload khít schema — moderatedAt=now) + `RatingAggregateService.recompute(productId)` — `@Lock(PESSIMISTIC_WRITE)` product row → recompute `rating_avg=ROUND(AVG,1)`/`rating_count=COUNT(*)` trên APPROVED, update 2 cột; correlationId từ header `X-Request-Id` (nullable)
- [ ] Return 200 `ReviewAdmin` (trạng thái mới)
- [ ] Verify: build xanh; IT thuộc Task 8
- [ ] Commit: `feat(catalog): admin review moderation — approve/reject 409-guard + aggregate recompute lock + outbox review.moderated`

### Task 4: me-reviews-apis

**Files:** Create `reviews/web/MeReviewController.java`, `reviews/web/dto/MeReviewPageDto.java`

- [ ] `GET /api/catalog/me/reviews?productId&page&size` (JWT): chỉ review của mình (sub), mọi status, mới nhất trước; filter `productId` optional; kèm `productName` (resolve `name->>'vi'` join); trả MeReviewPage
- [ ] `PUT /api/catalog/me/reviews/{id}` (JWT): 404 nếu không tồn tại HOẶC không phải của mình (không lộ); 409 nếu status ≠ PENDING; validate như submit; update title/content/rating (user_name refresh từ token hiện tại); return 200 MeReviewDto
- [ ] `DELETE /api/catalog/me/reviews/{id}` (JWT): 404 như trên; 409 nếu ≠ PENDING; 204 no-body
- [ ] Verify: build xanh; IT thuộc Task 8. **REQUIREMENT-GAP FI-310 cho /me/reviews* đã post lúc Phase 3 (trước plan-critic — xem audit FI-318)**; task này chỉ giữ code additive khớp nội dung gap-comment
- [ ] Commit: `feat(catalog): me/reviews — list mọi status + filter productId + PUT/DELETE PENDING-only (additive ngoài contract, GAP flagged)`

### Task 5: verified-purchase-orderconfirmed-consumer

**Files:** Modify `config/RabbitMqConfig.java` (append queue + binding MỚI — bean cũ nguyên vẹn), Create `reviews/consumer/OrderConfirmedEligibilityConsumer.java`

- [ ] Queue `q.catalog.order-confirmed.eligibility` durable bind `order.confirmed` trên `ecommerce.events` (append block comment "SF-8" như pattern Task 7 cache)
- [ ] Consumer: `@Transactional` + `@RabbitListener`; envelope parse; guard eventType; `tryConsume("elig:" + eventId)`; với MỖI item: parse UUID productId/userId (fail → WARN + ack toàn message — poison-safe); `INSERT review_eligibility ON CONFLICT DO NOTHING` native (dedupe DB); ack bình thường
- [ ] Lỗi DB tạm thời → rethrow (requeue, at-least-once + marker chịu)
- [ ] Verify: build xanh; IT thuộc Task 7
- [ ] Commit: `feat(catalog): consumer order.confirmed → review_eligibility (idempotent elig: prefix, poison-safe)`

### Task 6: wishlist-apis-peruser

**Files:** Create `wishlist/WishlistService.java`, `wishlist/web/WishlistController.java`

- [ ] `GET /api/catalog/me/wishlist?page&size&locale`: join wishlist_items→products (PUBLISHED, chưa soft-delete, mới nhất trước) → `ProductCardPage` — **reuse mapping/resolve locale của SF-4** (gọi qua `CatalogQueryService`/mapper có sẵn hoặc extract helper additive nếu mapper private — ưu tiên reuse, không copy logic resolve)
- [ ] `GET /api/catalog/me/wishlist/ids` → `WishlistIds {productIds[]}`
- [ ] `PUT /api/catalog/me/wishlist/{productId}`: product PUBLISHED tồn tại else 404; idempotent 204 (ON CONFLICT DO NOTHING / exists-check)
- [ ] `DELETE /api/catalog/me/wishlist/{productId}`: **204 LUÔN** (không có row / product hard-delete vẫn 204)
- [ ] Verify: build xanh; IT thuộc Task 8
- [ ] Commit: `feat(catalog): wishlist APIs — page enrich + ids + put/delete idempotent`

### Task 7: synthetic-event-harness + verified IT

**Files:** Create `reviews/seedtool/ReviewSeedTool.java`, `src/test/java/.../reviews/VerifiedPurchaseITTest.java` (RabbitMQ container)

- [ ] `ReviewSeedTool` `ApplicationRunner`: gated `spring.profiles.active` chứa `test` + `catalog.review-seed.enabled=true`; props `catalog.review-seed.user-id`, `catalog.review-seed.product-id` (comma-list), `catalog.review-seed.order-id` (default random UUID); publish 1 envelope `order.confirmed` (items = mỗi product qty 1, variantId = productId, price 0, name rỗng-an toàn schema) qua `AmqpTemplate.convertAndSend("ecommerce.events", "order.confirmed", json)` — envelope khít schema SF-2 (eventId UUID, occurredAt, correlationId, producer, schemaVersion 1)
- [ ] IT: RabbitMQContainer (pattern CacheInvalidateTest — waiting log startup, @DynamicPropertySource host/port/credentials, listener auto-startup + explicit container start); publish envelope trực tiếp qua AmqpTemplate → await eligibility row (user A + product X); submit review A → verifiedPurchase=true, user B → false; publish TRÙNG eventId lần 2 → vẫn 1 row (marker + ON CONFLICT)
- [ ] Verify: `mvn -pl services/catalog-service -am verify` — IT này Tests run > 0 (failsafe report)
- [ ] Commit: `feat(catalog): ReviewSeedTool synthetic order.confirmed (profile test) + verified-purchase IT`

### Task 8: reviews-wishlist-it-tests (còn lại)

**Files:** Create `src/test/java/.../reviews/{ReviewApiTest,ModerationAggregateTest,MeReviewsTest}.java`, `src/test/java/.../wishlist/WishlistApiTest.java`

- [ ] ReviewApiTest: 401 không token; 202 có token (no body); PENDING không hiện public; rating 0/6 → 400; content blank → 400; draft product → 404; slug lạ → 404; submit trùng (user, product) → 409 (cả đường service-check lẫn race-UNIQUE khó tái → 1 case đủ)
- [ ] ModerationAggregateTest: admin list default PENDING + filter status; approve → public thấy + aggregate {5,4,4}→4.3/3; reject → không hiện + aggregate giữ; approve review đã APPROVED → 409; reject PENDING khác → aggregate không đổi; outbox row `review.moderated` payload khít schema (status APPROVED + REJECTED 2 case); non-admin token → 403
- [ ] MeReviewsTest: GET chỉ của mình (user khác không thấy); filter productId; PUT PENDING ok (đổi rating/content); PUT sau APPROVED → 409; DELETE PENDING → 204 + biến mất khỏi me/list; DELETE của user khác → 404; DELETE sau APPROVED → 409
- [ ] WishlistApiTest: PUT → 204 + ids chứa; PUT trùng → vẫn 204 + 1 row; GET page enrich (name/price/ rating + locale vi/en resolve + chỉ PUBLISHED); DELETE → hết + DELETE lần 2 → 204; PUT product lạ → 404; PUT draft → 404; 401 không token cả 4 endpoint
- [ ] Verify: failsafe `Tests run: > 0` toàn suite; toàn bộ xanh
- [ ] Commit: `test(catalog): reviews/wishlist IT suite — submit/moderation/me/wishlist acceptance`

### Task 9: pdp-nextjs-reviews-section-verified-badge + write modal

**Files:** Create `frontend/apps/storefront-web/lib/reviews-api.ts`, `lib/account-session.ts`, `components/reviews/ProductReviewsSection.tsx`, `components/reviews/WriteReviewModal.tsx`, `components/reviews/ReviewBadge.tsx`, `components/reviews/MyPendingReviewPanel.tsx`; Modify `app/[locale]/p/[slug]/page.tsx` (2 điểm: import + render section vào `#tab-reviews`; searchParams reviewPage truyền xuống), `next.config.mjs` (transpilePackages append `@ecommerce/auth`), `package.json` (dep `@ecommerce/auth: workspace:*`) + **commit pnpm-lock.yaml regen cùng commit (lockfile churn — merge hazard SF-4)**

- [ ] `lib/account-session.ts` (client): `ensureSession()` single-flight configureAuth + `authStore.refresh()`; `authedFetch` wrapper qua `authStore.fetch`; export `getAuthUser()`
- [ ] `lib/reviews-api.ts`: server fetch `listProductReviews(slug, page)` GATEWAY_URL no-store (bọc CatalogUnavailableError-style); client helpers `submitReview/buildReviewPayload` (POST relative /api, 202 → toast text; 409 → message "bạn đã đánh giá sản phẩm này")
- [ ] `ProductReviewsSection` (server): tổng điểm + sao + breakdown bars (width % theo count/max) + list review (tên, ngày vi-VN, sao, badge "Mua đã xác nhận" khi verifiedPurchase — `ReviewBadge`), pagination links `?reviewPage=N` (prev/next theo total/size 5); empty state "Chưa có đánh giá"; error → degraded text
- [ ] `WriteReviewModal` (client): nút "Viết đánh giá" mở modal (overlay, ESC đóng); StarRating interactive + title + content; guest (ensureSession fail) → CTA link `/account` "Đăng nhập để đánh giá"; submit → 202 → toast "Đã gửi đánh giá — đang chờ duyệt" + đóng modal + refresh section (router.refresh()); 409 → hiện message
- [ ] `MyPendingReviewPanel` (client): ensureSession → GET `/api/catalog/me/reviews?productId=` → có PENDING → hiện card review của mình + nút Sửa (mở modal edit mode PUT) + Xóa (DELETE → refresh); 404/empty → không render
- [ ] PDP page chèn: `<ProductReviewsSection slug product-id locale review-page>` trong `#tab-reviews` (thay text "Sắp ra mắt") — edit tối thiểu. *(Lưu ý run audit: T9 và T10 CÙNG sửa page.tsx — executor inline tuần tự theo DAG nên an toàn; nếu bao giờ bật parallel dispatch phải serialize 2 task này.)*
- [ ] CSS theo tokens ui-kit (không hex cứng), pattern class `pdp-*`/`p-*` sẵn có (file css của app — append block reviews/wishlist mới, không sửa rule cũ)
- [ ] Verify: `pnpm -C frontend --filter storefront-web build` xanh + section render trên PDP qua dev-server DOM check nhanh (vitest đầy đủ thuộc Task 12)
- [ ] Commit: `feat(storefront): PDP reviews section SSR + write modal + verified badge + my-pending manage`

### Task 10: wishlist-heart-next-pdp-plp

**Files:** Create `components/wishlist/WishlistHeart.tsx`, `components/wishlist/wishlist-api.ts` (file RIÊNG của slice wishlist — không phụ thuộc lib của T9, plan-critic P1); Modify `app/[locale]/p/[slug]/page.tsx` (chèn heart), `components/ProductCardView.tsx` (overlay heart — edit tối thiểu)

- [ ] `WishlistHeart` (client): props `productId`, `variant` ("card" absolute góc phải `.p-thumb` | "pdp" inline); mount → `ensureSession()` ok → GET `/api/catalog/me/wishlist/ids` (module-level cache 1 lần/page + Set chia sẻ) → filled/outline; click: `preventDefault` + `stopPropagation` (card là `<a>`); authenticated → optimistic toggle PUT/DELETE → lỗi revert; guest → điều hướng `/account`; aria-label vi/en
- [ ] PDP chèn heart cạnh meta (inline variant); ProductCardView chèn `<WishlistHeart variant="card" productId>` vào `.p-thumb` — 2 dòng import + 1 element, KHÔNG đổi gì khác
- [ ] Verify: build xanh; PLP/home/PDP đều render heart (không crash server component)
- [ ] Commit: `feat(storefront): wishlist heart client PDP + ProductCard overlay (guest → /account)`

### Task 11: wishlist-page-mfe-account-slice + my-reviews + shell routes

**Files:** Create `frontend/apps/mfe-account/src/pages/wishlist/WishlistPage.tsx`, `src/pages/my-reviews/MyReviewsPage.tsx`; Modify `frontend/apps/mfe-account/vite.config.ts` (exposes append `./WishlistPage`, `./MyReviewsPage`), `frontend/apps/shell/src/App.tsx` (2 lazy import + 2 branch `/account/wishlist` `/account/reviews`), `frontend/apps/shell/src/remotes.d.ts` (2 declares)

- [ ] WishlistPage: guard `authReady` → guest `appNavigate('/login')`; fetch `/api/catalog/me/wishlist?size=100` (fetch self-contained, credentials same-origin + Bearer từ authStore — page dùng `@ecommerce/auth` trực tiếp); grid card local (ảnh gradient fallback + tên + giá VND + sao + link `/p/{slug}` mở tab storefront) + nút "Xóa" → DELETE → refetch; empty state "Chưa có sản phẩm yêu thích"; lỗi → banner
- [ ] MyReviewsPage: guard authReady; fetch `/api/catalog/me/reviews` → list: tên product + Badge status (PENDING vàng/APPROVED xanh/REJECTED đỏ) + sao + title/content + ngày; empty state "Bạn chưa viết đánh giá nào"; lỗi → banner
- [ ] vite exposes append (build MF được); shell App.tsx: 2 branch exact + `AccountErrorFallback` + Suspense — KHÔNG đụng branch khác; remotes.d.ts declares
- [ ] Verify: `pnpm -C frontend --filter @ecommerce/mfe-account build` + `--filter shell build` xanh (typecheck qua build)
- [ ] Commit: `feat(account): wishlist + my-reviews pages (mfe-account slice) + shell routes append`

### Task 12: fe-tests + wiring + acceptance sweep chuẩn bị

**Files:** Create `frontend/apps/storefront-web/tests/reviews.test.ts`, `tests/wishlist.test.ts`; Modify `frontend/apps/storefront-web/vitest` config nếu cần (không đụng SF-4 tests)

- [ ] vitest: `buildReviewPayload` (omit title khi rỗng; rating number), breakdown width % helper (max-normalize + fill zeros "5".."1"), heart `applyToggle(ids, productId, next)` pure reducer, badge text map vi/en
- [ ] `pnpm -C frontend --filter storefront-web test` xanh (KHÔNG vỡ test SF-4 cũ); builds 3 app xanh (storefront-web/mfe-account/shell)
- [ ] Wiring: heart ids cache dùng chung giữa PDP + PLP (1 fetch); modal không crash khi refresh cookie hết hạn (ensureSession fail → guest UI, không throw unhandled)
- [ ] Commit: `test(storefront): reviews/wishlist FE helpers vitest`

---

## Verification cuối (Phase 5 — KHÔNG phải task của executor)

1. **Backend:** `mvn -pl services/catalog-service -am verify` toàn xanh, failsafe Tests run > 0 (IT thật, không skip).
2. **FE:** vitest xanh + build 3 app xanh.
3. **ACCEPTANCE từng dòng (Rule 0 browser 3 tầng — DOM đo → Orca browser screenshot → flow trọn):**
   - User đăng nhập viết review trên PDP → toast "đang chờ duyệt"; review KHÔNG hiện công khai.
   - Approve qua API (curl mint-admin-token) → review hiện PDP; rating sao ProductCard (PLP/home) cập nhật theo con số pin (aggregate {5,4,4} → 4.3/3).
   - Sau synthetic `order.confirmed` (ReviewSeedTool user A + product X): review A có badge "Mua đã xác nhận"; review B không.
   - Heart PDP/PLP → `/account/wishlist` đúng; bỏ heart → mất; guest click heart/viết review → `/account` (login).
   - `/account/reviews` hiện review của mình với đúng badge trạng thái.
4. **Code-reviewer độc lập** trên diff (nhóm backend + nhóm FE) — APPROVED mới merge.
5. **Merge** vào `story/fi310-ecommerce-platform` (ancestor guards, snapshot giữa chừng OK) + audit comment merge-hash.
6. **`~/.claude/bin/story-verify sf-8-reviews-wishlist`** sạch → set FI-318 Done (không commit sau đó).
