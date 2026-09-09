# T6 — i18n parity sweep (FI-396 / SF-6)

> QA độc lập — READ-ONLY app/packages. Chạy trên worktree `sf-6-convergence-qa`
> (branch `wakii-dev/sf-6-convergence-qa`). Ngày: 2026-09-09.
> Công cụ: `scripts/qa/i18n-parity.mjs` (parity 2 hệ) + `scripts/qa/vi-hardcode-scan.mjs`
> (scan hardcode tiếng Việt, strip comment string-aware) — node thuần, 0 dep mới (đúng dep freeze).

## Per-check verdict table

| # | Check | Verdict | Tóm tắt |
|---|-------|---------|---------|
| 1 | Hardcode tiếng Việt trong render output (P1 = 0) | **FAIL** | ~30 hit P1 render-thật: shell error-boundary ×4 cụm, checkout ~20 (h1, error fallback, API layer, fallback "Sản phẩm"), admin 4, storefront 3-4. Chi tiết fail-list. |
| 2 | Key parity vi↔en 2 hệ | **PASS** | @ecommerce/i18n: 691/691 keys, 0 missing cả 2 chiều. storefront COPY (`dictionaries`): 155/155, 0 missing. Script exit 0. |
| 3 | aria-label phải qua t() key | **FAIL (P2)** | 6 aria-label raw-string (SF-2): LocaleSwitcher ×1, plp Sidebar ×2, Breadcrumb ×3 (EN-only). |

**T6 — VERDICT: FAIL** (check 1 P1 > 0; check 3 có raw aria-label — mức P2).

## Evidence (lệnh + số liệu)

### Check 2 — parity (chạy trước, quyết định "thiếu key" vs "hardcode")
```
node scripts/qa/i18n-parity.mjs
=== @ecommerce/i18n (packages/i18n catalogs) ===
keys vi: 691 · keys en: 691 — missing in EN: 0 — missing in VI: 0
value-identical vi===en: 38 (review-only, hợp lệ: 'Email', 'COD', 'Stripe', '₫',
  placeholder ASCII 'Nguyen Van A'/'12 Nguyen Hue', '{{count}}/500'…)
=== storefront-web COPY (lib/i18n.ts, 155 keys) ===
keys vi: 155 · keys en: 155 — missing: 0/0 — identical: 2 ('Flash sale', 'Size' — hợp lệ)
PARITY: PASS
```
Parser: strip comment string-aware → balanced-brace extract mọi `const NAME = {` → walk đệ quy bắt cả shape `{vi,en}` leaf (`dictionaries`) lẫn shape transpose `{vi:{…},en:{…}}` (`COPY` cũ) → flatten dotted-path → diff 2 chiều. `HERO_SLIDES` (Record<Locale, Array>) là data module catalog-def → ngoài phạm vi parity (đã có vi+en map đầy đủ, :259-268).

### Check 1 — hardcode tiếng Việt
```
node scripts/qa/vi-hardcode-scan.mjs   → 93 dòng (đã strip comment, loại tests/catalogs/console/import)
```
Phương pháp: range Latin Extended U+00C0-024F + Additional U+1EA0-1EFF (class gõ tay từng ký tự đã bị loại vì mangle — miss hit thật Sidebar:69/90 ở lần chạy đầu; đã re-run range an toàn). Mỗi hit được đọc context để phân loại: render-thật (P1) / bilingual literal (P2) / data module catalog-def (loại) / false-positive (`×` U+00B7, `đ` tiền tệ, regex matcher VariantSelector:100-107, `·` separator).

**Đã kiểm tra riêng lớp .ts API-layer (bài học SF-4 'Tải hóa đơn lỗi'):**
- `mfe-account/ordersApi.ts:158` `Tải hóa đơn lỗi (HTTP …)` — CÓ SỐNG nhưng là **fallback có chủ đích**: comment FI-394 verifier P1-2 + caller key-hóa banner `InvoiceDownloadError` (OrderDetailPage) → không tính P1 mới (ghi P2 verify en-banner).
- `mfe-admin/lib/invoice.ts:22`, `mfe-admin/lib/download.ts:11` — cùng pattern fallback, P1/P2 biên → fail-list mức P1-mức-thấp.
- `mfe-checkout/lib/*` (orderingApi, stripePay, useCart) — fallback vi **không** có cơ chế key-hóa upstream → P1 thật.
- `mfe-account/src/lib/*Api.ts` còn lại: sạch.

