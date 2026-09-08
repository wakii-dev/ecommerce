# Phase 7 — No-Fallback & Feature-Complete — Epic Spec (Story Design)

> Date: 2026-09-08 · Status: DRAFT (spec-critic pending) · Repo: `/Users/hoivu/orca/projects/ecommerce` · Base: master (GA v1.1) · Predecessor: FI-366 (PR #8 chờ merge — story này base trên master, merge PR #8 trước khi SF code chạm frontend)

---

## 1. IDEA-BRIEF (8 chiều)

| Chiều | Nội dung |
|---|---|
| **Task** | (1) Feature-completeness: rà TẤT CẢ tính năng spec §4 vs code — lấp gap thật (coupon CRUD); (2) **No-fallback**: MỌI button/link hoạt động thật có đích; xoá sạch mock/stub/dead-link/nói-dối; (3) Stripe keys tự lắp qua Orca browser (user duyệt "tự tạo nếu có thể") + E2E golden path chạy FULL thật |
| **Output** | Admin coupon CRUD đầy đủ · Stripe test keys LIVE trong `.env` · E2E golden path FULL PASS (CONFIRMED + email + badge) · zero fallback pattern ngoài degraded-by-design registry · master ổn định |
| **Users** | Admin (quản coupon qua UI thật) · end user (không còn link chết/toast giả) · dev (register ADR phân loại rõ) |
| **Constraints** | MUST: contracts READ-ONLY (amendment qua coordinator — A3); không feature mới ngoài coupon CRUD; giữ degraded-by-design hợp lý (ES D15, payment 503 fail-loud) — chỉ xoá fallback-nói-dối; KHÔNG commit keys |
| **Input** | P0 report (fallback inventory + touch map 18 files) · design direction A · FI-337 closed |
| **Context** | FI-366 PR #8 chờ merge (SF-13/14/15 Done trên story branch) — story này base master, launch SAU khi PR #8 merge (tránh đụng độ T6) |
| **Success** | Xem §5 — mỗi mục binary |
| **Out-of-scope** | GHN merchant thật (business decision user) · feature mới khác · ES PgFts fallback (degraded-by-design GIỮ — D15) |

## 2. Quyết định (decision log)

| # | Quyết định | Nguồn |
|---|---|---|
| N1 | **Direction A — No-fallback trọn vẹn 3 SF**: SF-A Stripe thật + E2E un-skip; SF-B Coupon CRUD A3; SF-C Honesty pass (dead links + stub purge + degraded registry) | AGENT (P0 khuyến nghị — khớp nguyên văn user) |
| N2 | **3-question fallback test** phân loại: (1) Có nói dối user không? (2) Có thay đường thật bằng đường giả vĩnh viễn không? (3) Có fail-safe quan sát được khi infra chết không? → (1)(2)=xoá, (3)=GIỮ. Áp thành **degraded-by-design registry** (ADR mới): ES→PgFts GIỮ, payment 503 GIỮ, GHN flat-fee GIỮ + nhãn UI "Phí tiêu chuẩn" trung thực | AGENT |
| N3 | **Stripe signup hybrid**: automation qua Orca browser (~70% — form điền + Turnstile tự giải) + **escape hatch user-manual** (CAPTCHA/phone verify hoặc dashboard drift → user làm tay ≤10 phút, coordinator raise ngay) | **USER** ("tự tạo nếu có thể") + AGENT |
| N4 | **Coupon DELETE/TOGGLE policy** (code hiện tại đã trả lời — verify `CouponService.reserve` :73-95): reserve = guarded UPDATE check `active` + `usedCount++` LÚC RESERVE (không phải PAID); reservation RESERVED→FINALIZED (CONFIRMED) / RELEASED (FAILED/CANCELLED + refund usedCount). Vậy: **toggle/deactivate giữa chừng → đơn in-flight (RESERVED) được tôn trọng, chỉ mã mới bị từ chối** — KHÔNG implement kiểu delete+recreate; DELETE cứng chỉ khi chưa reservation. IT/E2E assert: toggle-in-flight → đơn in-flight vẫn finalize. | AGENT + code verify |
| N5 | **Footer**: trim về các route có thật (không tạo trang content mới — scope control) | AGENT (mặc định; user muốn trang thật thì nói thêm) |
| N6 | **Webhook local**: Makefile target `stripe-listen` (Stripe CLI login + forward → in `whsec_` vào `.env`) — bước dễ sót NHẤT, có task riêng | AGENT |

## 3. Kiến trúc thay đổi

- `contracts/openapi/ordering.yaml` — **amendment A3** (coordinator): admin coupons CRUD endpoints + PublicCouponDto mở rộng `usageLimit/usedCount/active` → regen TS
- `backend/services/ordering-service/**/AdminCouponController` + `CouponService` admin methods + policy deactivate (SF-B)
- `backend/services/payment-service` — KHÔNG đổi code; chỉ `.env` wiring keys (application.yml slots có sẵn)
- Makefile — target `stripe-listen` (Stripe CLI login + forward → whsec)
- `frontend/apps/mfe-admin/src/lib/adminStub.ts` — XOÁ `createStubApi`+seed; tách `canShip/canDeliver/canCancel` → `lib/orderRules.ts`; rename `Stub*` types (`lib/types.ts` + 5 pages); `tests/stub.test.ts` di chuyển cùng helper
- `frontend/apps/storefront-web`: Header links (dòng 74-76) → routes thật; Footer.tsx:34 trim; CategoryTiles.tsx:51 + page.tsx:85 "Xem thêm" → route thật; xoá dead i18n `reviewsSoon` (:51,69); `AddToCart.tsx:36,45` toastFail → lỗi thật
- Shell `App.tsx:173-175` route `/ui-kit` — gate theo env flag (ẩn prod, giữ cho design-system dev)

## 4. Feature scope (đóng băng)

**SF-A stripe-live-e2e (10 tasks):**
1. Probe: đọc `PaymentWebhookService` (luồng PAID webhook-only hay confirm-sync) + `stripe --version` probe máy
2. Tạo Stripe account qua Orca browser: signup (email toilahoi007@gmail.com + password mạnh + country Singapore/Vietnam-tùy-dropdown) → verify email (inbox Gmail — **escape hatch: user click link**) → skip business form (test mode) → Dashboard → API keys → copy `pk_test_/sk_test_`
3. Tạo `.env` **repo-root** (gitignored — verify) + điền ĐÚNG 3 biến theo `e2e/helpers/env.ts:44-52` hard-require: `STRIPE_SECRET_KEY=sk_test_*`, `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_*`, `STRIPE_WEBHOOK_SECRET=whsec_*`; probe consumer pk (checkout UI Elements hay chỉ e2e helper) và ghi vào T5
4. Makefile `stripe-listen`: **reuse compose service stripe-cli có sẵn** (profile stripe) + `stripe login` → whsec CLI in ra điền `STRIPE_WEBHOOK_SECRET`; verify payment-service nhận webhook → đơn PAID
5. Un-skip + chạy golden-path E2E với keys: bước đầu **hard-assert `hasStripe() === true`** (fail-loud cấm skip âm thầm) → 2 test `[PENDING-STRIPE-KEYS]` PASS thật (4242 success + 4000...0002 declined)
6. Saga-fail declined path + platform-asserts commission PASS thật
7. Regression: không-keys → `payUnavailable` fail-loud giữ đúng (không fake confirm); payment 503 path giữ
8. Evidence: screenshot dashboard keys (che giữa) + E2E green log + docs `[PENDING-STRIPE-KEYS]` → `[VERIFIED-STRIPE]`
9. Webhook local runbook ghi vào README (stripe listen mỗi phiên dev)
10. Gate slice: Java payment IT + E2E golden-path green

**SF-B coupon-crud-a3 (10 tasks):**
1. REQUIREMENT-GAP A3 proposal (endpoints + **`AdminCouponDto` riêng có `usageLimit/usedCount/active` — PublicCouponDto public KHÔNG lộ thống kê sử dụng**) — chờ coordinator duyệt + amend contracts + regen
2. Probe gateway allowlist `/api/ordering/admin/**` + đọc `CouponReservationRepository` → chốt DELETE policy
3. BE `AdminCouponController` (create/update/toggle/delete) + admin-role guard pattern `AdminOrderController`
4. BE `CouponService` admin methods + validation (window/usageLimit) + deactivate policy
5. BE IT contract-shape + validation test
6. FE `CouponsPage`: form create/edit + toggle + delete + error surfaces (409/422) — XOÁ note read-only
7. FE types regen consume + unit test form validation
8. E2E admin coupon: tạo → dùng ở checkout → usedCount tăng → toggle off → validate fail
9. Seed parity: `make seed` coupons hiển thị đúng qua list mới
10. Gate slice: Java + FE + E2E admin-coupon green

**SF-C honesty-pass (11 tasks):**
1. Header links (Header.tsx:74-76) → routes thật (probe PLP sort params `new`/`popular` tồn tại trước)
2. CategoryTiles "more" + home "Xem thêm" (page.tsx:85) → PLP/category route thật
3. Footer (Footer.tsx:34) — trim về routes có thật (N5)
4. `AddToCart.tsx:36,45` toastFail "Cart is coming soon" → lỗi thật ("Không thêm được vào giỏ — thử lại"); **verify method: unit test error state + E2E route.abort assert toast** (SF-1 T15 
5. Xoá dead i18n `reviewsSoon` (p/[slug]/page.tsx:51,69) — grep test tham chiếu trước
6. Tách `canShip/canDeliver/canCancel` + test → `lib/orderRules.ts`; **`tests/stub.test.ts` SPLIT**: phần order-rules giữ thành `orderRules.test.ts`, phần mock-API test XOÁ; xoá `createStubApi`+seed khỏi `adminStub.ts`; xoá file rỗng
7. Rename `Stub*` types (`lib/types.ts` + Dashboard/Orders/OrderDetail/Reviews pages — **CouponsPage KHÔNG dùng Stub, dùng PublicCoupon generated**; thêm `lib/api.ts` stub re-exports) — mechanical 1 commit
8. Shell route `/ui-kit` gate theo env flag `NEXT_PUBLIC_UIKIT_DEV=1` (unset = ẩn prod)
9. Viết **degraded-by-design registry** (ADR): ES→PgFts GIỮ · payment 503 GIỮ · GHN flat GIỮ + nhãn UI "Phí tiêu chuẩn" trung thực
10. Grep sweep cuối — **scope: `storefront-web/src` + `mfe-admin/src`** (đã verify apps khác sạch) — pattern: `href="#"`, `Sắp ra mắt`, `createStubApi` → zero; **whitelist enumerate từng match sống kèm lý do** trong registry ADR (vi.mock unit tests, `placeholder=` attr form, `_skeleton-remote`, ui-kit demo page = hợp lệ); report từng match còn lại kèm lý do
10b. **Playwright nav asserts** (binary hoá zero dead link): header/footer/tiles click → URL đích đúng, không còn `href="#"`
11. Integration gate: FE unit + pytest + Java + E2E (keys từ SF-A) all green

## 5. Success criteria

1. Stripe account test tồn tại; keys trong `.env` (KHÔNG commit — grep verify)
2. E2E golden-path: 2 test `[PENDING-STRIPE-KEYS]` PASS thật (4242 CONFIRMED + declined FAILED)
3. Saga-fail + platform-asserts + commission-ledger PASS thật
4. Không-keys → payUnavailable 503 fail-loud giữ đúng (regression)
5. Admin coupon CRUD qua UI: tạo/sửa/toggle/xóa → coupon center + checkout validate đúng
6. Coupon seed parity: WELCOME10/GIAM50K hiển thị đúng qua list mới
7. Zero dead link (header/footer/tiles/xem-thêm điều hướng thật); toastFail = lỗi thật
8. `Stub*` types = 0; `createStubApi` xoá; grep sweep sạch ngoài registry
9. Degraded-by-design registry ADR hoàn chỉnh (ES/payment 503/GHN flat + nhãn UI)
10. Webhook local: `stripe listen` → payment PAID qua webhook E2E

## 6. SF split + deps (sequenced)

| SF | Tên | Tier | Depends | Tasks |
|---|---|---|---|---|
| SF-A | stripe-live-e2e | 0 | FI-366 PR#8 merge (base sạch) | 10 |
| SF-B | coupon-crud-a3 | 1 | SF-A (keys cho E2E slice + tránh đụng dev-stack) | 10 |
| SF-C | honesty-pass | 1 | SF-A, SF-B (keys + coupon UI cho sweep cuối) | 11 |

**Nhánh đích:** `story/fi366...-v11` NO — **`story/fi331-nofallback-complete`** (epic mới FI-3xx, tạo lúc APPROVE). Launch order: SF-A → (SF-B ∥ SF-C).

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Stripe signup CAPTCHA/phone block automation | N3 escape hatch: user làm tay ≤10 phút trong Orca browser visible — coordinator raise ngay khi block |
| R2 | E2E Stripe thật LẦN ĐẦU lộ bug latent golden-path | Buffer fix trong SF-A T5-7; bug register; đây chính là giá trị của phase |
| R3 | Webhook local sót whsec | N6 task riêng stripe-listen + verify PAID E2E |
| R4 | Coupon DELETE phá reservation đang chờ | N4 policy deactivate + đọc repository trước |
| R5 | Gateway allowlist admin coupons: **ĐÃ verify `gateway-auth.yml:53` allow `/api/ordering/admin/**` từ SF-9** — probe chỉ confirm; risk thật còn `@PreAuthorize` BE |
| R6 | Footer trim làm mất link user muốn giữ | N5 mặc định trim; user list thêm nếu muốn |
| R7 | ENOSPC tái diễn | Pre-check df ≥ 20G trước mvn/E2E batch |

## 8. Assumptions

- Stripe test keys chỉ cần signup + email verify (dashboard UI có thể drift — automation steps có thể lệch, escape hatch N3)
- CAPTCHA Turnstile tự giải đã thấy ở lần điền trước (token input được điền) — signup submit chưa thử
- Gmail inbox `toilahoi007@gmail.com` là của user — verify link do user click
- `toilahoi007` đồng ý là owner Stripe account demo
- Contracts A3 amendment do coordinator apply (tiền lệ A1/A2)
