// pages/affiliate/loyaltyApi.ts — slice SF-14 (FI-324, D22): điểm loyalty.
// Endpoint ADDITIVE của affiliate-service (GET /api/affiliate/me/loyalty —
// không nằm trong affiliate.yaml frozen, precedent suspend/reactivate SF-12)
// → gọi qua executeRequest với RouteDef cục bộ, KHÔNG sửa packages/contracts.
import { authStore } from '@ecommerce/auth';
import { executeRequest, type ApiClientOptions, type RouteDef } from '@ecommerce/contracts';

const MY_LOYALTY_ROUTE: RouteDef = ['GET', '/api/affiliate/me/loyalty'];

export interface LoyaltyAccount {
  userId: string;
  /** Điểm hiện có (1 điểm = 100đ khi dùng ở checkout). */
  balance: number;
  totalEarned: number;
}

function options(): ApiClientOptions {
  return {
    baseURL: '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

/** GET /api/affiliate/me/loyalty — balance + tổng đã nhận (account dashboard). */
export function fetchMyLoyalty(): Promise<LoyaltyAccount> {
  return executeRequest(options(), MY_LOYALTY_ROUTE, {}) as unknown as Promise<LoyaltyAccount>;
}
