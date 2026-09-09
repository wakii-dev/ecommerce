# ADR 0007 — data-testid convention: semantic classname là contract chính, testid là lối thoát cuối

Date: 2026-09-09 · Status: Accepted · Decides FI-391 (SF-1 design foundation / elevation)

## Context

E2e suite hiện neo vào ~30 classname selector (`.product-card`, `.add-to-cart-btn`, …) rải khắp
storefront/checkout/admin. UI/UX Elevation v2 (story FI-390) sắp rebuild markup của các primitive
ui-kit (Pagination, Breadcrumbs, QuantityStepper, Stepper, Alert…) — đổi class name là hiển nhiên
khi elevation, và mỗi lần đổi là một lô e2e vỡ đỏ dù hành vi không đổi.

Cần một convention rõ TRƯỚC khi elevation chạy, để không có chuyện "đổi class → sửa e2e → đổi
class nữa → sửa e2e nữa" lặp vô tận.

## Decision

1. **Semantic classname giữ là contract chính.** Component vẫn expose class name có ý nghĩa
   (BEM-ish, ổn định theo surface) — e2e ưu tiên neo vào class này. Elevation phải GIỮ nguyên
   contract classname của các element đã có e2e bám vào; đổi style/markup bên trong tự do.
2. **`data-testid="<surface>-<element>"` chỉ khi rename bất khả kháng** — tức elevation buộc
   phải đổi/vỡ contract classname của element đó → thêm testid vào element MỚI với tên giữ
   nguyên nghĩa, và e2e fallback sang testid.
3. **Testid theo SURFACE, không theo component.** Prefix là surface dùng nó, không phải tên
   primitive — ví dụ pagination dưới PLP là `data-testid="plp-pagination-next"`, KHÔNG phải
   `pagination-next` chung chung (vì cùng một Pagination primitive phục vụ nhiều surface với
   ngữ cảnh e2e khác nhau). Quy tắc đặt tên: `<tên-surface>-<tên-element>`, kebab-case.

## Consequences

- SF-2..SF-5 (elevation từng surface): khi elevation đổi markup làm vỡ classname có e2e bám →
  bắt buộc thêm `data-testid` theo quy tắc surface-prefix ở bước đó, trong cùng task — không
  để nợ "sửa e2e sau".
- SF-6 (e2e hardening): quét toàn bộ e2e selector vỡ, fix bằng testid fallback theo convention
  này; ưu tiên port classname contract sang testid cho những element elevation chạm tới.
- Không thêm testid đại trà "cho chắc" — testid chỉ xuất hiện khi có rename thật, tránh noise
  trong markup và tránh hai nguồn sự thật lệch nhau.

## Refs

- Story FI-390 · SF-1 design foundation (FI-391)
- Plan: `docs/superpowers/plans/2026-09-09-sf-1-design-foundation-plan.md` Task 5
