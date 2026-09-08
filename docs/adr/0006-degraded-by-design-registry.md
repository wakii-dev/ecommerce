# ADR 0006 — Degraded-by-design registry: phân loại fallback trung thực vs fallback-nói-dối

Date: 2026-09-08 · Status: Accepted · Decides FI-369 (SF-3 honesty-pass / FI-372)

## Context

Yêu cầu nguyên văn của user: *"không được fallback bất cứ điều gì"* + *"tất cả button/link phải
hoạt động tốt, có ý nghĩa"*. Phase 7 (FI-369) quét toàn bộ FE và phân loại mọi hành vi
"degraded" bằng **3-question test (N2)** — quyết định epic-spec §2:

1. **Có nói dối user không?** (giả vờ thành công / giả vờ tính năng chưa có là "coming soon")
2. **Có thay đường thật bằng đường giả vĩnh viễn không?** (mock/stub đứng tên API thật, dead link)
3. **Có fail-safe quan sát được khi infra chết không?** (user thấy lỗi thật, hệ thống không crash)

→ (1) hoặc (2) = **xoá/sửa**; (3) = **GIỮ**, đăng ký ở đây để lần sau không ai "sửa tỉa" thành
fake-fail hoặc xoá nhầm cơ chế sống còn.

SF-3 đã xoá toàn bộ fallback-nói-dối: footer `href="#"` (trim về routes thật — N5), toast
"Cart is coming soon" (AddToCart → lỗi thật), dead i18n `reviewsSoon`, `createStubApi` + 470
dòng seed mock, rename `Stub*` types → `Admin*` (dữ liệu LIVE từ SF-10 — tên cũ nói dối nguồn),
`/ui-kit` demo gate `VITE_UIKIT_DEV=1`.

## Decision — Registry degraded-by-design (GIỮ)

| # | Hành vi | Vị trí | Vì sao trung thực (test N2) | Nhãn UI |
|---|---------|--------|------------------------------|---------|
| D15-1 | **ES → PgFts search fallback**: Elasticsearch chết → catalog tự hạ xuống Postgres full-text search, kết quả ít hơn (không MLT/fuzzy) nhưng là kết quả THẬT | catalog-service (backend, GIỮ nguyên — SF-3 không đụng backend) | (1) Không nói dối — trả kết quả thật; (2) không thay đường thật bằng đường giả — ES là nângSvc, PgFts vẫn là search thật; (3) ES chết → search vẫn dùng được, quan sát được qua chất lượng kết quả | Không cần nhãn riêng — trang search hoạt động bình thường |
| D15-2 | **Payment 503 fail-loud**: payment-service chết/không-keys → checkout hiện `payUnavailable` (503 surface), KHÔNG fake confirm, KHÔNG tạo đơn ảo | mfe-checkout `CheckoutPage` + payment-service | (1) Không nói dối — user thấy đúng lỗi; (2) không có đường giả nào bị thay; (3) fail QUAN SÁT ĐƯỢC đúng thiết kế (SF-1 regression đã assert) | Thông báo lỗi thật trên UI checkout |
| D15-3 | **GHN flat-fee**: chưa tích hợp GHN merchant thật (out-of-scope — business decision) → phí vận chuyển = phí phẳng cấu hình | `CheckoutPage` summary + `ConfirmationPage` summary | (1) KHÔNG nói dối NHỜ nhãn: phí hiển thị kèm nhãn "phí tiêu chuẩn" — không giả vờ là báo giá GHN thời gian thực; (2) đường thật (thanh toán phí phẳng) không bị thay bằng giả; (3) GHN chết không ảnh hưởng — không có đường GHN giả nào | **"Phí vận chuyển (phí tiêu chuẩn)"** — SF-3 đã thêm nhãn |
| D15-4 | **Catalog down → EmptyState degraded**: home/PDP SSR fetch fail → hero tĩnh + EmptyState "tạm thời không khả dụng", KHÔNG crash RSC, KHÔNG render content giả | storefront-web `app/[locale]/page.tsx`, `p/[slug]/page.tsx` | (1) Không nói dối — thông báo đúng sự thật; (2) không thay bằng data giả; (3) lỗi quan sát được, retry được | EmptyState icon 🛠️ + mô tả thử lại |
| D15-5 | **PDP related ẩn khi fail**: `/related` (ES MLT) fail/rỗng → ẩn section, không vỡ PDP | storefront-web `p/[slug]/page.tsx` | (1) ẩn ≠ nói dối (không hiện sản phẩm giả); (2) không có đường giả; (3) fail im lặng ở mức SECTION (không phải page) — chấp nhận được vì section là best-effort | Không có section = không hứa gì |

## Whitelist — kết quả grep sweep cuối (SF-3 T10, chạy 2026-09-08)

Sweep scope: source `storefront-web`, `mfe-admin/src`, `shell/src`, `mfe-checkout` — 7 patterns:
`href="#"` (2 biến thể quote), `Sắp ra mắt`, `coming soon`/`Coming Soon`, `createStubApi`,
`Stub[A-Z]` → **0 file match** (sweep bằng `find … | xargs grep`, không dùng BSD-grep multi
`--include` — đã bắt được false-negative khi thử phương pháp đó).

Match sống NGOÀI scope source, đăng ký để sweep sau không phải hỏi lại:

| Match | Vị trí | Lý do KHÔNG phải fallback-nói-dối (N2) |
|-------|--------|----------------------------------------|
| `placeholder=` (attr) | NewsletterForm, SearchBar, CheckoutPage, LoyaltyPage, AuditPage | Attribute HTML hint của input — mô tả input đang có, không hứa tính năng tương lai |
| `apps/_skeleton-remote` | infra module-federation demo (shell `remotes.d.ts` tham chiếu) | App hạ tầng demo remote loading — không phải surface user, không render content giả |
| shell `/ui-kit` (UiKitDemoPage) | `shell/src/pages/UiKitDemoPage.tsx` | Design-system demo — ĐÃ env-gate `VITE_UIKIT_DEV=1` (T8), unset prod = route rơi Home; file demo 0 match banned patterns |
| mock trong unit tests | `mfe-admin/tests/*`, `storefront-web/tests/*` | Mock/vi.fn là dụng cụ test — test giả lập dependency, không phải runtime fallback cho user |
| `E7d`/SF-x nhãn lịch sử trong comments | các file FE | Comments mô tả quyết định hiện tại; đã reword bỏ literal pattern (sweep-pass) |

## Consequences

- Mọi fallback MỚI muốn thêm vào FE phải đăng ký ở đây kèm 3-question test — không đăng ký =
  không merge (code-reviewer check ADR này).
- `VITE_UIKIT_DEV` là biến env dev-only duy nhất của shell; unset ở mọi môi trường dùng thật.
- Registry này thay cho mental-model "fallback xấu" — fallback trung thực (fail-safe quan sát
  được) là thiết kế, không là nợ.
