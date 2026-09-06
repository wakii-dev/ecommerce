// lib/api.ts — clients LIVE (contracts) + toggle stub.
//
// LIVE LUÔN (kể cả stub ON): catalog admin products/categories + inventory
// low-stock (backend có từ T2). MOCK khi isStubOn(): coupons/reviews/orders/
// stats (ordering + moderation chưa có ở T3 — pack chốt mock-gate, SF-10 wire).
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

/** Stub ON mặc định; `VITE_ADMIN_STUB=0` tắt (SF-10 wire live sẽ bỏ hẳn). */
export function isStubOn(): boolean {
  return import.meta.env.VITE_ADMIN_STUB !== '0';
}

// Stub SINGLETON — mutations in-memory phải sống qua renders/navigation trong
// session (reload reset — chấp nhận cho mock tới SF-10).
import { createStubApi, type StubApi } from './adminStub';

let stubInstance: StubApi | null = null;

export function stubApi(): StubApi {
  stubInstance ??= createStubApi();
  return stubInstance;
}
