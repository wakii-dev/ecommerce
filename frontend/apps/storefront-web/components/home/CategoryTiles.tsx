import { categoryGradient, type Category } from '../../lib/catalog-api';
import { localePath, type Locale } from '../../lib/format';

/**
 * Category tiles (direction §2.2.3) — grid 6 cột (≤900px: 3), tile gradient
 * nhạt theo danh mục (§1.8 qua categoryGradient) + emoji + tên, hover
 * translateY(-2px); tile "Xem thêm" viền dashed (placeholder '#' — PLP tất
 * cả sản phẩm chưa tồn tại đến Task 12).
 *
 * Public CategoryDto KHÔNG có icon (seed backend có nhưng không expose) →
 * emoji map theo slug gốc (khớp icon seed), thiếu → cycle theo vị trí.
 */

const EMOJI_BY_SLUG: ReadonlyArray<readonly [RegExp, string]> = [
  [/^dien-tu\b|^electronics\b/, '⚡'],
  [/^thoi-trang\b|^fashion\b/, '👕'],
  [/^nha-cua\b|^home\b/, '🏠'],
  [/^sach\b|^books?\b/, '📚'],
  [/^lam-dep\b|^beauty\b/, '💄'],
  [/^me-va-be\b|^mom-baby\b/, '🍼'],
];

const EMOJI_CYCLE = ['⚡', '👕', '🏠', '📚', '💄', '🍼'] as const;

function emojiFor(slug: string, index: number): string {
  for (const [pattern, emoji] of EMOJI_BY_SLUG) {
    if (pattern.test(slug)) return emoji;
  }
  return EMOJI_CYCLE[index % EMOJI_CYCLE.length] ?? '⚡';
}

export default function CategoryTiles({ categories, locale }: { categories: Category[]; locale: Locale }) {
  if (categories.length === 0) return null;

  return (
    <section className="cat-section" aria-label="Danh mục nổi bật">
      <div className="cat-grid">
        {categories.map((category, index) => (
          <a
            key={category.id}
            className="cat-tile"
            href={localePath(`/c/${category.slug}`, locale)}
            style={{ background: categoryGradient(category.slug) }}
          >
            <span className="cat-icon" aria-hidden="true">
              {emojiFor(category.slug, index)}
            </span>
            <span className="cat-name">{category.name}</span>
          </a>
        ))}
        {/* Trang "tất cả danh mục" chưa có → /search là surface duyệt chung
            (empty-q có gợi ý từ khóa, không phải dead end). */}
        <a className="cat-tile cat-tile--more" href={localePath('/search', locale)}>
          {locale === 'en' ? 'See more →' : 'Xem thêm →'}
        </a>
      </div>
    </section>
  );
}
