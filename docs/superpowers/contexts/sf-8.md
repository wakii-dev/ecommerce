# SF-8 Context Pack — reviews + wishlist

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).
> **GATE QUAN TRỌNG**: verified-purchase KHÔNG đòi ordering thật — dùng synthetic event harness (publish `order.confirmed` theo schema SF-2 vào RabbitMQ trong IT + tool seed).

## Spec slice (chỉ phần SF-8 chịu trách nhiệm)

1. **catalog-service MỞ RỘNG** (file-slice: package `reviews/`, `wishlist/` riêng + migration mới `V2__reviews_wishlist.sql` — KHÔNG sửa code SF-4 trừ khi bắt buộc, nếu có → additive + ghi rõ trong commit): `reviews` (id, product_id, user_id, user_name, rating 1-5, title, content, status PENDING|APPROVED|REJECTED, verified boolean default false, created_at), `review_eligibility` (user_id, product_id, order_id — set verified-purchase từ event), `wishlist_items` (user_id, product_id, unique pair), `processed_messages` (đã có conventions common-lib).
2. **Review APIs** (theo catalog.yaml): `POST /api/catalog/reviews` (JWT; product phải published; mọi user đăng nhập ĐƯỢC viết — quyền review theo §6.1.6; nếu user có eligibility với product đó → `verified=true`) → status PENDING; `GET /api/catalog/products/{slug}/reviews` (CHỈ APPROVED, paginate + rating breakdown `{5: n, ..., 1: n}`); `GET /api/catalog/me/reviews` (mọi status); admin: `GET /api/catalog/admin/reviews?status=PENDING`, `POST /api/catalog/admin/reviews/{id}/approve|reject` → transition + outbox `review.moderated` (payload theo schema SF-2).
3. **Rating aggregate**: khi APPROVED/REJECTED → transactional update `products.rating_avg` + `rating_count` (chỉ đếm APPROVED). SF-4 đọc 2 fields này sẵn có.
4. **Verified-purchase consumer**: consume `order.confirmed` (fat payload §6.1: items có product_id + user_id) → insert `review_eligibility` (dedupe). Idempotent.
5. **Synthetic event harness**: IT Testcontainers RabbitMQ publish synthetic `order.confirmed` + 1 CLI/tool `ReviewSeedTool` (profile test) để demo verified flow không cần ordering.
6. **Wishlist APIs**: `GET /api/catalog/me/wishlist` (paginate + product enrich), `PUT /api/catalog/me/wishlist/{productId}` (add), `DELETE ...` (remove), `GET /api/catalog/me/wishlist/ids` (cho heart state).
7. **storefront-web additions (Next — file-slice D16: CHỈ `components/reviews/*` + `components/wishlist/*` + chèn vào PDP/PLP qua chỗ SF-4 định sẵn)**: PDP **reviews section** (server component fetch APPROVED + rating breakdown bars + badge "Mua đã xác nhận" nếu verified + pagination), **write-review modal** (client component: StarRating interactive + title + content; guest → link sang `/account` (shell) đăng nhập; sau submit → toast "đang chờ duyệt"), my-review edit/delete khi PENDING. **Wishlist heart** client component trên PDP + ProductCard: toggle `PUT/DELETE`, guest → link `/account`; state từ `/wishlist/ids`.
8. **mfe-account additions** (file-slice CHỈ `pages/wishlist/*` + `pages/my-reviews/*`): wishlist page (grid ProductCard + remove + link sang PDP), my-reviews page (list review của tôi + trạng thái badge PENDING/APPROVED/REJECTED). Shell manifest append 2 routes `/account/wishlist`, `/account/reviews`.
9. **IT**: submit → PENDING (không hiện public); approve → hiện + aggregate cập nhật đúng; reject → không hiện; verified qua synthetic event (badge true cho đúng user); wishlist CRUD + dedupe.

## Touch map (files SF-8 tạo/sở hữu)

```
backend/services/catalog-service/src/main/java/.../reviews/** · .../wishlist/**
backend/services/catalog-service/src/main/resources/db/migration/V2__* (V1 của SF-4 KHÔNG đụng)
frontend/apps/storefront-web/components/reviews/** · components/wishlist/** (+ chèn section vào PDP/PLP qua chỗ SF-4 định — edit tối thiểu)
frontend/apps/mfe-account/pages/wishlist/** · pages/my-reviews/**
frontend/apps/shell: manifest append 2 routes
```
READ-ONLY: `contracts/**`, services khác, `packages/**`, shell Header file, mfe-account pages khác (SF-3 profile, SF-9 orders).

## Dep states

- SF-3 merged (auth — viết review/heart cần JWT), SF-4 merged (catalog + PDP + ProductCard).
- SF-9 (ordering) KHÔNG cần — synthetic harness. SF-7 (moderation UI) song song — KHÔNG phụ thuộc (SF-7 mock).
- RabbitMQ + compose infra sẵn (SF-1).

## ACCEPTANCE (user-visible)

- User đăng nhập viết review trên PDP → toast "đang chờ duyệt"; review KHÔNG hiện công khai.
- Approve qua API (Swagger/curl) → review hiện trên PDP; rating sao trên ProductCard (PLP/home) cập nhật theo.
- Sau synthetic `order.confirmed` (user A mua product X): review mới của A cho X có badge "Mua đã xác nhận"; user B (không mua) review X KHÔNG có badge.
- Heart trên PDP/PLP → `/account/wishlist` hiện đúng; bỏ heart → mất. Guest click heart/viết review → redirect login.
- `/account/reviews` hiện review của tôi với đúng trạng thái.

## Boundary (KHÔNG làm)

- KHÔNG đụng `mfe-account/pages/orders/**` (SF-9 slice) hay `pages/*` khác của SF-3.
- KHÔNG moderation UI admin (SF-7 mock rồi; live wiring SF-10).
- KHÔNG notification email (SF-10 consume `review.moderated`).
- KHÔNG ordering thật / E2E (SF-10). KHÔNG sửa contracts.
