import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import Pagination from '../../../components/plp/Pagination';
import ProductCardView from '../../../components/ProductCardView';
import { EmptyState, Icon } from '../../../components/ui-kit';
import { catalogApi, CatalogUnavailableError, type ProductCardPage } from '../../../lib/catalog-api';
import { localePath, resolveLocale } from '../../../lib/format';
import { t, tParams } from '../../../lib/i18n';
import { parseSearchPageParams, SEARCH_SUGGESTED_KEYWORDS } from '../../../lib/search';
import { PLP_PAGE_SIZE, type RawSearchParams } from '../../../lib/plp-params';

/**
 * Trang tìm kiếm SSR (plan Task 14) — URL params = state (q/page/sort), không
 * client fetch cho kết quả: server gọi search() trực tiếp gateway. q rỗng →
 * nhắc nhập từ khóa; 0 kết quả → EmptyState + chips gợi ý từ khóa; catalog
 * down → EmptyState degraded. robots noindex (DECISION Task 14: tránh index
 * bloat — trang search param-space vô hạn).
 */

interface SearchPageProps {
  params: { locale: string };
  /** Next 14: object thuần (không Promise) — parse ở lib/search. */
  searchParams: RawSearchParams;
}

export function generateMetadata({ params, searchParams }: SearchPageProps): Metadata {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  const { q } = parseSearchPageParams(searchParams);
  return {
    title: q.length > 0 ? q : t(locale, 'search.title'),
    robots: { index: false, follow: true },
    alternates: { canonical: localePath('/search', locale) },
  };
}

export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  const { q, page, sort } = parseSearchPageParams(searchParams);
  const basePath = localePath('/search', locale);

  if (q.length === 0) {
    return (
      <div className="container plp">
        <div className="plp-head">
          <h1 className="plp-title">{t(locale, 'search.title')}</h1>
        </div>
        <EmptyState icon={<Icon name="search" size={48} />} title={t(locale, 'search.prompt')} description={t(locale, 'search.promptDesc')} />
      </div>
    );
  }

  let data: ProductCardPage | null = null;
  let catalogDown = false;

  try {
    data = await catalogApi(locale).search(q, { sort, page, size: PLP_PAGE_SIZE });
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
    catalogDown = true;
  }

  if (catalogDown || data === null) {
    return (
      <div className="container plp">
        <div className="plp-head">
          <h1 className="plp-title">{t(locale, 'search.title')}</h1>
        </div>
        <EmptyState
          icon={<Icon name="alert" size={48} />}
          title={t(locale, 'search.down')}
          description={t(locale, 'common.busy')}
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PLP_PAGE_SIZE));

  return (
    <div className="container plp">
      <div className="plp-head">
        <h1 className="plp-title">
          {tParams(locale, 'search.resultsFor', { q })}
        </h1>
        <span className="plp-count">
          {tParams(locale, 'plp.productsCount', { n: data.total })}
        </span>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={`${t(locale, 'search.zero')} "${q}"`}
          description={t(locale, 'search.zeroDesc')}
          action={
            <span className="search-keywords">
              {t(locale, 'search.tryKeywords')}{' '}
              {SEARCH_SUGGESTED_KEYWORDS[locale].map((keyword) => (
                <Link key={keyword} className="search-keyword-chip" href={`${basePath}?q=${encodeURIComponent(keyword)}`}>
                  {keyword}
                </Link>
              ))}
            </span>
          }
        />
      ) : (
        <>
          <div className="plp-grid">
            {data.items.map((product) => (
              <ProductCardView key={product.id} product={product} locale={locale} />
            ))}
          </div>
          <Pagination basePath={basePath} query={{ sort, page, filters: {} }} totalPages={totalPages} extraParams={{ q }} />
        </>
      )}
    </div>
  );
}
