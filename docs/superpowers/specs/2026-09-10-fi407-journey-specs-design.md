# SF-3 journey-specs — Spec (FI-407, story FI-404 QA Sweep)

> Ngày: 2026-09-10 · Worktree: `sf-3-journey-specs` (base `story/fi404-qa-sweep` @276a5b1) · Linear: FI-407
> Epic spec: `docs/superpowers/specs/2026-09-10-qa-sweep-design.md` §SF-3 · Context pack: `docs/superpowers/contexts/fi404-sf-3.md`
> Mode: autonomous (epic questions đã trả lời — không hỏi lại). Phase 0 impact đã chạy epic-level.

## 0. IDEA-BRIEF — regression-lock 3 bug thật lớp 3/4/5

Sweep FI-404 sinh ra để săn 5 lớp bug; 3 bug thật đã nổ ở các lần verify trước cần **detector đặt tên trong repo** (epic §5.7):

| Lớp | Bug thật | Detector trong SF này |
|---|---|---|
| 3 — Data lifecycle | Product variant-less kẹt checkout (`items[].variantId must not be null`) | `data-lifecycle.spec.ts` — add product cũ (Nokia) → checkout pass nhờ seed default variant; stale cart line `variantId: null` → lỗi rõ ràng, không 500 |
| 4 — UI surfacing sai | Admin edit form stock luôn 0 (view không trả stock); PDP render "Đã bán" từ ratingCount | `admin-journey.spec.ts` (stock round-trip qua availability) + `data-lifecycle.spec.ts` (PDP asserts) |
| 5 — Stale environment | Env cũ treo sau rebuild (port-owner, SW cache, bundle cũ) | fresh-state asserts trong `data-lifecycle.spec.ts` (page-alive + entry-hash; port-owner là detector của harness SF-2) |

**Nguyên tắc vàng (từ launch prompt):** specs ASSERT đúng hành vi đã fix — không đổi behavior, không sửa app code tìm thấy bug (→ bug-register SF-4), không sửa 15 specs cũ, không thêm dependency.

## 1. Ground truth đã verify sống (probe 2026-09-10, env fresh-boot dry-run SF-2)

Mọi assert số trong specs dựa trên các mốc này (fetch-id runtime, KHÔNG hardcode UUID — fresh wipe đổi id):

- **Seed fix lớp 3** = `scripts/seed/seed.sh:93-104` — INSERT default variant ("Mặc định"/"Default", price = base) cho mọi product chưa có variant, idempotent. db_catalog: 0/24 product variant-less. (Bản thân `SeedData.java` vẫn có seed variant-less — fix ở TẦNG SEED SCRIPT, specs không assert seed data runner.)
- **CartService null-safe** (`CartService.java` ~:127 `if (item.variantId() != null && !unavailable)`): add-to-cart `variantId` null → 200, line tolerated; GET cart 200. Cart layer KHÔNG chặn null — chặn ở checkout validate.
- **Checkout validate**: `CreateOrderRequest.Item.variantId @NotNull` → POST `/api/ordering/orders` (gateway, StripPrefix=2; direct API cần header `Idempotency-Key`) với variantId null → **400** `errors[]: items[0].variantId "must not be null"` — lỗi rõ ràng (không 500). UI gửi `variantId: item.variantId ?? ''` (`CheckoutPage.tsx:259`) → Jackson blank→null → cùng 400.
- **PDP auto-pick**: variant không color/size (default) → `collectOptions` rỗng → selector ẨN, `pickVariant` match variant ĐẦU → `PdpBuyBox` state variantId = default → add-to-cart gửi variantId default (`AddToCart` POST `/api/cart/items?slug=`). Đây chính là "variant selector auto-chọn default" theo fix.
- **Giá = base + delta**: `CatalogQueryService.java:254` `priceDelta = v.price − product.price`; PDP `.pdp-price` = `formatVnd(base + delta)` — Biti's Hunter auto-pick "Đỏ/40": 749.000 + 50.000 = **"799.000 ₫"**; Nokia (delta 0): **"590.000 ₫"**. Format: dấu chấm nghìn + space + ₫ (`lib/format.ts formatVnd`).
- **"Đã bán"**: KHÔNG xuất hiện trong storefront source (fix FI-390 giữ nguyên; `FlashDealSection.tsx:21` comment honesty).
- **Admin stock surfacing** (fix FI-397 demo follow-up): `ProductFormPage.tsx:52-76` fetch `/api/inventory/availability?variantIds=` → đè stock input; save sync `PUT /api/inventory/admin/stocks`. Live: Nokia variant availability = **50** (seed 50/variant × 31 variant).
- **Không có service worker** trong storefront-web (find 0 file sw/serviceWorker) → fresh-state assert SW-absence + entry chunks content-hashed.
- **COD checkout** (SF-13): `payment-method-cod` → "Đặt hàng COD" → CONFIRMED KHÔNG cần Stripe → checkout leg chạy được trên fresh-boot env không đảm bảo Stripe.
- **Drift note**: context pack ví dụ "Mustela delta 1000 → 481.000₫, stock 100" KHÔNG khớp seed thật (Mustela delta 0, stock 50) — pack tự quy định "assert số trên UI/API khớp" → specs dùng số seed THẬT đã probe ở trên (Nokia 590.000₫ ✓ khớp pack). Ghi nhận drift trong report-sf3.

