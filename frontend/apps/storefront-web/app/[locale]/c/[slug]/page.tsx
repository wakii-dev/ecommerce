import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Pagination from '../../../../components/plp/Pagination';
import Sidebar from '../../../../components/plp/Sidebar';
import Toolbar from '../../../../components/plp/Toolbar';
import ProductCardView from '../../../../components/ProductCardView';
import { EmptyState } from '../../../../components/ui-kit';
import { catalogApi, CatalogUnavailableError, type Category, type ProductCardPage } from '../../../../lib/catalog-api';
import { localePath, resolveLocale, type Locale } from '../../../../lib/format';
import { buildAlternates } from '../../../../lib/seo';
import {
  filtersToApiParams,
  parsePlpSearchParams,
  PLP_PAGE_SIZE,
  resolveCategoryPath,
  type RawSearchParams,
} from '../../../../lib/plp-params';

/**
 * PLP SSR (plan Task 12) — URL params = state (SEO friendly, server-rendered,
 * KHÔNG client fetch cho results): sidebar filter + sort + pagination.
 *
 * fetch: 1 listProducts(category=slug) + 1 getCategories (sidebar + breadcrumb
 * path). API là nguồn chân lý: category accept slug vi HOẶC en; slug lạ → API
 * trả trang RỖNG (không 404) → render empty state "Không tìm thấy sản phẩm
 * phù hợp"; category thiếu trong tree (dữ liệu lệch) → vẫn render bình thường,
 * breadcrumb fallback sang text slug. Catalog down → EmptyState degraded.
 */

interface CategoryPageProps {
  params: { locale: string; slug: string };
  /** Next 14: object thuần (không Promise) — parse ở lib/plp-params. */
  searchParams: RawSearchParams;
}

/**
 * Canonical LUÔN là /c/{slug} sạch (không page/sort/filter): mọi biến thể
 * filter/phân trang là variations của cùng danh mục — gom tín hiệu về 1 URL
 * (lựa chọn đơn giản, ghi nhận ở đây; có thể mở rộng canonical theo page khi
 * cần SEO sâu hơn).
 */
export async function generateMetadata({ params }: { params: { locale: string; slug: string } }): Promise<Metadata> {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  let name = params.slug;
  let slugVi = params.slug;
  let slugEn = params.slug;
  try {
    const path = resolveCategoryPath(await catalogApi(locale).getCategories(), params.slug);
    if (path) {
      const node = path[path.length - 1] as Category;
      name = node.name;
      slugVi = node.slug;
      slugEn = node.slugEn;
    }
  } catch {
    // Catalog down → title fallback = slug, không crash render metadata.
  }

  return {
    // Template `%s | Shop VN` của layout → "Điện Tử | Shop VN".
    title: name,
    alternates: {
      canonical: localePath(`/c/${locale === 'en' ? slugEn : slugVi}`, locale), // khớp hreflang en (review nhóm 6)
      // en URL luôn có prefix /en (middleware: /en/* pass, /c/* rewrite sang vi).
      // Khi tree không resolve được (catalog down) slugEn fallback = slug —
      // /en/c/{slug} vẫn render được (API accept slug vi lẫn en).
      languages: buildAlternates(`/c/${slugVi}`, `/en/c/${slugEn}`).languages,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  const query = parsePlpSearchParams(searchParams);
  const basePath = localePath(`/c/${params.slug}`, locale);

  let page: ProductCardPage | null = null;
  let tree: Category[] = [];
  let catalogDown = false;

  try {
    const api = catalogApi(locale);
    const [products, categories] = await Promise.all([
      api.listProducts({
        category: params.slug,
        ...filtersToApiParams(query.filters),
        sort: query.sort,
        page: query.page,
        size: PLP_PAGE_SIZE,
      }),
      api.getCategories(),
    ]);
    page = products;
    tree = categories;
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
    catalogDown = true;
  }

  if (catalogDown) {
    return (
      <div className="container plp">
        <Breadcrumb locale={locale} name={params.slug} homeLabel={locale === 'en' ? 'Home' : 'Trang chủ'} />
        <div className="plp-head">
          <h1 className="plp-title">{params.slug}</h1>
        </div>
        <EmptyState
          icon="🛠️"
          title="Catalog tạm thời không khả dụng"
          description={
            locale === 'en'
              ? 'The catalog is temporarily unavailable — please try again in a few minutes.'
              : 'Hệ thống đang bận — vui lòng thử lại sau ít phút.'
          }
        />
      </div>
    );
  }

  // page ở đây chắc chắn non-null (catalog up) — assert cho TS.
  const data = page as ProductCardPage;
  const path = resolveCategoryPath(tree, params.slug);
  const node = path ? (path[path.length - 1] as Category) : null;
  const name = node?.name ?? params.slug;
  const totalPages = Math.max(1, Math.ceil(data.total / PLP_PAGE_SIZE));

  return (
    <div className="container plp">
      <Breadcrumb locale={locale} name={name} homeLabel={locale === 'en' ? 'Home' : 'Trang chủ'} />

      <div className="plp-head">
        <h1 className="plp-title">{name}</h1>
        <span className="plp-count">
          {locale === 'en' ? `${data.total} products` : `${data.total} sản phẩm`}
        </span>
      </div>

      <div className="plp-layout">
        <Sidebar
          locale={locale}
          basePath={basePath}
          query={query}
          tree={tree}
          activeIds={new Set(path?.map((item) => item.id) ?? [])}
        />

        <div className="plp-main">
          {data.items.length === 0 ? (
            <EmptyState
              icon="🔍"
              title={locale === 'en' ? 'No matching products found' : 'Không tìm thấy sản phẩm phù hợp'}
              description={
                locale === 'en'
                  ? 'Try removing some filters or browsing another category.'
                  : 'Thử bỏ một vài bộ lọc hoặc xem danh mục khác nhé.'
              }
              action={
                <a className="plp-clear-all" href={basePath}>
                  {locale === 'en' ? 'Clear all' : 'Xóa tất cả'}
                </a>
              }
            />
          ) : (
            <>
              <Toolbar total={data.total} locale={locale} query={query} />
              <div className="plp-grid">
                {data.items.map((product) => (
                  <ProductCardView
                    key={product.id}
                    product={product}
                    locale={locale}
                    gradientKey={node?.slug}
                  />
                ))}
              </div>
              <Pagination basePath={basePath} query={query} totalPages={totalPages} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Breadcrumb({ locale, name, homeLabel }: { locale: Locale; name: string; homeLabel: string }) {
  return (
    <nav className="plp-breadcrumb" aria-label="Breadcrumb">
      <a href={localePath('/', locale)}>{homeLabel}</a>
      <span className="plp-breadcrumb-sep" aria-hidden="true">
        ›
      </span>
      <span className="plp-breadcrumb-current">{name}</span>
    </nav>
  );
}
