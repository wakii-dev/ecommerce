# Plan: SF-3 honesty-pass — zero fallback-nói-dối + dead link + degraded registry
Date: 2026-09-08 | Linear: FI-372 | Worktree: sf-3-honesty-pass | Epic: FI-369
Spec: docs/superpowers/specs/2026-09-07-nofallback-feature-complete-design.md (§4 SF-C) · Pack: docs/superpowers/contexts/fi369-sf-3.md

## 0. Baseline probe (verified 2026-09-08, worktree @348b543)

- **Slug `dien-tu` CÓ THẬT** trong seed: `SeedData.java:41` (Điện Tử/Electronics) + 5 root slugs đủ (dien-tu/thoi-trang/nha-cua/sach/lam-dep) → Header mini-nav GIỮ links; footer categories có route thật
- **Sort `newest|rating` là values thật**: `plp-params.ts:10` `PlpSort = 'price_asc'|'price_desc'|'rating'|'newest'|'discount'` → Header GIỮ
- **Header/CategoryTiles/home "Xem thêm" ĐÃ wire từ SF trước** (còn stale comments nói dối "placeholder '#'"): Header:77-79 → `/c/dien-tu?sort=newest|rating` · CategoryTiles:53 → `/search` (route thật) · home:87-94 → `/c/{first}?sort=discount` → T1/T2 = verify + sửa comment, KHÔNG đụng code logic
- **Footer:34 TOÀN BỘ link `href="#"`** (4 cột static strings) → T3 trim thật
- **AddToCart COPY.toastFail** vi:36 "Giỏ hàng sẽ sớm khả dụng" / en:45 "Cart is coming soon" → T4; storefront vitest node env (không jsdom) → unit test COPY map + E2E route.abort assert behavior
- **reviewsSoon :51,:69 dead** (SF-8 thay bằng reviews thật, comment :307 còn nhắc) → T5 xoá + reword comment
- **adminStub.ts 470 dòng**: `createStubApi` chỉ còn tests/stub.test.ts gọi; pages THẬT dùng live API nhưng cast `as Stub*`; `canShip/canDeliver/canCancel` chỉ OrderDetailPage import; `dayKey`/`MOCK_PRODUCT_NAMES` không ai dùng ngoài file → T6 tách + purge, T7 rename
- **CouponsPage không dùng Stub** (SF-2 dùng PublicCoupon generated) ✓; rename set không collision contracts generated (chỉ có AdminCoupon) ✓
- **Shell `/ui-kit` App.tsx:173 không gate**; shell là Vite (`import.meta.env.VITE_*`) — pack ghi `NEXT_PUBLIC_UIKIT_DEV` nhưng Vite không bake prefix đó → dùng **`VITE_UIKIT_DEV=1`** (deviation ghi FI-369); gate off → rơi vào Home (else branch) — không dead content
- **Nhãn "Phí tiêu chuẩn" chưa tồn tại** (CheckoutPage:639 + ConfirmationPage:198 chỉ "Phí vận chuyển") → T9 thêm; không e2e assert chuỗi này ✓
- ADR dir `docs/adr/` (0001-0005, 0005 bị chiếm 2 file — next = **0006**)

## 1. Tasks

### T1 header-mini-nav-probe-slug
- [ ] Probe CHỐT: `dien-tu` ∈ seed (SeedData.java:41), `newest|rating` ∈ PlpSort → links GIỮ nguyên
- [ ] Sửa stale comment Header.tsx:36 ("placeholder '#' tới khi Task 12" — nói dối, code đã wire từ trước)

### T2 categorytiles-home-route-that
- [ ] Verify CategoryTiles:53 `/search` + home:87-94 `/c/{first}?sort=discount` → routes thật, GIỮ
- [ ] Sửa stale comments CategoryTiles.tsx:7-8 + home page.tsx:84-86 (bỏ "placeholder '#'", ghi đúng đích hiện tại)

### T3 footer-trim-routes-that
- [ ] Footer.tsx: COLUMNS → links thật: cột "Danh mục nổi bật" (5 slugs `/c/{slug}` — seed-verified) + cột "Tài khoản" (shell: `/cart`, `/account`, `/account/orders`, `/account/wishlist`, `/account/reviews` qua `shellUrl()`) + NewsletterForm giữ; XOÁ cột care/about/social (không có trang thật — N5)
- [ ] app.css `.site-footer-inner` `repeat(4,1fr)` → `repeat(3,1fr)` (mobile 2 giữ)

### T4 addtocart-toastfail-loi-that
- [ ] COPY.toastFail → vi "Không thêm được vào giỏ — thử lại" / en "Couldn't add to cart — please try again"; export COPY
- [ ] Cập nhật doc-comment component (:16 "toast êm cũ" → lỗi thật)
- [ ] `tests/addtocart.test.ts` mới: COPY 2 locale đúng chuỗi trung thực + mọi COPY value không match /soon|sớm/i

