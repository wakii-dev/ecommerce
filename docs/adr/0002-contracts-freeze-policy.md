# ADR 0002 — Contracts freeze policy (OpenAPI + JSON Schema events)

Date: 2026-09-07 · Status: Accepted · Deciders: epic FI-310

## Context
10+ service + 5 FE app phát triển song song (3-4 SF cùng lúc, các executor
khác nhau) — không có contract sống động thì integration chết ởmerge.

## Decision
1. **Freeze tại SF-2** (`contracts/openapi/*.yaml` + `contracts/events/*.schema.json`):
   mọi SF code theo đây; thư mục READ-ONLY tuyệt đối sau freeze.
2. **TS codegen 1 chiều**: `pnpm gen` sinh `packages/contracts/src/generated/*`
   + hand-written client factories (`createServiceClient`). FE KHÔNG tự viết
   type trùng shape (mirror runtime JSON local tối thiểu, ví dụ ordersApi).
3. **Fat-payload events** (`order.confirmed`): payload đủ cho mọi consumer
   (notification/cart/catalog/log/partner/affiliate) — CẤM call-back HTTP lấy
   field thiếu. Payload thiếu field thật sự cần → amendment contracts, không
   bypass (hiện trạng: `order.cancelled`/`review.moderated` không có email →
   notification log SKIPPED, không gửi).
4. **Thay đổi contract = amendment task qua coordinator** (REQUIREMENT-GAP →
   duyệt → sửa yaml → regen → mọi consumer cập nhật), KHÔNG tự sửa.
5. **Mock-gate có chủ đích**: SF trước code theo contract với stub (admin
   orders, checkout ordering), convergence SF-10 wire thật — hợp lý hoá vì
   contract là source of truth chứ không phải mock.

## Consequences
- Merge song song an toàn (append-only blocks trong shared files).
- Phát hiện freeze hỏng phải escalate (đã xảy ra: CATALOG_API_TOKEN interim,
  internal service-token endpoint — vẫn mở REQUIREMENT-GAP FI-310).
- Wehывать lệch runtime/contract phát hiện ở IT (SagaTest assert shape schema).

## Alternatives rejected
- **Contract-first + evolve tự do** — consumer vỡ ngầm khi producer đổi.
- **Code-first + sinh contract sau** — FE phải đợi BE, mất parallelism.
