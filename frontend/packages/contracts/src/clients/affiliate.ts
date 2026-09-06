import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/affiliateSchema';

const routes = {
  registerAffiliate: ['POST', '/api/affiliate/register'],
  getMyAffiliateProfile: ['GET', '/api/affiliate/me'],
  listMyLedger: ['GET', '/api/affiliate/me/ledger'],
  trackClick: ['POST', '/api/affiliate/track/click'],
  listAffiliates: ['GET', '/api/affiliate/admin/affiliates'],
  approveAffiliate: ['POST', '/api/affiliate/admin/affiliates/{id}/approve'],
  rejectAffiliate: ['POST', '/api/affiliate/admin/affiliates/{id}/reject'],
  updateAffiliateRate: ['PUT', '/api/affiliate/admin/affiliates/{id}/rate'],
  getAffiliateStats: ['GET', '/api/affiliate/admin/stats'],
  redeemLoyaltyPoints: ['POST', '/api/affiliate/internal/loyalty/redeem'],
} as const satisfies RouteMap;

export type AffiliateClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createAffiliateClient(opts: ApiClientOptions): AffiliateClient {
  return createServiceClient<AffiliateClient>(opts, routes);
}