### T5 xoa-dead-i18n-reviewssoon
- [ ] Xoá COPY.reviewsSoon (p/[slug]/page.tsx:51 vi + :69 en)
- [ ] Reword comment :307 (bỏ cụm "Sắp ra mắt" — sweep pattern)

### T6 tach-orderrules-purge-createstubapi
- [ ] `lib/orderRules.ts` mới: canShip/canDeliver/canCancel + CAN_* sets (doc §3.6) — pure
- [ ] OrderDetailPage import re-point → `../lib/orderRules`
- [ ] XOÁ `lib/adminStub.ts` (createStubApi+seed+dayKey+MOCK_PRODUCT_NAMES chết theo) + `tests/stub.test.ts`
- [ ] `tests/orderRules.test.ts` mới: truth-table 3 hàm (ship PAID/CONFIRMED-only, deliver SHIPPED-only, cancel PENDING/PAID/CONFIRMED-only) + invariant không có action confirm
- [ ] `lib/api.ts`: cập nhật comment + re-export 3 helpers (chỗImport §3.6 duy nhất)

### T7 rename-stub-types-5-pages
- [ ] types.ts: XOÁ StubCoupon/StubCouponInput (chỉ adminStub dùng); rename StubReview→AdminReview, StubOrderLine→AdminOrderLine, StubAddress→AdminAddress, StubOrderEvent→AdminOrderEvent, StubOrder→AdminOrder, StubSummary→AdminSummary, StubRevenueDay→AdminRevenueDay, StubTopProduct→AdminTopProduct
- [ ] 4 pages mechanical: OrdersPage, OrderDetailPage, ReviewsPage, DashboardPage (CouponsPage KHÔNG đụng — không dùng Stub)
- [ ] `grep -r "Stub" mfe-admin/src` = 0; typecheck + vitest green

### T8 shell-uikit-env-gate
- [ ] App.tsx:173: `path === '/ui-kit' && import.meta.env.VITE_UIKIT_DEV === '1'` + comment (Vite bake VITE_*; unset = rơi Home)

### T9 degraded-by-design-registry-adr
- [ ] `docs/adr/0006-degraded-by-design-registry.md`: khung 3-question test N2 + registry: ES→PgFts (D15) GIỮ · payment 503 fail-loud GIỮ · GHN flat GIỮ + nhãn UI
- [ ] CheckoutPage:639 + ConfirmationPage:198: "Phí vận chuyển" → "Phí vận chuyển (phí tiêu chuẩn)" — trung thực flat-fee

### T10 grep-sweep-cuoi-whitelist-report
- [ ] Sweep scope `storefront-web` + `mfe-admin` + `shell/src` + `mfe-checkout` (2 dòng nhãn): patterns `href="#"`, `Sắp ra mắt`, `coming soon`, `createStubApi`, `Stub[A-Z]` → zero match sống
- [ ] Whitelist enumerate vào ADR 0006: vi.mock unit tests · `placeholder=` attr · `_skeleton-remote` (infra app) · ui-kit demo (đã env-gate) — từng match kèm lý do

### T11 playwright-nav-asserts-binary
- [ ] `frontend/e2e/tests/nav-honesty.spec.ts`: header 3 links → `/vi/c/dien-tu(+sort)`; tiles → `/c/{slug}`; "Xem thêm" → `/search`; featured "Xem thêm" → `?sort=discount`; footer: zero `href="#"` + click từng link → URL đích; PDP `route.abort` POST `/api/cart/items` → toast lỗi thật
- [ ] Chạy suite với live stack (`make dev`) — nav-honesty + regression specs liên quan green

## 2. Gate checkpoints (Bridge 2)
- G1 sau T7 (mfe-admin refactor complete — typecheck + vitest)
- G2 sau T9 (registry ADR + nhãn — sweep nội bộ sạch)
- G3 sau T11 (final: full FE unit + typecheck + e2e + code-reviewer APPROVED)

## 3. Meta
1. Test commands: `pnpm --filter <pkg> test|lint` (storefront-web, mfe-admin); e2e `cd frontend && pnpm --filter @ecommerce/e2e exec playwright test`
2. Boundary: KHÔNG backend, KHÔNG packages/{auth,contracts}, KHÔNG e2e helpers env.ts (SF-1), KHÔNG tạo trang content mới
3. Scope sweep ĐÓNG: 4 FE apps nêu trên — apps khác đã verify sạch ở story-level
4. e2e cần live stack — port war theo memory: verify service bằng logs, không tin health UP
5. Merge ngược về `story/fi369-nofallback-complete` qua temp worktree (memory: cross-worktree merge destination)
