// lib/api.ts — clients LIVE (contracts) — SF-10 wire toàn bộ, BỎ stub gate.
//
// SF-7 mock-gate (orders/coupons/reviews/stats) đã được SF-10 thay bằng
// orderingApi()/catalogApi() thật trên từng page; pure helpers §3.6
// (canShip/canDeliver/canCancel) sống ở lib/orderRules.ts (SF-3 tách khỏi
// adminStub — file mock đã XOÁ) và re-export dưới đây cho chỗ dùng chung.
//
// KHÔNG cache client (pattern packages/auth api.ts): configureAuth có thể đổi
// giữa các test — dựng per-call, object rẻ.

import { authStore } from '@ecommerce/auth';
import {
  createCatalogClient,
  createInventoryClient,
  createOrderingClient,
  type ApiClientOptions,
  type CatalogClient,
  type InventoryClient,
  type OrderingClient
} from '@ecommerce/contracts';

function adminClientOptions(): ApiClientOptions {
  const config = authStore.getConfig();
  return {
    baseURL: config.identityBaseUrl ?? '',
    getToken: () => authStore.getToken(),
    // 401 → single-flight refresh → retry (AuthStore.fetch).
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

export function catalogApi(): CatalogClient {
  return createCatalogClient(adminClientOptions());
}

export function inventoryApi(): InventoryClient {
  return createInventoryClient(adminClientOptions());
}

export function orderingApi(): OrderingClient {
  return createOrderingClient(adminClientOptions());
}

// §3.6 pure helpers (SF-3): luật chuyển trạng thái đơn — file mock gốc đã xoá.
export { canCancel, canDeliver, canShip } from './orderRules';
