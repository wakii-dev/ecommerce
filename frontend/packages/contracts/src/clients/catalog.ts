import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/catalogSchema';

const routes = {
  listProducts: ['GET', '/api/catalog/products', ['Accept-Language']],
  getProduct: ['GET', '/api/catalog/products/{slug}', ['Accept-Language']],
  listProductReviews: ['GET', '/api/catalog/products/{slug}/reviews'],
  submitProductReview: ['POST', '/api/catalog/products/{slug}/reviews'],
  createStockAlert: ['POST', '/api/catalog/products/{slug}/stock-alert'],
  getCategories: ['GET', '/api/catalog/categories', ['Accept-Language']],
  searchProducts: ['GET', '/api/catalog/search', ['Accept-Language']],
  suggestProducts: ['GET', '/api/catalog/search/suggest', ['Accept-Language']],
  getWishlist: ['GET', '/api/catalog/me/wishlist', ['Accept-Language']],
  getWishlistIds: ['GET', '/api/catalog/me/wishlist/ids'],
  addWishlistItem: ['PUT', '/api/catalog/me/wishlist/{productId}'],
  removeWishlistItem: ['DELETE', '/api/catalog/me/wishlist/{productId}'],
  adminListProducts: ['GET', '/api/catalog/admin/products'],
  adminCreateProduct: ['POST', '/api/catalog/admin/products'],
  adminGetProduct: ['GET', '/api/catalog/admin/products/{id}'],
  adminUpdateProduct: ['PUT', '/api/catalog/admin/products/{id}'],
  adminDeleteProduct: ['DELETE', '/api/catalog/admin/products/{id}'],
  adminListCategories: ['GET', '/api/catalog/admin/categories'],
  adminCreateCategory: ['POST', '/api/catalog/admin/categories'],
  adminGetCategory: ['GET', '/api/catalog/admin/categories/{id}'],
  adminUpdateCategory: ['PUT', '/api/catalog/admin/categories/{id}'],
  adminDeleteCategory: ['DELETE', '/api/catalog/admin/categories/{id}'],
  adminListReviews: ['GET', '/api/catalog/admin/reviews'],
  adminApproveReview: ['POST', '/api/catalog/admin/reviews/{id}/approve'],
  adminRejectReview: ['POST', '/api/catalog/admin/reviews/{id}/reject'],
  uploadAdminImage: ['POST', '/api/catalog/admin/uploads'],
} as const satisfies RouteMap;

export type CatalogClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createCatalogClient(opts: ApiClientOptions): CatalogClient {
  return createServiceClient<CatalogClient>(opts, routes);
}
