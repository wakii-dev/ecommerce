# T8 — Unit tests toàn monorepo + token-regression (FI-396 / SF-6 convergence-qa)

- **Nhánh:** `wakii-dev/sf-6-convergence-qa` (merged tip của 5 surface SFs, commit `8d775b8`)
- **Ngày chạy:** 2026-09-09 · vitest v2.1.9 · chạy `pnpm test` (= `vitest run`, non-watch) TRONG từng package dir
- **Phạm vi:** READ-ONLY — không sửa code, không commit. Chỉ viết file báo cáo này.

## Per-package table

| Package | Lệnh | Test files | Passed | Failed | Skipped | Verdict |
|---|---|---|---|---|---|---|
| `packages/ui-kit` | `pnpm test` | 7 | 89 | 0 | 0 | PASS |
| `packages/i18n` | `pnpm test` | 1 | 6 | 0 | 0 | PASS |
| `packages/contracts` | `pnpm test` | 1 | 6 | 0 | 0 | PASS |
| `packages/config` | `pnpm test` | 1 | 3 | 0 | 0 | PASS |
| `packages/auth` | `pnpm test` | 2 | 17 | 0 | 0 | PASS |
| `apps/mfe-checkout` | `pnpm test` | 6 | 41 | 0 | 0 | PASS |
| `apps/mfe-account` | `pnpm test` | 9 | 61 | 0 | 0 | PASS |
| `apps/mfe-admin` | `pnpm test` | 9 | 71 | 0 | 0 | PASS |
| `apps/storefront-web` | `pnpm test` | 16 | 162 | 0 | 0 | PASS |
| `apps/shell` | — (không có script `test`) | 0 | — | — | — | N/A — không có test files (đã verify bằng find) |
| `apps/_skeleton-remote` | — (không có script `test`) | 0 | — | — | — | N/A — không có test files (đã verify bằng find) |

Chi tiết từng file thấy xanh (trích vitest run từng package):

- **ui-kit**: `tokens.test.ts` (14) · `useReveal` (5) · `pagination` (3) · `stepper` (5) · `tabs` (6) · `uiKit` (49) · `overlay` (7)
- **i18n**: `i18n.test.ts` (6)
- **contracts**: `client.test.ts` (6)
- **config**: `vite-preset.test.mjs` (3)
- **auth**: `authStore` (11) · `api` (6)
- **mfe-checkout**: `couponCarry` (4) · `affiliateRef` (4) · `cartApi` (6) · `orderingApi` (7) · `MiniCartDrawer` (6) · `CheckoutPage.validation` (14)
- **mfe-account**: `userMenu` (7) · `wishlistPage` (5) · `ordersPage` (5) · `authValidation` (12) · `profileValidation` (7) · `affiliatePage` (6) · `orderDetail` (10) · `accountLayout` (5) · `myReviews` (4)
- **mfe-admin**: `productForm` (15) · `couponForm` (10) · `guard` (13) · `productPayload` (6) · `orderRules` (4) · `tableSort` (10) · `dataTable` (1) · `logout.smoke` (2) · `mount.smoke` (10)
- **storefront-web**: `wiring` (4) · `plp-params` (26) · `affiliate-cookie` (9) · `unit` (32) · `home-composition` (10) · `pdp` (18) · `search` (15) · `theme` (3) · `i18n` (5) · `addtocart` (2) · `coupons` (4) · `reviews` (5) · `wishlist` (4) · `pdp-tabs` (8) · `catalog-gradient` (15) · `copybutton` (2)

## Token-regression (kết quả explicit)

`frontend/packages/ui-kit/src/__tests__/tokens.test.ts` — **14/14 tests PASSED** (6ms) trong suite ui-kit phía trên.

Test khóa giá trị token qua 5 lần merge (gồm 3 giá trị dark shadow mà SF-1 đổi ở §1.4 kèm test+doc cùng commit) → **không có token drift trên nhánh đích**.

## Failures

**Không có.** 0 failed, 0 skipped trên toàn bộ 9 suite đã chạy.

## Tổng kết

- **9/9 packages có test: XANH.** Tổng cộng **52 test files / 456 tests** — 456 passed, 0 failed, 0 skipped.
- `apps/shell` và `apps/_skeleton-remote` không có script `test` và không có test file nào (không bịa test).
- Ghi chú lệch so với spec (fi390-sf-6.md mục 8 ước "27 file"): thực tế là **52 file test** trên **9 packages** (5 apps + 4 packages ngoài spec: `contracts`, `config`, `auth` cũng có vitest). Số file tăng do các SF trong epic bổ sung test dần (mfe-admin 9, storefront-web 16, mfe-account 9…). Đây là **mở rộng phạm vi test, không phải thiếu** — spec mục tiêu "XANH trên nhánh đích" vẫn đạt và dư.

## Kết luận cuối

**PASS — Unit tests toàn monorepo XANH trên nhánh đích (52 files / 456 tests / 0 fail / 0 skip), token-regression 14/14 PASS.**
