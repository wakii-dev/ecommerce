import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ProductCardView from '../../components/ProductCardView';
import Reveal from '../../components/Reveal';
import CategoryTiles from '../../components/home/CategoryTiles';
import FlashDealSection from '../../components/home/FlashDealSection';
import HeroCarousel from '../../components/home/HeroCarousel';
import RecentlyViewed from '../../components/RecentlyViewed';
import { EmptyState } from '../../components/ui-kit';
import { catalogApi, CatalogUnavailableError, type Category, type ProductCard } from '../../lib/catalog-api';
import { localePath, resolveLocale } from '../../lib/format';
import { t } from '../../lib/i18n';
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
    // Title giữ nguyên văn hiện có (cả 2 locale đang render chuỗi vi — không
    // đổi output trong T12; unify en là fix riêng nếu muốn).
    return (
      <div className="container home">
        <HeroCarousel locale={locale} />
        <EmptyState
          icon="🛠️"
          title="Catalog tạm thời không khả dụng"
          description={t(locale, 'common.busy')}
        />
      </div>
    );
  }

  return (
    <div className="container home">
      <HeroCarousel locale={locale} />

      {/* Scroll-reveal CHỈ home (§5.5) — Reveal wrapper client, SSR/no-JS/reduced-motion
          → content hiện sẵn. Featured stagger 70ms×index cap 5 card đầu (§3.2); grid
          còn lại dưới fold → delay 0. */}
      {flash.length > 0 ? (
        <Reveal>
          <FlashDealSection items={flash} locale={locale} />
        </Reveal>
      ) : null}

      {categories.length > 0 ? (
        <Reveal>
          <CategoryTiles categories={categories} locale={locale} />
        </Reveal>
      ) : null}

      {featured.length > 0 ? (
        <section className="featured" aria-label={t(locale, 'home.featuredTitle')}>
          <Reveal className="featured-head">
            <div className="featured-head-left">
              <span className="section-bar" aria-hidden="true" />
              <h3 className="section-title">{t(locale, 'home.featuredTitle')}</h3>
            </div>
            {/* E7d: "Xem thêm" → PLP danh mục gốc đầu theo sort=discount (đúng
                ngôn ngữ "gợi ý giảm giá"; route thật, slug từ API categories). */}
            {categories.length > 0 ? (
              <Link
                className="featured-more"
                href={localePath(`/c/${categories[0]?.slug}?sort=discount`, locale)}
                prefetch={false}
              >
                {t(locale, 'home.seeMore')}
              </Link>
            ) : null}
          </Reveal>
          <div className="featured-grid">
            {featured.map((product, index) => (
              <Reveal key={product.id} className="featured-cell" delayMs={index < 5 ? index * 70 : 0}>
                <ProductCardView product={product} locale={locale} />
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {/* SF-13 A6a: "Đã xem gần đây" — client island đọc localStorage; ẩn khi trống */}
      <RecentlyViewed locale={locale} />
    </div>
  );
}
