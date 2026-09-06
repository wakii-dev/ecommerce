import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/partner-apiSchema';

// X-API-Key không phải parameter trong spec mà là securityScheme (ApiKeyAuth) —
// truyền qua `opts.headers` khi tạo client: { headers: { 'X-API-Key': '...' } }.
const routes = {
  listPartnerProducts: ['GET', '/open-api/v1/products'],
  getPartnerProduct: ['GET', '/open-api/v1/products/{id}'],
  listPartnerCategories: ['GET', '/open-api/v1/categories'],
  searchPartnerProducts: ['GET', '/open-api/v1/search'],
  createPartnerOrder: ['POST', '/open-api/v1/orders'],
  getPartnerOrder: ['GET', '/open-api/v1/orders/{id}'],
} as const satisfies RouteMap;

export type PartnerApiClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createPartnerApiClient(opts: ApiClientOptions): PartnerApiClient {
  return createServiceClient<PartnerApiClient>(opts, routes);
}
