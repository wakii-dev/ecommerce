import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ProductCardView from '../../components/ProductCardView';
import CategoryTiles from '../../components/home/CategoryTiles';
import FlashDealSection from '../../components/home/FlashDealSection';
import HeroCarousel from '../../components/home/HeroCarousel';
import RecentlyViewed from '../../components/RecentlyViewed';
import { EmptyState } from '../../components/ui-kit';
import { catalogApi, CatalogUnavailableError, type Category, type ProductCard } from '../../lib/catalog-api';
import { localePath, resolveLocale } from '../../lib/format';
import { rootCategories, splitFlashAndFeatured } from '../../lib/home-composition';
import { homeMetadata } from '../../lib/seo';

/**
 * Home SSR (plan Task 11) — 1 call listProducts(sort=discount, size=24) +
 * getCategories; flash rail ≤10, featured grid ≤8 (lib/home-composition).
 * Catalog down → EmptyState degraded, KHÔNG crash RSC (Task 10 convention).
 */

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale = resolveLocale(params.locale);
  return homeMetadata(locale ?? 'vi');
}

export default async function HomePage({ params }: { params: { locale: string } }) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  let flash: ProductCard[] = [];
  let featured: ProductCard[] = [];
  let categories: Category[] = [];
  let catalogDown = false;

  try {
    const api = catalogApi(locale);
    const [products, categoryTree] = await Promise.all([
      api.listProducts({ size: 24, sort: 'discount', page: 1 }),
      api.getCategories(),
    ]);
    const sections = splitFlashAndFeatured(products.items);
    flash = sections.flash;
    featured = sections.featured;
    categories = rootCategories(categoryTree);
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
    catalogDown = true;
  }

  if (catalogDown) {
    // Hero vẫn render (content tĩnh, không cần catalog); các section cần data
    // → EmptyState degraded thay vì crash/blank (Task 10 convention).
    return (
      <div className="container home">
        <HeroCarousel locale={locale} />
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

  return (
    <div className="container home">
      <HeroCarousel locale={locale} />

      {flash.length > 0 ? <FlashDealSection items={flash} locale={locale} /> : null}

      {categories.length > 0 ? <CategoryTiles categories={categories} locale={locale} /> : null}

      {featured.length > 0 ? (
        <section className="featured" aria-label="Gợi ý hôm nay">
          <div className="featured-head">
            <div className="featured-head-left">
              <span className="section-bar" aria-hidden="true" />
              <h2 className="section-title">{locale === 'en' ? 'Picked for today' : 'Gợi ý hôm nay'}</h2>
            </div>
            {/* E7d: dead link '#' → PLP danh mục gốc đầu theo sort=discount (đúng
                ngôn ngữ "gợi ý giảm giá"). Route toàn sàn chưa có — khi có thì
                trỏ đó thay thế. */}
            {categories.length > 0 ? (
              <a
                className="featured-more"
                href={localePath(`/c/${categories[0]?.slug}?sort=discount`, locale)}
              >
                {locale === 'en' ? 'See more' : 'Xem thêm'}
              </a>
            ) : null}
          </div>
          <div className="featured-grid">
            {featured.map((product) => (
              <ProductCardView key={product.id} product={product} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}

      {/* SF-13 A6a: "Đã xem gần đây" — client island đọc localStorage; ẩn khi trống */}
      <RecentlyViewed locale={locale} />
    </div>
  );
}
