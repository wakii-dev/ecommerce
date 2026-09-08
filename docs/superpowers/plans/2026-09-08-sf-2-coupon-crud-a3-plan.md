# Plan: SF-2 coupon-crud-a3 — reconcile + GET list + toggle + FE form
Date: 2026-09-08 | Linear: FI-371 | Worktree: sf-2-coupon-crud-a3 | Epic: FI-369
Spec: docs/superpowers/specs/2026-09-07-nofallback-feature-complete-design.md (§4 SF-B) · Pack: docs/superpowers/contexts/fi369-sf-2.md

## 0. Baseline probe (verified 2026-09-08, worktree @f228385)

- `AdminCouponController` (89adcd9 — FI-366 SF-1 T11): POST/PUT/DELETE `/admin/coupons` + `@PreAuthorize ADMIN` + `AdminCouponDto` 10 trường + 409/400/404 mapping → **GIỮ NGUYÊN, chỉ bổ sung**
- Gateway: `gateway-auth.yml:53` đã allow `/api/ordering/admin/**` từ SF-9 → CONFIRM, không sửa
- N4 policy tự code xác nhận: `CouponService.reserve` = guarded UPDATE check active + `usedCount++` LÚC reserve; `releaseForOrder` hoàn usedCount; `finalizeForOrder` KHÔNG check active → toggle giữa chừng: in-flight RESERVED honor, mã mới từ chối qua `isRunning` (đã đúng — chỉ thêm endpoint toggle)
- DELETE policy: `adminDelete` chặn khi có reservation RESERVED → 409 — đã đúng N4 ("DELETE cứng chỉ khi chưa reservation")
- Contracts: amendment A3 CHƯA apply (`git log contracts/` = A1 cuối) → T1 post REQUIREMENT-GAP lên FI-369; FE regen + wiring chờ A3, phần còn lại chạy tiếp không block
- FE baseline: `CouponsPage` = read-only public list + local `PublicCoupon` interface + note phải XOÁ

## 1. Tasks

### T1 gap-a3-proposal-baseline-shape
- [x] A3 proposal (yaml exact: GET/POST `/api/ordering/admin/coupons`, PUT/DELETE `/{code}`, PUT `/{code}/active`; schemas `AdminCoupon` + `AdminCouponWrite` + `AdminCouponActiveRequest`; **PublicCoupon GIỮ NGUYÊN**) post lên FI-369 epic (REQUIREMENT-GAP format)
- [x] worktree comment set "A3 proposal posted, chờ coordinator apply"

### T2 probe-gateway-reservation-policy
- [x] probe `gateway-auth.yml:53` — allow `/api/ordering/admin/**` sẵn (không sửa)
- [x] đọc `CouponReservationRepository` + `CouponService.reserve/release/finalize` → policy N4 xác nhận đúng như spec

### T3 be-reconcile-controller-getlist-toggle
- [x] `AdminCouponController`: GET `` (list AdminCouponDto) + PUT `/{code}/active` (body `{active}`)
- [x] `CouponDtos`: + record `AdminCouponActiveRequest(boolean active)`
- [x] KHÔNG đụng create/update/DELETE + exception mapping hiện có

### T4 be-couponservice-deactivate-policy
- [x] `CouponService.adminList()` — findAll sort code → map toDto
- [x] `CouponService.adminSetActive(code, active)` — 404 nếu thiếu; domain `Coupon.setActive` (javadoc N4: in-flight RESERVED honor, mã mới từ chối qua isRunning)
- [x] KHÔNG đụng reserve/release/finalize (đã đúng)

### T5 be-it-contract-shape-toggle
- [x] IT GET list: tạo 2 coupon → list chứa cả 2, đủ usageLimit/usedCount/active
- [x] IT toggle round-trip: off → validate fail "không còn hiệu lực" → on → validate pass lại
- [x] IT toggle-in-flight (N4): reserve qua `CouponService` → toggle off → `finalizeForOrder` vẫn OK + usedCount giữ; validate mã mới fail
- [x] IT delete-with-reservation → 409 (assert policy có sẵn)
- [x] `mvn test` (AdminCouponApiTest + regression) green

### T6 fe-couponspage-form-crud (chờ A3 + regen)
- [ ] `lib/couponForm.ts` — form state + validate mirror BE §4.10 (code regex, PERCENT 1-100, FIXED>0, window, limit≥1, minOrder≥0) + `toRequest()`
- [ ] `CouponsPage`: admin list thay public list; cột usage (usedCount/limit) + status; toggle switch; form create/edit; delete confirm; error surfaces 409/400/422 (problem+json detail); **XOÁ note read-only**
- [ ] i18n keys `admin.coupons.*` mới

### T7 fe-types-regen-unit-test (chờ A3)
- [ ] merge A3 từ nhánh đích → `pnpm --filter @ecommerce/contracts gen`
- [ ] `clients/ordering.ts` +5 routes admin coupon (typed `operations`)
- [ ] `tests/couponForm.test.ts` — validation unit green
- [ ] typecheck + mfe-admin tests green

### T8 e2e-admin-coupon-nokeys-reserved
- [ ] `frontend/e2e/tests/admin-coupon.spec.ts`: tạo coupon qua UI form → list thấy (usedCount 0)
- [ ] checkout dùng coupon (COD path — KHÔNG cần Stripe keys) → usedCount tăng
- [ ] toggle off → validate-coupon fail → toggle on → pass lại
- [ ] seed parity: GET admin list trả WELCOME10/GIAM50K đúng shape (T9 gộp assert)

### T9 seed-parity-list
- [ ] `make seed` → GET `/admin/coupons` trả WELCOME10/GIAM50K đủ usageLimit/active/usedCount

### T10 gate-slice-java-fe-e2e-green
- [ ] Java IT + FE unit + e2e admin-coupon green
- [ ] story-diff-review (code-reviewer độc lập) → VERDICT APPROVED
- [ ] merge về `story/fi369-nofallback-complete` + comment hash + story-verify sạch

## 2. Meta (plain list — theo dõi qua Linear comments)

1. story-verify chạy với `ORCA_BIN=/usr/local/bin/orca`
2. `contracts/**` READ-ONLY — mọi yaml do coordinator apply (tiền lệ A1/A2)
3. Không đụng: checkout UI, payment/inventory, `lib/types.ts` + `adminStub.ts` (SF-3), storefront-web (SF-3), `.env` Stripe fields (SF-1)
4. Disk 6.5G trước khi bắt đầu — theo dõi trước mvn/e2e batch (R7)
5. Boundary: BE chạy không cần A3; FE regen/UI là slice duy nhất block trên coordinator
