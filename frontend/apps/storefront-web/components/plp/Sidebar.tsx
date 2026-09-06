import type { Category } from '../../lib/catalog-api';
import { localePath, type Locale } from '../../lib/format';
import {
  buildPlpUrl,
  PRICE_PRESETS,
  withFilters,
  type PlpQuery,
} from '../../lib/plp-params';

/**
 * Sidebar PLP §2.4 — `256px` cột trái, các block ngăn cách border-bottom:
 * (1) cây danh mục (roots 14px/600, active = primary 700 + border-left 2px
 * primary, link đổi category giữ nguyên filters); (2) khoảng giá — preset
 * single-select render dưới dạng LINK có hộp checkbox (URL-driven, SEO
 * friendly, hoạt động không JS — kiểm lại param cũ = bỏ); (3) đánh giá 4★+/3★+;
 * (4) thương hiệu — GET form (hidden inputs giữ params hiện có, server render
 * lại kết quả); cuối: "Xóa tất cả" outline primary full-width.
 */

export interface SidebarProps {
  locale: Locale;
  /** Path tuyệt đối của danh mục hiện tại (/c/{slug} theo locale) — action form. */
  basePath: string;
  query: PlpQuery;
  tree: Category[];
  /** Path [gốc, …, node] của danh mục hiện tại (resolve từ tree) — tô active. */
  activeIds: ReadonlySet<string>;
}

export default function Sidebar({ locale, basePath, query, tree, activeIds }: SidebarProps) {
  const en = locale === 'en';
  const priceHref = (key: string | undefined) => buildPlpUrl(basePath, withFilters(query, { price: key }));
  const ratingHref = (value: number | undefined) => buildPlpUrl(basePath, withFilters(query, { rating: value }));

  return (
    <aside className="plp-aside">
      <nav className="plp-block plp-tree" aria-label={en ? 'Categories' : 'Danh mục'}>
        <h3 className="plp-block-title">{en ? 'Categories' : 'Danh mục'}</h3>
        {tree.map((root) => (
          <div key={root.id}>
            <a
              className={`plp-tree-root${activeIds.has(root.id) ? ' is-active' : ''}`}
              href={buildPlpUrl(localePath(`/c/${root.slug}`, locale), query)}
            >
              {root.name}
            </a>
            {root.children.length > 0 ? (
              <div className="plp-tree-children">
                {root.children.map((child) => (
                  <a
                    key={child.id}
                    className={`plp-tree-child${activeIds.has(child.id) ? ' is-active' : ''}`}
                    href={buildPlpUrl(localePath(`/c/${child.slug}`, locale), query)}
                  >
                    {child.name}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="plp-block">
        <h3 className="plp-block-title">{en ? 'Price range' : 'Khoảng giá'}</h3>
        {PRICE_PRESETS.map((preset) => {
          const checked = query.filters.price === preset.key;
          return (
            <a
              key={preset.key}
              className={`plp-check${checked ? ' is-checked' : ''}`}
              href={priceHref(checked ? undefined : preset.key)}
            >
              <span className="plp-check-box" aria-hidden="true">
                {checked ? '✓' : ''}
              </span>
              {preset.label[locale]}
            </a>
          );
        })}
      </div>

      <div className="plp-block">
        <h3 className="plp-block-title">{en ? 'Rating' : 'Đánh giá'}</h3>
        {[4, 3].map((stars) => {
          const checked = query.filters.rating === stars;
          return (
            <a
              key={stars}
              className={`plp-check${checked ? ' is-checked' : ''}`}
              href={ratingHref(checked ? undefined : stars)}
            >
              <span className="plp-check-box" aria-hidden="true">
                {checked ? '✓' : ''}
              </span>
              <span className="plp-check-stars">{'★'.repeat(stars)}</span>
              {en ? ' & up' : ' trở lên'}
            </a>
          );
        })}
      </div>

      <div className="plp-block">
        <h3 className="plp-block-title">{en ? 'Brand' : 'Thương hiệu'}</h3>
        <form className="plp-brand" method="get" action={basePath}>
          {/* GET form giữ các filter hiện có (URL = state); page luôn reset. */}
          {query.filters.price !== undefined ? (
            <input type="hidden" name="price" value={query.filters.price} />
          ) : null}
          {query.filters.rating !== undefined ? (
            <input type="hidden" name="rating" value={String(query.filters.rating)} />
          ) : null}
          {query.sort !== 'newest' ? <input type="hidden" name="sort" value={query.sort} /> : null}
          <input
            className="plp-brand-input"
            type="text"
            name="brand"
            defaultValue={query.filters.brand}
            placeholder={en ? 'Brand name…' : 'Tên thương hiệu…'}
            aria-label={en ? 'Brand' : 'Thương hiệu'}
          />
          <button className="plp-brand-btn" type="submit">
            {en ? 'Apply' : 'Áp dụng'}
          </button>
        </form>
      </div>

      <a className="plp-clear-all" href={basePath}>
        {en ? 'Clear all' : 'Xóa tất cả'}
      </a>
    </aside>
  );
}
