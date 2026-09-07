import { ApiErrorClient, createCatalogClient, type CatalogClient } from '@ecommerce/contracts';

import type { Locale } from './format';

/** Gateway origin — server components fetch trực tiếp (Conventions #10, SF-4). */
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

/** Lỗi bọc mọi failure của reviews fetch — section render degraded thay vì crash RSC. */
export class ReviewsUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Reviews unavailable', { cause });
    this.name = 'ReviewsUnavailableError';
  }
}

/**
 * Review list (public, CHỈ APPROVED) — SSR fetch NO-STORE (spec Q14):
 * moderation approve phải thấy ngay trên PDP, không đợi ISR 60s của product.
 */
export type ReviewList = Awaited<ReturnType<CatalogClient['listProductReviews']>>;

export async function listProductReviews(slug: string, page: number, locale: Locale): Promise<ReviewList> {
  try {
    const client = createCatalogClient({
      baseURL: GATEWAY_URL,
      fetchImpl: (input, init) =>
        globalThis.fetch(input, {
          ...init,
          headers: { ...(init?.headers ?? {}), 'Accept-Language': locale },
          cache: 'no-store',
        }),
    });
    return await client.listProductReviews({ slug, page, size: 5 });
  } catch (error) {
    if (error instanceof ApiErrorClient) throw new ReviewsUnavailableError(error);
    throw new ReviewsUnavailableError(error);
  }
}

/** Tỉ lệ width % cho từng cột breakdown — chuẩn hóa theo sao NHIỀU nhất (đẹp hơn theo tổng). */
export function breakdownPercentages(breakdown: Record<string, number>): Array<{ star: string; count: number; percent: number }> {
  const stars = ['5', '4', '3', '2', '1'];
  const counts = stars.map((star) => ({ star, count: breakdown[star] ?? 0 }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  return counts.map((c) => ({ ...c, percent: Math.round((c.count / max) * 100) }));
}

/** Payload submit — title rỗng → OMIT (contract optional; payload gọn cho test pure). */
export function buildReviewPayload(input: { rating: number; title: string; content: string }): {
  rating: number;
  title?: string;
  content: string;
} {
  const title = input.title.trim();
  return {
    rating: input.rating,
    ...(title ? { title } : {}),
    content: input.content.trim(),
  };
}
