import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Pagination from '../../../components/plp/Pagination';
import ProductCardView from '../../../components/ProductCardView';
import { EmptyState } from '../../../components/ui-kit';
import { catalogApi, CatalogUnavailableError, type ProductCardPage } from '../../../lib/catalog-api';
import { localePath, resolveLocale, type Locale } from '../../../lib/format';
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
    title: q.length > 0 ? q : locale === 'en' ? 'Search' : 'Tìm kiếm',
    robots: { index: false, follow: true },
    alternates: { canonical: localePath('/search', locale) },
  };
}

const COPY: Record<Locale, { h1: string; prompt: string; promptDesc: string; zero: string; zeroDesc: string; tryKeywords: string; down: string }> = {
  vi: {
    h1: 'Tìm kiếm',
    prompt: 'Nhập từ khóa để tìm kiếm',
    promptDesc: 'Gõ tên sản phẩm, thương hiệu hoặc danh mục vào ô tìm kiếm ở trên nhé.',
    zero: 'Không tìm thấy kết quả cho',
    zeroDesc: 'Thử từ khóa khác, hoặc xem gợi ý bên dưới.',
    tryKeywords: 'Gợi ý từ khóa:',
    down: 'Catalog tạm thời không khả dụng',
  },
  en: {
    h1: 'Search',
    prompt: 'Enter a search term',
    promptDesc: 'Type a product, brand or category name in the search box above.',
    zero: 'No results for',
    zeroDesc: 'Try a different keyword, or pick one of the suggestions below.',
    tryKeywords: 'Suggested keywords:',
    down: 'Catalog is temporarily unavailable',
  },
};

export default async function SearchPage({ params, searchParams }: SearchPageProps) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  const t = COPY[locale];
  const { q, page, sort } = parseSearchPageParams(searchParams);
  const basePath = localePath('/search', locale);

  if (q.length === 0) {
    return (
      <div className="container plp">
        <div className="plp-head">
          <h1 className="plp-title">{t.h1}</h1>
        </div>
        <EmptyState icon="🔍" title={t.prompt} description={t.promptDesc} />
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
          <h1 className="plp-title">{t.h1}</h1>
        </div>
        <EmptyState
          icon="🛠️"
          title={t.down}
          description={
            locale === 'en'
              ? 'The catalog is temporarily unavailable — please try again in a few minutes.'
              : 'Hệ thống đang bận — vui lòng thử lại sau ít phút.'
          }
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PLP_PAGE_SIZE));

  return (
    <div className="container plp">
      <div className="plp-head">
        <h1 className="plp-title">
          {locale === 'en' ? `Results for "${q}"` : `Kết quả cho "${q}"`}
        </h1>
        <span className="plp-count">
          {locale === 'en' ? `${data.total} products` : `${data.total} sản phẩm`}
        </span>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={`${t.zero} "${q}"`}
          description={t.zeroDesc}
          action={
            <span className="search-keywords">
              {t.tryKeywords}{' '}
              {SEARCH_SUGGESTED_KEYWORDS[locale].map((keyword) => (
                <a key={keyword} className="search-keyword-chip" href={`${basePath}?q=${encodeURIComponent(keyword)}`}>
                  {keyword}
                </a>
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
