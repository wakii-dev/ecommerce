# SF-7 Context Pack — admin MFE

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-ecommerce-platform-design.md` · Bracket: `docs/superpowers/brackets/fi310-ecommerce-platform.md` · Linear epic: FI-310 · Nhánh đích: `story/fi310-ecommerce-platform`
> `contracts/` + `frontend/packages/contracts/` READ-ONLY — code theo contract đã freeze (SF-2).
> **GATE QUAN TRỘNG**: products/categories CRUD + low-stock là LIVE (catalog/inventory có từ T2). coupons CRUD + reviews moderation + orders + revenue stats là **MOCK theo contract** (adapter toggle `VITE_ADMIN_STUB=1` mặc định ON — ordering là SF-9, moderation service là SF-8, cùng T3 chưa chắc merge). Live wiring ở SF-10.

## Spec slice (chỉ phần SF-7 chịu trách nhiệm)

1. **`frontend/apps/mfe-admin`** (remote mới): route gốc `/admin` + con routes (`/admin`, `/admin/products`, `/admin/categories`, `/admin/coupons`, `/admin/reviews`, `/admin/orders`, `/admin/dashboard`).
2. **Layout + theme**: sidebar nav (Dashboard, Products, Categories, Coupons, Reviews, Orders) + topbar (user info + logout) — `data-theme="admin"` của ui-kit, theo design direction. Responsive tối thiểu 1280px (admin desktop-first).
3. **RBAC guard UI**: mỗi route check `hasRole('admin')` (packages/auth) → guest redirect `/login?next=`, customer → trang 403 "Không có quyền". (Server-side vẫn là gateway/identity — guard UI chỉ UX.)
4. **Products (LIVE — catalog admin APIs)**: list table (search tên, filter category/status, paginate, badge trạng thái), form create/edit (tabs: Thông tin — tên/slug/description/brand/category/official; Giá — price, compare_price, flash_sale_ends_at (datetime picker); Variants — rows size/color/price; Ảnh — URL list + preview + sort; publish/draft toggle), deactivate. Tạo xong → toast + link xem trên storefront.
5. **Categories CRUD (LIVE)**: tree view, create/edit (parent select), delete với check ràng buộc (có product → chặn mềm + message).
6. **Coupons CRUD (MOCK theo ordering.yaml)**: table (code, type percent/fixed, value, window, usage_limit/used, active toggle), form create/edit.
7. **Reviews moderation queue (MOCK theo catalog.yaml admin endpoints)**: list PENDING (product, user, rating, nội dung), actions Approve/Reject (gọi shape `POST /admin/reviews/{id}/approve|reject` qua mock).
8. **Orders (MOCK theo ordering.yaml admin)**: list (filter status/date, paginate), detail (items, địa chỉ, tổng, timeline), actions theo state machine §3.6: **ship/deliver/cancel — KHÔNG có nút confirm**.
9. **Dashboard**: KPI tiles (doanh thu hôm nay/tuần, số đơn, AOV) từ ordering stats (mock); **low-stock table LIVE** từ `GET /api/inventory/admin/low-stock` (SF-5); charts: revenue-by-day line + top-products bar (recharts — check pre-pin; nếu thiếu → thêm vào mfe-admin local deps, tránh đụng lockfile chung nếu có thể) màu theo ui-kit tokens, i18n labels.
10. **IT**: guards (guest/customer/admin), products CRUD flow LIVE (Testcontainers hoặc chạy catalog thật theo harness SF-4), mock pages render + actions shape đúng.

## Touch map (files SF-7 tạo/sở hữu)

```
frontend/apps/mfe-admin/** (gồm mock adapters lib/adminStub.ts)
frontend/apps/shell: manifest route /admin (append 1 block)
```
READ-ONLY: toàn bộ backend (CHỈ gọi API — KHÔNG viết service mới), `contracts/**`, `packages/**`, các mfe khác.

## Dep states

- SF-3 merged: auth + seed admin + identity admin/users API.
- SF-4 merged: catalog admin APIs live (products/categories).
- SF-5 merged: low-stock live.
- SF-8 (moderation service) + SF-9 (ordering) CÙNG T3 SONG SONG → mock. Mock data deterministic để test ổn định (3-5 rows mỗi loại).

## ACCEPTANCE (user-visible)

- `/admin` khi guest → redirect login; đăng nhập customer → trang 403.
- Admin tạo product (publish) → mở storefront (SF-4) thấy product mới trong ~60s; sửa giá → PDP cập nhật.
- Categories: tạo con/đổi parent không vỡ tree; xóa có sản phẩm → bị chặn với message.
- Coupons/Reviews/Orders pages render data mock, actions hiển thị đúng shape (approve/ship/cancel) — không đòi backend thật.
- Dashboard: low-stock HIỆN THẬT từ inventory; charts vẽ với mock revenue; KPI tiles định dạng VND đúng.

## Boundary (KHÔNG làm)

- KHÔNG viết backend nào (mock adapters only).
- KHÔNG wire thật moderation/orders/coupons (SF-10).
- KHÔNG users page nếu SF quá tải (backlog; dashboard charts first-cut nếu overload — spec P2).
- KHÔNG sửa contracts; KHÔNG sửa shell ngoài manifest block.
