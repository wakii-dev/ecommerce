# ADR 0004 — Service boundaries: reviews/wishlist trong catalog, coupons trong ordering

Date: 2026-09-07 · Status: Accepted · Deciders: epic FI-310 (D9 + extract path)

## Context
Chọn số service + ranh giới cho v1: quá nhiều service = over-engineering demo;
quá ít = mất ý nghĩa microservices. Các chức năng "kề nhau" cần quyết + extract
path rõ ràng.

## Decision
1. **Reviews + wishlist + rating_avg nằm trong catalog-service** (không service
   riêng): cùng read-model sản phẩm, cùng DB db_catalog, dùng chung cache
   invalidation + ES indexer (`product.changed`). Verified-purchase đến QUA
   event `order.confirmed` → bảng `review_eligibility` — KHÔNG call ordering.
2. **Coupons nằm trong ordering-service**: reserve usage phải cùng transaction
   logic đơn (nguyên tử với reserve inventory trong saga) — tách ra = phân tán
   transaction quanh chuyện giảm giá.
3. **Extract path**: nếu reviews cần lifecycle riêng (spam ML, hình ảnh, Q&A)
   → tách `review-service` bằng cách move bảng + API giữ nguyên contract
   `catalog.yaml` phần reviews (contract là biên giới, DB là chi tiết).
4. **Các service độc lập còn lại**: identity (auth), inventory (stock +
   reservation TTL), payment (Stripe adapter SPI), cart (Redis thuần, KHÔNG
   DB), notification (email), log (Mongo audit fan-in), ordering (saga + đơn
   + hóa đơn D18), partner-api (Open API D19), affiliate (ref + ledger D20).
5. **Invoice = Python FastAPI stateless renderer (:8090, internal only)** —
   Java ordering giữ numbering/state, Python chỉ render PDF (ReportLab) qua
   `InvoiceProvider` SPI.

## Consequences
- Số service 11 + invoice: đủ demo pattern (sync command, async event, BFF-ish
  gateway, internal renderer) mà vẫn chạy được trên 1 máy dev.
- Rating denormalized trên products — update sync trong transaction review
  approve (catalog nội bộ) — không cần event loop.
- Coupon logic không tái sử dụng cho service khác — nếu cần coupon đa nghiệp
  vụ sẽ phải extract thật (đánh dấu trong spec D22 loyalty — đi qua
  affiliate-service, không phải ordering).

## Alternatives rejected
- **Review-service riêng** — thêm 1 service chỉ cho CRUD + moderation, chi phí
  vận hành > giá trị tách ở v1.
- **Coupon-service riêng** — reserve usage qua network trong saga = lâu hơn +
  khó atomic hơn giữ cùng DB với orders.
