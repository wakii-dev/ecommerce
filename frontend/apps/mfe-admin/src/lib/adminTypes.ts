// lib/adminTypes.ts — derive types LIVE từ contracts clients (không lặp shape
// generated — contracts là nguồn duy nhất, index.ts export SuccessOf/ServiceMethod).

import type { CatalogClient, InventoryClient } from '@ecommerce/contracts';

type Res<M> = M extends (...args: never[]) => unknown ? Awaited<ReturnType<M>> : never;

/** ProductAdminItemPage — list admin (ProductCard + status + slugVi). */
export type AdminProductItemPage = Res<CatalogClient['adminListProducts']>;
export type AdminProductItem = NonNullable<AdminProductItemPage['items'][number]>;

/** Detail admin (ProductAdminView = ProductDetail + status + i18n gốc). */
export type AdminProductView = NonNullable<Res<CatalogClient['adminGetProduct']>>;

/** Cây CategoryAdmin (Category + nameI18n/slugVi) — root list, children đệ quy. */
export type AdminCategoryNode = Res<CatalogClient['adminListCategories']>[number];

/** ReviewAdminPage + ReviewAdmin. */
export type AdminReviewPage = Res<CatalogClient['adminListReviews']>;
export type AdminReviewItem = NonNullable<AdminReviewPage['items'][number]>;

/** LowStockItem. */
export type LowStockRow = Res<InventoryClient['listLowStock']>[number];
