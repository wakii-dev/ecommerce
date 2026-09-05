# SF-6 Context Pack — cart + checkout UX

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).
> **GATE QUAN TRỌNG**: SF-6 chạy trên **ORDERING CONTRACT STUBS** (ordering-service là SF-9, chưa tồn tại). Checkout/coupon/POST /orders dùng mock adapter toggle bằng env `VITE_ORDERING_STUB=1` (mặc định ON). Payment-service (SF-5) là THẬT — Stripe.js confirm chạy thật. Live wiring ở SF-10.

## Spec slice (chỉ phần SF-6 chịu trách nhiệm)

1. **cart-service** (port 8083, Redis qua spring-data-redis): guest cart key theo `cart_token` (uuid, cookie httpOnly do gateway/cart set — theo cart.yaml), user cart key theo JWT `sub`. APIs: `GET /api/cart` (auto-create), `POST /api/cart/items` `{product_id, variant_id, qty}`, `PATCH /api/cart/items/{id}` (qty), `DELETE item`, `DELETE /api/cart`, `POST /api/cart/merge` (JWT + cart_token → gộp qty cùng product+variant).
2. **Enrichment**: response cart enrich từng item gọi catalog (GET product): name/image/price hiện tại; product 404/unpublished → item giữ với `unavailable: true` (§6.1 — cart KHÔNG tự xóa). **Giá hiển thị trong cart là duyệt** — authority là re-price của ordering lúc POST /orders (SF-9).
3. **`frontend/apps/mfe-checkout`** (remote mới): routes `/cart`, `/checkout`, `/order/confirmation`.
   - **Cart page**: line items (ảnh, tên, giá, qty stepper, remove), badge "Không còn khả dụng" cho unavailable, summary subtotal (giá server), CTA "Thanh toán".
   - **Checkout steps** (stepper theo direction): 1) Địa chỉ (form: tên, SĐT, địa chỉ — lưu state); 2) Vận chuyển (flat-fee 25.000₫ từ env `SHIPPING_FLAT_FEE`); 3) Thanh toán + review: coupon box (input mã → `POST /api/ordering/orders/validate-coupon` QUA STUB mock adapter khi stub ON), tóm tắt đơn (subtotal, discount, shipping, total), **Stripe PaymentElement + `confirmCardPayment`** khi có `clientSecret`.
   - **Stub flow (VITE_ORDERING_STUB=1)**: submit order → mock adapter trả order shape theo ordering.yaml NHƯNG `clientSecret` lấy THẬT bằng cách gọi `POST /api/payment/intents` (SF-5 live) với tổng tiền → Stripe.js confirm THẬT với test card → xong tạo confirmation. Kết quả: thanh toán thật, đơn mock — demo đẹp nhất có thể ở tier này.
   - **Confirmation page**: cảm ơn + order summary + trạng thái (mock: "Đang xử lý").
   - Stub adapter tách file riêng (`lib/orderingStub.ts`), tập trung 1 chỗ để SF-10 thay dễ.
4. **Shell**: cart badge qua **HeaderSlots** (component expose từ mfe-checkout `exposes: './CartBadge'`, shell eager import + mount slot 'right'; số lượng từ `GET /api/cart` + update qua event bus nhẹ — agent quyết pattern, ghi trong code). Routes `/cart|/checkout` append manifest.
5. **IT**: cart CRUD Redis, merge logic, unavailable enrichment (WireMock catalog), coupon validate stub contract shape.

## Touch map (files SF-6 tạo/sở hữu)

```
backend/services/cart-service/**
frontend/apps/mfe-checkout/** (gồm CartBadge expose + orderingStub)
frontend/apps/shell: manifest routes + eager import CartBadge (append 1 block)
docker-compose.yml/Makefile (append cart-service)
backend/gateway: routes/cart.yml (append) + cart_token cookie nếu gateway-level (theo cart.yaml)
```
READ-ONLY: `contracts/**`, catalog/identity/payment services (gọi API), packages/**.

## Dep states

- SF-3 merged: auth live (merge-on-login cần JWT), packages/auth.
- SF-4 merged: catalog live (giá + product info cho enrichment), storefront có PDP nút add-to-cart STUB → giờ gọi vào cart THẬT (SF-6 có thể sửa 1 dòng storefront PDP để wire nút — hợp lệ, storefront thuộc SF-4 đã merge; thay đổi nhỏ + ghi commit).
- SF-5 merged: payment REST live (intents thật).
- SF-7/8/9 CÙNG T3 SONG SONG — KHÔNG phụ thuộc; ordering CHƯA có (stub).
- Stripe test key từ `.env` (user đặt khi chạy); không key → stub flow hiển thị mock pay panel (fallback rõ ràng).

## ACCEPTANCE (user-visible — chạy với ordering stub)

- Guest thêm 2 sản phẩm (từ PDP/PLP thật) → cart badge = 2; reload vẫn còn (cookie).
- Đăng nhập với items trong guest cart → merge đúng (qty gộp, không mất item).
- Đổi qty/remove cập nhật tổng; product bị unpublish → item hiện "Không còn khả dụng", không chặn checkout phần còn lại.
- Checkout đi hết 3 bước; coupon box nhận mã shape đúng (WELCOME10 mock → -10% hiển thị); tổng tính đúng.
- Có Stripe test key: confirm bằng card 4242 → thanh toán THẬT thành công → trang confirmation hiện. Card 4000...0002 → lỗi trả về UI rõ ràng (đơn vẫn mock — saga thật là SF-9).
- Không key → nút pay hiển thị mock panel + cảnh báo "chưa cấu hình payment".

## Boundary (KHÔNG làm)

- KHÔNG viết ordering-service / coupon engine / saga (SF-9).
- KHÔNG tắt stub default trong commit (SF-10 mới wire thật) — toggle chỉ để test local.
- KHÔNG my-orders (SF-9) — confirmation page là trang đứng riêng.
- KHÔNG sửa contracts; KHÔNG sửa file Header shell (slot + manifest only).
