# Report SF-3 — journey-specs (FI-407)

Ngày: 2026-09-10 · Worktree: `wakii-dev/sf-3-journey-specs` (base `story/fi404-qa-sweep` @276a5b1) · Linear: FI-407
Spec: `docs/superpowers/specs/2026-09-10-fi407-journey-specs-design.md` · Plan: `docs/superpowers/plans/2026-09-10-fi407-journey-specs-plan.md`

## 1. Kết quả run fresh-boot env (Rule 0 — coordinator tự chạy, KHÔNG process-pass)

Run cuối @commit `22a8655` (sau mọi review fix) trên env coordinator-held (SF-2 dry-run: 23 containers, one-origin `:8080`, seeded):

```
cd frontend && GATEWAY_URL=http://localhost:8080 E2E_STOREFRONT_URL=http://localhost:8080 \
E2E_SHELL_URL=http://localhost:8080 MAILPIT_API=http://localhost:8025 \
pnpm --filter @ecommerce/e2e exec playwright test tests/admin-journey.spec.ts tests/data-lifecycle.spec.ts

Running 13 tests using 1 worker
  12 passed (21.4s)
  1 skipped (fixme — coupon E-edit, bug thật, xem §4)
```

Chi tiết 13 test (serial, workers=1 — config GIỮ nguyên):

