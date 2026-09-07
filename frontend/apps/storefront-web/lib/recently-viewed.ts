/**
 * "Đã xem gần đây" (SF-13 A6a) — localStorage `recently_viewed`, max 12,
 * dedupe theo slug, newest-first. Snapshot đủ để render card mini KHÔNG cần
 * fetch lại (home/PDP đọc đồng bộ). Parse lỗi/quota → dữ liệu rỗng, không crash.
 */

export interface RecentlyViewedItem {
  slug: string;
  slugEn: string;
  name: string;
  price: number;
  comparePrice: number | null;
  discountPercent: number | null;
  image: string;
  at: number;
}

/** Input khi track — field nullable có thể undefined (tùy nguồn data). */
export type RecentlyViewedInput = Omit<RecentlyViewedItem, 'comparePrice' | 'discountPercent' | 'at'> & {
  comparePrice?: number | null;
  discountPercent?: number | null;
};

const KEY = 'recently_viewed';
const MAX = 12;

export function readRecentlyViewed(): RecentlyViewedItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentlyViewedItem =>
        typeof item === 'object' && item !== null && typeof (item as RecentlyViewedItem).slug === 'string'
    );
  } catch {
    return [];
  }
}

/** Ghi 1 lượt xem — unshift + dedupe slug, cắt max 12; undefined → null. */
export function trackRecentlyViewed(item: RecentlyViewedInput): void {
  try {
    const normalized: RecentlyViewedItem = {
      ...item,
      comparePrice: item.comparePrice ?? null,
      discountPercent: item.discountPercent ?? null,
      at: Date.now()
    };
    const rest = readRecentlyViewed().filter((r) => r.slug !== normalized.slug);
    const next = [normalized, ...rest].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage đầy/chế độ riêng tư — bỏ qua, không ảnh hưởng PDP
  }
}