### Check 3 — aria-label
```
find 5 surfaces … | xargs grep -n 'aria-label=' → 88 tổng
loại `aria-label={t(` / `tParams` / biến sourced từ t()/dictionaries → 6 raw-string còn lại
```
Biến-sourced được chấp nhận (đã trace nguồn keyed): `method.name` (data), `placeholder`/`label`/`title` (props từ t()), `${review.rating}/5`, `${star}` (numeric), template ghép 2 key admin OrdersPage:182,191.

## Fail-list → fix-task proposal (P1)

### SF-3 (shell + mfe-checkout)
| File | Hành vi sai |
|---|---|
| `frontend/apps/shell/src/App.tsx:56,64 / 76,84 / 96,104 / 118,126` | 4 error-boundary fallback hardcoded vi: `title="Remote/mfe-* không chạy"`, nút `Thử lại`, text `— chạy` — shell có i18n (`t('shell.theme…')`) nhưng App.tsx không dùng |
| `frontend/apps/mfe-checkout/src/pages/CheckoutPage.tsx:338` | `<h1>Thanh toán</h1>` — h1 trang không qua key (catalog có `checkout.*` đầy đủ) |
| `frontend/apps/mfe-checkout/src/pages/ConfirmationPage.tsx:108` | `<h1>Xác nhận đơn hàng</h1>` — như trên |
| `frontend/apps/mfe-checkout/src/pages/ConfirmationPage.tsx:61` | pollError `'Không tải được trạng thái mới nhất từ hệ thống'` render trong status |
| `frontend/apps/mfe-checkout/src/pages/CheckoutPage.tsx:202,290,292,329` | fallback lỗi coupon/pay hardcoded ('Không kiểm tra được mã', 'Không tạo được đơn hàng', 'Thanh toán thất bại') |
| `frontend/apps/mfe-checkout/src/lib/useCart.ts:37,71,81` | fallback lỗi giỏ ('Không tải được giỏ hàng', 'Không đổi được số lượng', 'Không xóa được sản phẩm') |
| `frontend/apps/mfe-checkout/src/lib/orderingApi.ts:154` | API-layer `detail: 'Giỏ không có sản phẩm khả dụng để đặt hàng'` — đúng class bug SF-4, surface thẳng lên payError |
| `frontend/apps/mfe-checkout/src/lib/stripePay.ts:51,55,63` | 'Stripe chưa sẵn sàng', 'Thông tin thẻ chưa hợp lệ', 'Thanh toán thất bại' |
| `MiniCartDrawer.tsx:51,57 · CartPage.tsx:42,48,51,295 · CheckoutPage.tsx:716,719 · ConfirmationPage.tsx:98,195` | fallback tên line-item `?? 'Sản phẩm'` render thay alt/text |

→ Fix-task SF-3: thêm namespace `checkout.error*` + `shell.remoteError*` vào @ecommerce/i18n (cả vi+en), thay mọi fallback trên bằng t(); fallback 'Sản phẩm' → key `common.product`.

### SF-5 (mfe-admin)
| File | Hành vi sai |
|---|---|
| `frontend/apps/mfe-admin/src/pages/RmaPage.tsx:153` | cell render `` `${n} dòng · ${m} món` `` — đếm từ hardcoded |
| `frontend/apps/mfe-admin/src/pages/LoyaltyPage.tsx:234` | `placeholder="gd lễ 2/9…"` hardcoded |
| `frontend/apps/mfe-admin/src/components/DataTable.tsx:135` | default `{empty ?? 'Không có dữ liệu'}` — mọi table bỏ qua prop `empty` sẽ render vi |
| `frontend/apps/mfe-admin/src/lib/invoice.ts:22`, `download.ts:11` | 'Tải hóa đơn lỗi (HTTP …)' / 'Tải file thất bại (…)' — fallback API-layer chưa key-hóa như SF-4 đã làm |

→ Fix-task SF-5: key `admin.common.empty`, `admin.rma.linesCount`, `admin.loyalty.notePlaceholder`, `admin.common.downloadError*`; chuỗi lỗi API trả `{status}` + name để caller key-hóa (pattern InvoiceDownloadError).

### SF-2 (storefront-web)
| File | Hành vi sai |
|---|---|
| `frontend/apps/storefront-web/app/not-found.tsx:18` + `app/[locale]/not-found.tsx:18` | `<h1>Không tìm thấy trang</h1>` — vi-ONLY, user en thấy h1 tiếng Việt (desc + link thì bilingual) |
| `frontend/apps/storefront-web/app/[locale]/page.tsx:63` + `app/[locale]/c/[slug]/page.tsx:120` | `title="Catalog tạm thời không khả dụng"` — EmptyState lỗi catalog vi-only (các EmptyState khác đã dùng t()) |

→ Fix-task SF-2: key `common.notFound*` + `home.catalogUnavailable*` vào `dictionaries`, dùng cho cả 2 not-found (root không có locale → chọn vi làm fallback tĩnh).

## P2 notes

- **Bilingual literal thay vì key** (cả 2 ngôn ngữ nằm trong 1 chuỗi — hoạt động nhưng bypass i18n): 5 loading skeleton `Đang tải… / Loading…` (coupons/loading:12, c/[slug]/loading:11, layout loading:13, p/[slug]/loading:11, search/loading:11), `not-found` desc/link (:19,:21 ×2), LocaleSwitcher aria (:23), plp Sidebar ternary `{en ? … : …}` ×10 (:39,40,69,90,105,112,127,128,131,137). Khuyến nghị dời vào `dictionaries` khi đụng đến (SF-2).
- **manifest.ts:10,12** name/description vi-only — Next `manifest.ts` không có segment locale; chấp nhận được, ghi nhận.
- **Shell Home.tsx:11,14 + mfe-checkout main.tsx:26-27** — trang harness/dev-only, hardcode vi; không ảnh hưởng user production.
- **Tag taxonomy 'Chính hãng'/'Bảo hành'/'Hàng mới'** so sánh bằng string ở ProductCardView.tsx:47-49, productForm.ts:130,244 — domain data vi từ backend; đổi = hợp đồng dữ liệu, không phải việc i18n FE.
- **ordersApi.ts:158 fallback vi** — deliberate (FI-394), cần 1 verify nhỏ: en-locale banner có render key `account.order.invoiceError` đúng không (test :345 đang expect text vi).
- **False positives đã loại**: `×` (U+00D7) trong qty, `đ` tiền tệ `toLocaleString('vi-VN')`, regex matcher màu VariantSelector:100-107, dòng `·` separator, dòng nằm giữa block comment.

## Kết

- Parity key: **PASS** (2 hệ, 0 missing).
- Hardcode P1: **FAIL** (~30 hit) → 3 fix-task: SF-3 (shell+checkout, nhóm lớn nhất), SF-5 (admin, 4 cụm), SF-2 (storefront, 2 cụm).
- aria-label raw: **FAIL mức P2** (6 hit, SF-2).

**T6 — FINAL: FAIL** (P1 > 0; parity PASS không cứu được check 1).
