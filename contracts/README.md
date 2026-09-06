# contracts/ — SOURCE OF TRUTH

API + event contracts của toàn platform. **SF-2 (FI-312) freeze nội dung** —
thư mục này ở SF-1 chỉ là skeleton (cấu trúc + lint config + quy tắc).

## Cấu trúc

```
contracts/
├── openapi/    # 7 OpenAPI 3.1 specs: identity, catalog, cart, ordering,
│               #   payment, inventory, notification (SF-2 tạo)
├── events/     # JSON Schema: envelope + payloads, additive-only (SF-2 tạo)
├── .spectral.yaml
└── README.md
```

## Quy tắc freeze (sau SF-2)

1. **Freeze = source of truth.** Services + FE codegen THEO specs; KHÔNG sửa spec
   để "khớp code đang có". Phát hiện freeze hỏng → flag coordinator amendment task,
   không tự sửa (shared-file ownership §6e).
2. **Additive-only**: thêm field/endpoint MỚI được (optional), đổi/xóa cái cũ =
   breaking — cấm. Event payload chỉ thêm field optional.
3. **Events naming**: `<domain>.<event>` — routing key trên exchange topic
   `ecommerce.events` (vd `order.confirmed`, `product.changed`). Domain trùng tên
   service sở hữu event đó.
4. **Fat payload cho consumer chain** (spec §6.1): event phải đủ dữ liệu cho mọi
   consumer — cấm consumer call-back HTTP để lấy fields thiếu.
5. **Correlation**: mọi event mang `correlationId` từ `X-Request-Id` của gateway.

## Lint

```bash
# OpenAPI specs (SF-2+ sau khi có yaml):
pnpm dlx @stoplight/spectral-cli lint contracts/openapi/*.yaml
```
