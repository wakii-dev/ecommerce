/**
 * Home composition (plan Task 11) — chia 1 call listProducts(sort=discount,
 * size=24) thành 2 section: flash rail (đang flash sale, ≤10) + featured grid
 * (còn lại, sort rating desc → count desc, ≤8). Pure — unit test được
 * (verify KHÔNG cần catalog live).
 *
 * Convention T3: `flashSaleEndsAt` chỉ xuất hiện khi flash sale ĐANG active
 * (API đã lọc theo now) — đủ presence check, không tự so `> now` (clock skew
 * server/client).
 */
import type { Category, ProductCard } from './catalog-api';

export interface HomeSections {
  /** Rail flash sale — giữ thứ tự API (sort=discount), tối đa 10. */
  flash: ProductCard[];
  /** Grid đề xuất — ratingAvg desc rồi ratingCount desc (tie-break), tối đa 8. */
  featured: ProductCard[];
}

const FLASH_RAIL_MAX = 10;
const FEATURED_MAX = 8;

export function splitFlashAndFeatured(items: readonly ProductCard[]): HomeSections {
  const flash = items.filter((product) => Boolean(product.flashSaleEndsAt)).slice(0, FLASH_RAIL_MAX);
  const featured = items
    .filter((product) => !product.flashSaleEndsAt)
    .sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount)
    .slice(0, FEATURED_MAX);
  return { flash, featured };
}

/**
 * Mốc endsAt sớm nhất của rail → Countdown của section (flash kết thúc sớm
 * nhất = mốc hiển thị chung). ISO so bằng epoch (format có thể lệch độ dài).
 * Rỗng → undefined (section không render countdown).
 */
export function earliestFlashEndsAt(items: readonly ProductCard[]): string | undefined {
  let earliest: number | undefined;
  let earliestIso: string | undefined;
  for (const product of items) {
    const iso = product.flashSaleEndsAt;
    if (!iso) continue;
    const epoch = Date.parse(iso);
    if (Number.isNaN(epoch)) continue;
    if (earliest === undefined || epoch < earliest) {
      earliest = epoch;
      earliestIso = iso;
    }
  }
  return earliestIso;
}

/** Tile danh mục dùng node gốc (children không lên home — 6 cột §2.2.3). */
export function rootCategories(categories: readonly Category[]): Category[] {
  return categories.filter((category) => category.parentId == null);
}