| # | Test | Lớp | Kết quả |
|---|---|---|---|
| 1 | A — admin login UI → products list | — | ✓ |
| 2 | B — tạo product ĐẦY ĐỦ field → Đăng bán → list thấy PUBLISHED | 4 | ✓ |
| 3 | C — round-trip reopen: MỌI field giữ đúng (stock 33 qua availability fetch) | 4 | ✓ |
| 4 | D — edit giá 469000 + stock 44 → reopen giữ đúng | 4 | ✓ |
| 5 | E — coupon round-trip leg hoạt động (tạo/toggle/xóa) | — | ✓ |
| 6 | E-edit — coupon SỬA round-trip | — | **fixme (bug thật §4)** |
| 7 | F — category CRUD round-trip (tạo/sửa/xóa) | — | ✓ |
| 8 | lớp 3a — Nokia: PDP ẩn selector + add TỰ gửi default variant → login merge → COD checkout CONFIRMED | 3 | ✓ |
| 9 | lớp 3b — stale cart `variantId: null` (redis inject): cart render không 500 → merge → `.pay-error` chứa "variantId" | 3 | ✓ |
| 10 | lớp 4 — PDP Biti's 799.000 ₫ = base 749.000 + delta 50.000 (auto-pick Đỏ/40) | 4 | ✓ |
| 11 | lớp 4 — PDP không render "Đã bán" từ ratingCount (Nokia + Biti's) | 4 | ✓ |
| 12 | lớp 4 — admin edit form Nokia: stock input = availability runtime (không 0 ảo) | 4 | ✓ |
| 13 | lớp 5 — fresh-state: page-alive + entry chunks content-hash load 200 + SW lock `/sw.js` prod | 5 | ✓ |

## 2. ACCEPTANCE pack — từng dòng

1. **admin-journey round-trip** ✓ — tests 2-4: mọi field giữ đúng (name/desc vi+en, SEO, giá, niem yết, flash, official, variant options/delta, ảnh) + stock = số nhập (33 → 44, qua inventory sync `PUT /api/inventory/admin/stocks` → availability fetch). Coupon + category CRUD: ✓ leg hoạt động (coupon edit xem §4).
2. **data-lifecycle** ✓ — test 8: POST `/api/cart/items` payload `variantId` == default variant id (fetch runtime theo slug; `scripts/seed/seed.sh:93-104`); checkout COD CONFIRMED — không "variantId must not be null". Test 9: stale cart line → lỗi rõ ràng 400 field `items[0].variantId` surface `.pay-error`, không 500 (CartService null-safe ~:127).
3. **Surfacing** ✓ — tests 10-12 (giá base+delta; không "Đã bán"; admin stock = availability thật, equality runtime-fetch).
4. **Specs XANH trên fresh-boot env** ✓ — 12 passed + 1 fixme (§1); evidence = output run trên + working tree `22a8655`. Lưu ý honesty: suite chạy trên env coordinator-held SAU dry-run SF-2 (marker `.run/qa-fresh-boot-wiped` hiện KHÔNG còn trên disk — env không được wipe lại trong SF này; SF-4 sẽ re-run green trên fresh wipe thật).
5. **15 specs cũ không đụng** ✓ — `git diff --name-only 276a5b1..HEAD -- frontend/e2e/tests/` = CHỈ `admin-journey.spec.ts` + `data-lifecycle.spec.ts`; env/api/checkout helpers + `playwright.config.ts` + `scripts/qa/` + `backend/` = 0 diff.

## 3. Mapping lớp lỗi → detector (epic §5.7)

| Lớp | Detector | Verify sống |
|---|---|---|
| 3 | data-lifecycle 3a (default variant qua checkout) + 3b (stale cart rõ ràng) | ✓ test 8-9 |
| 4 | admin-journey B/C/D (full-field + stock round-trip) + lifecycle 10-12 | ✓ |
| 5 | lifecycle 13 (fresh-state; port-owner là detector harness SF-2) | ✓ |

## 4. BUG THẬT tìm thấy (bug-register SF-4 — SF-3 KHÔNG sửa app)

**Coupon EDIT vỡ FE↔BE (mọi human admin edit đều dính):** UI Sửa → Lưu → `PUT /api/ordering/admin/coupons/{code}` → **400 `"code không hợp lệ (1-64 ký tự [A-Za-z0-9_-])"`**.
- Root cause: contracts `client.ts` executeRequest **strip path param `code` khỏi body**; BE `AdminCouponController` → `CouponService.validateAdmin:197-201` đòi `code` từ **BODY** → null → 400.
- Isolation: PUT qua curl CÓ `code` trong body → 200 (BE + gateway OK — vỡ ở contract FE↔BE). Probe bằng request thật của browser (headless capture) + 2 runs xác nhận.
- Fix candidates: BE merge path code vào request trước validate, HOẶC contract đưa code vào update body.
- SF-3 xử lý: test E tách — leg hoạt động green + edit-leg `test.fixme` (body faithful plan; SF-4 fix xong bỏ `fixme.` là chạy ngay, cleanup tail đã có).

## 5. Drift + điều chỉnh khi execute (spec amendment §6 — đều spec-side, không đụng app)

1. **Pack số ví dụ lệch seed thật**: pack ghi "Mustela delta 1000 → 481.000₫, stock 100" — seed thật delta 0 (480.000₫), stock 50/variant. Specs dùng số seed THẬT (Nokia 590.000₫ khớp pack; Biti's Đỏ/40 799.000₫ là case delta thật).
2. **SW CÓ THẬT ở prod build**: `PwaRegister` đăng ký `/sw.js` prod-only — env :8080 là prod build → assert SW-absence đảo thành SW-presence lock (đúng 1 registration, scriptURL `/sw.js`). SW version-key-sau-rebuild cần rig 2 build — follow-up epic §5.7.
3. **Stock 50 → 46 trong run**: suite TỰ tiêu 4 Nokia (COD orders test 8) → assert admin stock đổi thành **equality với availability runtime-fetch** (cùng nguồn `ProductFormPage.tsx:62`) — lock "không 0 ảo" state-independent.
4. **Merge-on-login listener phải attach TRƯỚC `uiLogin`** — merge POST fire đồng thời auth flip; pattern plan (attach sau) lỡ 2/2 runs.
5. Selector adjustments strict-mode (shell chrome :8080): `exact: true` tab 'Tiếng Việt'; `#p-brand`/`#p-category` thay getByLabel (collision aria-label header).

## 6. State bàn giao SF-4

- Env: vẫn UP + seeded; residue test data: products `E2E Journey <ts>` (PUBLISHED, không cleanup — catalog admin không có hard delete), coupon/category ĐÃ dọn (delete pass); Nokia availability giảm theo số order suite tạo (bình thường — demo seed lại bằng `make seed`).
- fresh-boot-run-1 của SF-4 sẽ re-run journeys: 13 test này phải 12 passed + 1 fixme trên fresh wipe thật; sau fix coupon-edit → bỏ fixme → 13 passed.
- 15 specs cũ + 2 mới: full `pnpm e2e` (owner success §5.6 SF-4).