## 2. Scope

### In — files SF-3 sở hữu (touch map pack)

```
frontend/e2e/tests/admin-journey.spec.ts     (mới)
frontend/e2e/tests/data-lifecycle.spec.ts    (mới)
frontend/e2e/helpers/journey.ts              (mới — helper dùng chung, KHÔNG sửa helper hiện có)
docs/superpowers/qa/report-sf3.md            (mới — evidence run fresh-boot)
```

### Out (boundary — pack §Boundary)

15 specs cũ (read-only, evidence `git diff`), app/packages code, scripts/qa harness (SF-2), config-audit (SF-1), contracts, pnpm-lock, `make dev`/`dev-stack` topology. KHÔNG `down -v`/fresh-boot tự ý (env do coordinator quản, đang UP + seeded); env chết → comment epic FI-404 chờ coordinator. KHÔNG merge main. Playwright config GIỮ nguyên (serial, workers=1, retries=1).

## 3. Design

### 3.1 `admin-journey.spec.ts` — admin CRUD trọn vòng (lớp 4: stock round-trip)

Serial describe "Admin journey — CRUD đầy đủ field (FI-407)". Mỗi section re-login UI (JWT 15' — pack §Spec slice 3): helper `adminUiLogin(page)` trong `helpers/journey.ts` (pattern `uiLogin` golden-path + `admin-crud.spec.ts`).

1. **Section A — product create đầy đủ field**: login admin UI → `/admin/products` → "Thêm sản phẩm" → form:
   - info: tên vi/en unique (`E2E Journey <ts>`), mô tả vi/en, brand, category (selectOption theo id fetch từ `/api/catalog/categories`), checkbox "Chính hãng"
   - SEO (tab "SEO"): title + description (vi)
   - giá (tab "Giá"): giá bán 459000, giá niem yết 559000, flash sale kết thúc `2027-01-31T23:59` (datetime-local)
   - phân loại (tab "Phân loại"): 1 row — tên vi "Màu Đen", options `color=Đen`, chênh giá 10000, **tồn kho 33**
   - ảnh (tab "Ảnh"): 1 row URL `/media/products/e2e-journey.png` + alt
   - "Đăng bán" → toast "Đã tạo sản phẩm" → về list; tìm bằng search box → assert row PUBLISHED ("Đăng bán").
2. **Section B — round-trip reopen (chứng minh không còn field không-lưu)**: mở lại form (Sửa từ row) → assert TỪNG field giữ đúng: tên vi/en, mô tả vi/en, SEO title/desc, brand, category, official checked, giá, niem yết, flash **assert phần NGÀY** (`value` bắt đầu `2027-01-31` — spec-critic P1: datetime-local↔ISO qua TZ có thể lệch giờ giữa host/container; ngày là đủ chứng minh field không rơi), variant row (tên, `color=Đen`, chênh giá 10000, **tồn kho 33** — stock fetch availability sau save-sync, đợi `expect.poll`), ảnh url+alt. **Ngoại lệ ghi chú D17**: variant nameEn KHÔNG round-trip (view trả name resolved — fallback vi); không assert nameEn.
3. **Section C — edit + save + re-assert**: đổi giá 459000 → 469000, đổi stock 33 → 44 → Lưu → mở lại → assert 469000 + 44 (edit round-trip).
4. **Section D — coupon CRUD round-trip**: `/admin/coupons` → "Thêm mã" (`coupon-create-btn`) → form IDs `coupon-code/-type/-value/-min/-starts/-ends/-limit/-active/-desc`: code `E2EJ<ts>` FIXED 50000, min 100000, limit 5, active, mô tả → submit (`coupon-submit-btn`) → toast "Đã tạo mã giảm giá" → assert row (code, badge "Số tiền cố định (₫)", `50.000 ₫`, usage `0/5` qua `coupon-usage-<code>`) → Sửa (code khóa — hint "Mã không đổi khi sửa") đổi value 60000 → Lưu → assert `60.000 ₫` → toggle (`coupon-toggle-<code>`) → "Tắt" → xóa (`coupon-delete-<code>` → confirm modal "Đồng ý") → code biến mất.
5. **Section E — category CRUD round-trip**: `/admin/categories` → "Thêm danh mục" → `cat-name-vi/-en/-slug-vi/-slug-en`, parent = "— Danh mục gốc —" → Lưu → toast "Đã tạo danh mục" → assert `category-row` chứa tên + slug → Sửa đổi tên → Lưu → assert tên mới → xóa (confirm modal) → row biến mất (dọn rác — category không con/không product thì xóa được).

Selectors: label/htmlFor IDs ổn định của form (`p-name`, `p-price`…), testid sẵn có, classname contract (ADR 0007 — KHÔNG thêm testid mới vì cấm sửa app code; các selector hiện tại đủ ổn định). Variant row inputs: vị trí cố định trong `.admin-variant-row` (label không có htmlFor).

### 3.2 `data-lifecycle.spec.ts` — lớp 3 + 4 + 5

Serial describe. Fetch-id runtime qua API (slug seed ổn định).

1. **Lớp 3a — guest variant-less cũ checkout pass**: context mới (guest) → PDP `/vi/p/dien-thoai-nokia-110-2023` (product variant-less GỐC, giờ có default variant) → **assert POST `/api/cart/items` payload `variantId` == default variant id** (fetch trước qua `/api/catalog/products/{slug}`) — chính là "auto-chọn default"; assert PDP KHÔNG render selector (`.pdp-variants` count 0) + giá "590.000 ₫" → UI login user mới đăng ký (registerNewUser, merge-on-login) → `/cart` thấy Nokia (merge guest→user) → `/checkout` → điền địa chỉ (labels golden-path) → "Tiếp tục" ×2 → chọn COD (`payment-method-cod`, `cod-note`) → "Đặt hàng COD" → confirmation `order-status data-status-code=CONFIRMED` (không văng "variantId must not be null" — checkout pass qua validate).
2. **Lớp 3b — stale cart `variantId: null` → lỗi rõ ràng**: tạo guest cart qua API (POST `/api/cart` → Set-Cookie `cart_token`), add 1 item thật (có variantId), rồi **redis-cli SET `cart:guest:<token>`** với CartDocument JSON mà line có `variantId: null` (mô phỏng data trước seed-fix — qua docker exec, pattern `pgExec` helper) → context browser gắn cookie đó → `/cart` render item (CartService tolerant, không 500) → login user → `/checkout` → "Đặt hàng COD" → **`.pay-error` visible** chứa "variantId" (400 `items[0].variantId must not be null` surface — lỗi rõ ràng, không crash, không 500 trắng).
3. **Lớp 4 — surfacing số thật**: (a) admin edit form Nokia: mở `/admin/products` → search "Nokia 110" → Sửa → tab "Phân loại" → stock input **poll về "50"** (= `db_inventory.stocks.quantity`, qua availability API — không 0 ảo); (b) PDP Biti's `/vi/p/giay-sneaker-bitis-hunter-street`: auto-pick "Đỏ/40" → `.pdp-price` = **"799.000 ₫"** = base 749.000 + delta 50.000; (c) PDP Nokia + Biti's **không chứa text "Đã bán"** (fix FI-390) trong khi ratingCount vẫn render đúng chỗ rating.
4. **Lớp 5 — fresh-state**: home `/vi` sống sau fresh boot (title + hero render, entry script `/_next/static/chunks/*.js` match pattern content-hash và load 200 — assert qua `page.request`); SW: `navigator.serviceWorker.getRegistrations()` rỗng (storefront không có SW — nếu sau này thêm SW, assert này đỏ = nhắc ghi version-key assert); wipe marker `.run/qa-fresh-boot-wiped` (nếu tồn tại) → ghi timestamp vào report như evidence env-fresh (soft note, không hard-fail trên env khác). Port-owner check là detector của harness SF-2 — spec chỉ assert page-alive.

### 3.3 `helpers/journey.ts`

- `adminUiLogin(page)` — UI login ADMIN_EMAIL/ADMIN_PASSWORD (env helpers), chờ rời /login.
- `injectStaleGuestCart(token, productId, slug, name, unitPrice)` — docker exec redis-cli SET JSON CartDocument line variantId null (execFileSync arg-array — pattern pgExec, không qua /bin/sh).
- Không sửa `env.ts`/`api.ts`/`checkout.ts` hiện có.

### 3.4 Evidence + report

- Chạy (cú pháp chuẩn `docs/superpowers/qa/e2e-full.md:64` — KHÔNG có flag `--run`): `cd frontend && GATEWAY_URL=http://localhost:8080 E2E_STOREFRONT_URL=http://localhost:8080 E2E_SHELL_URL=http://localhost:8080 MAILPIT_API=http://localhost:8025 pnpm --filter @ecommerce/e2e exec playwright test tests/admin-journey.spec.ts tests/data-lifecycle.spec.ts` (fresh-boot env one-origin :8080 — FE containers chỉ expose trong docker network).
- `docs/superpowers/qa/report-sf3.md`: lệnh chạy, pass/fail từng test, số asserts đã probe, drift note pack-vs-seed, screenshot/video theo playwright config (screenshot off mặc định — bật tay khi debug; evidence = log run + file report).

## 4. ACCEPTANCE (user-visible — pack, verify từng dòng)

1. admin-journey: tạo product đầy đủ field + variant stock → save → mở lại → MỌI field giữ đúng (bao gồm stock = số đã nhập 33/44); coupon + category CRUD round-trip pass.
2. data-lifecycle: variant-less product (Nokia) add-to-cart → login merge → checkout KHÔNG văng "variantId must not be null" (COD CONFIRMED); stale cart row `variantId: null` được xử lý rõ ràng (`.pay-error` có field variantId, không 500).
3. Surfacing: admin form Nokia stock = 50 (inventory thật); PDP không "Đã bán"; Biti's giá 799.000 ₫ = base + delta.
4. Cả 2 spec XANH trên fresh-boot env do coordinator/harness tạo (:8080) — SF-3 KHÔNG tự down -v/chạy harness; evidence log + report-sf3.
5. Spec cũ 15 file không bị sửa (git diff evidence).

## 5. Test strategy & risks

- Specs = chính là test (e2e); chạy TRÊN env fresh-boot thật (Rule 0 — không process-pass). Mỗi task commit xong chạy đúng spec của task trên env sống; task 9 = full run cả 2 + report.
- Risks: (a) toast tự ẩn 2.5s → assert qua response/network hoặc poll nhanh; (b) availability fetch async → `expect.poll` cho stock; (c) redis JSON shape phải khớp CartDocument records chính xác (9 field LineItem) → helper test thử GET cart 200 trước khi UI đọc; (d) merge-on-login phụ thuộc localStorage guest token cùng origin :8080 (one-origin — an toàn port-scope); (e) harness env có thể chết giữa chừng → STOP, comment epic FI-404, không tự down -v.
- Ưu tiên assert ở tầng network/response khi UI-toast dễ bay (pattern addFirstVariantToCart golden-path).
- Button labels templated ("Đặt hàng COD — {{total}}", "Tiếp tục — chọn vận chuyển", "Đặt hàng — {{total}}") → match bằng PREFIX/regex (`getByRole('button', { name: /^Đặt hàng COD/ })` — pattern cod-checkout.spec.ts:69), không match chuỗi đầy đủ.
- Redis helper: container resolve theo pattern pgExec — override env `E2E_REDIS_CONTAINER` (bare container của rig isolate) hoặc mặc định `docker compose exec -T redis redis-cli` (spec-critic P2).
