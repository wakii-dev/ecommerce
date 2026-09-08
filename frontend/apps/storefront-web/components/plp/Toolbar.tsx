import type { Locale } from '../../lib/format';
import { tParams } from '../../lib/i18n';
import type { PlpQuery } from '../../lib/plp-params';
import SortSelect from './SortSelect';

/**
 * Toolbar PLP §2.4: "N sản phẩm" 13px trái + sort select phải,
 * border-bottom dưới toolbar.
 *
 * View-toggle (grid/list 32×30) — SKIP: storefront chỉ có 1 view grid
 * (YAGNI — Task 12 quyết, note cho reviewer).
 */
export interface ToolbarProps {
  total: number;
  locale: Locale;
  query: PlpQuery;
}

export default function Toolbar({ total, locale, query }: ToolbarProps) {
  return (
    <div className="plp-toolbar">
      <span className="plp-results">
        {tParams(locale, 'plp.productsCount', { n: total })}
      </span>
      <SortSelect value={query.sort} locale={locale} />
    </div>
  );
}
