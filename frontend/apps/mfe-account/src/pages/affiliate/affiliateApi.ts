// pages/affiliate/affiliateApi.ts — slice SF-12 (CHỈ files pages/affiliate/*).
// Client dựng từ @ecommerce/contracts (createAffiliateClient — contract
// affiliate.yaml freeze SF-2) + authStore (fetchImpl = authStore.fetch → 401
// tự refresh + retry, pattern ordersApi SF-9). Types mirror runtime JSON của
// contract — packages/contracts không export schema types nên type đặt tại đây.
import { authStore } from '@ecommerce/auth';
import { createAffiliateClient, type ApiClientOptions } from '@ecommerce/contracts';

export type AffiliateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface AffiliateStats {
  clicks: number;
  conversions: number;
  earnings: number;
}

export interface AffiliateProfile {
  id: string;
  /** Ref code — null cho đến khi APPROVED (contract). */
  code: string | null;
  status: AffiliateStatus;
  rate: number;
  stats: AffiliateStats;
}

export interface LedgerEntry {
  id: string;
  orderId: string;
  orderTotal: number;
  rate: number;
  commission: number;
  status: 'PENDING' | 'CONFIRMED';
  createdAt: string;
}

export interface LedgerPage {
  items: LedgerEntry[];
  page: number;
  size: number;
  total: number;
}

export interface RegisterInput {
  portfolioUrl?: string;
  note?: string;
}

export function createClient() {
  return createAffiliateClient({
    baseURL: '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init),
  } satisfies ApiClientOptions);
}

export function fetchProfile() {
  return createClient().getMyAffiliateProfile({}) as unknown as Promise<AffiliateProfile>;
}

export function fetchLedger(page = 1) {
  return createClient().listMyLedger({ page }) as unknown as Promise<LedgerPage>;
}

export function registerAffiliate(input: RegisterInput) {
  return createClient().registerAffiliate({ portfolioUrl: input.portfolioUrl, note: input.note }) as unknown as Promise<{
    id: string;
    status: AffiliateStatus;
  }>;
}
