import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ProductCardView from '../../../../components/ProductCardView';
import Gallery from '../../../../components/pdp/Gallery';
import PdpBuyBox from '../../../../components/pdp/PdpBuyBox';
import PdpTabs from '../../../../components/pdp/PdpTabs';
import RecentlyViewedTracker from '../../../../components/pdp/RecentlyViewedTracker';
import MyPendingReviewPanel from '../../../../components/reviews/MyPendingReviewPanel';
import ProductReviewsSection from '../../../../components/reviews/ProductReviewsSection';
import WishlistHeart from '../../../../components/wishlist/WishlistHeart';
import { EmptyState, Icon, StarRating } from '../../../../components/ui-kit';
import {
  catalogApi,
  CatalogUnavailableError,
  categoryEmoji,
  categoryGradient,
  discountPercent,
  type Category,
  type ProductCardPage,
  type ProductDetail,
} from '../../../../lib/catalog-api';
import { localePath, resolveLocale } from '../../../../lib/format';
import { t } from '../../../../lib/i18n';
import { categoryPathById, jsonLdFor } from '../../../../lib/pdp';
import { pdpMetadata } from '../../../../lib/seo';
import { siteUrl } from '../../../../lib/site';

/**
 * PDP SSR (plan Task 13) — metadata/JSON-LD/OG server-rendered + gallery/
 * variant/buy-box client (vẫn SSR HTML lần đầu). Distinguish 404 (ApiError
 * status) vs catalog down qua `.status` của CatalogUnavailableError (lib doc).
 * Related (SF-13 A6b): SSR fetch `/related` (ES MLT — ADR 0005) → section
 * ProductCardView sau reviews; rỗng/fail → ẩn. T12: copy trong lib/i18n
 * (miền `pdp`).
 */

interface PdpPageProps {
  params: { locale: string; slug: string };
  /** SF-8: `?reviewPage=N` — pagination reviews section (server-rendered links). */
  searchParams?: { reviewPage?: string };
}

/** Metadata PDP: seoTitle/seoDescription priority + OG + alternates + noindex-en-fallback. */
export async function generateMetadata({ params }: PdpPageProps): Promise<Metadata> {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();

  let product: ProductDetail | null = null;
  let viProduct: ProductDetail | null = null;
  try {
    if (locale === 'en') {
      // en page: fetch THÊM product vi-resolved để so sánh nội dung thật
      // (name+description) phát hiện fallback vi — API trả chuỗi đã resolve
      // theo locale nên không tự biết mình là fallback. CÙNG slug được: public
      // GET match vi lẫn en slug → query vi bằng slugEn trả product vi-content.
      // Cả hai qua cùng client (Next cache revalidate 60) — không tăng tải.
      // vi fetch fail (404/down) → null → ưu tiên indexable: fetch hỏng không
      // phạt SEO (quyết định ghi chú trong lib/seo.ts).
      const [en, vi] = await Promise.all([
        catalogApi(locale).getProduct(params.slug),
        catalogApi('vi')
          .getProduct(params.slug)
          .catch(() => null),
      ]);
      product = en;
      viProduct = vi;
    } else {
      product = await catalogApi(locale).getProduct(params.slug);
    }
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
    // Catalog down → metadata fallback theo slug (page body tự render degraded).
  }

  if (!product) {
    return { title: params.slug };
  }

  const meta = pdpMetadata(product, locale, viProduct);
  const ogImages = product.image.url ? [product.image.url] : undefined;

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: localePath(`/p/${product.slug}`, locale),
      languages: meta.alternates.languages,
    },
    robots: meta.robots,
    openGraph: {
      title: meta.title,
      description: meta.description,
      ...(ogImages ? { images: ogImages } : {}),
    },
  };
}

export default async function ProductPage({ params, searchParams }: PdpPageProps) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();
  const reviewPage = Math.max(1, Number.parseInt(searchParams?.reviewPage ?? '1', 10) || 1);

  let product: ProductDetail | null = null;
  let tree: Category[] = [];
  let related: ProductCardPage | null = null;
  let catalogDown = false;

  try {
    const api = catalogApi(locale);
    const [detail, categories] = await Promise.all([api.getProduct(params.slug), api.getCategories()]);
    product = detail;
    tree = categories;
    // SF-13 A6b: "Sản phẩm tương tự" — best-effort, fail → ẩn section (không vỡ PDP)
    related = await api.related(params.slug, 8).catch(() => null);
  } catch (error) {
    if (!(error instanceof CatalogUnavailableError)) throw error;
    // 404 thật sự (không tìm thấy slug) → trang 404; còn lại = catalog down.
    if (error.status === 404) notFound();
    catalogDown = true;
  }

  if (catalogDown || !product) {
    return (
      <div className="container pdp">
        <nav className="plp-breadcrumb" aria-label="Breadcrumb">
          <Link href={localePath('/', locale)}>{t(locale, 'pdp.home')}</Link>
        </nav>
        <EmptyState icon="🛠️" title={t(locale, 'pdp.unavailable')} description={t(locale, 'pdp.unavailableDesc')} />
      </div>
    );
  }

  const path = categoryPathById(tree, product.categoryId);
  const percent = product.discountPercent ?? discountPercent(product.price, product.comparePrice);
  // Gradient theo slug danh mục cùng vi (slugEn fallback khi en page).
  const gradientKey = locale === 'en' ? (path?.[path.length - 1]?.slugEn ?? product.slugEn) : (path?.[path.length - 1]?.slug ?? product.slug);
  const gradient = categoryGradient(gradientKey);
  const emoji = categoryEmoji(gradientKey);
  const galleryImages = product.images.length > 0 ? product.images : [{ url: '', alt: product.name }];

  const jsonLd = jsonLdFor(
    {
      name: product.name,
      slug: product.slug,
      slugEn: product.slugEn,
      description: product.description,
      brand: product.brand,
      image: product.image,
      price: product.price,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
    },
    locale,
    // Origin không dấu "/" cuối (lib/site) — offers.url = origin + localePath.
    siteUrl(),
  );

  return (
    <div className="container pdp">
      {/* JSON-LD Product schema — stringify + escape `<` → `<` để `</script>`
          trong field admin-enter (name/description/brand...) không thể đóng
          sớm thẻ script (stored XSS). JSON vẫn parse đúng sau revert. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* SF-13 A6a: ghi "đã xem gần đây" (localStorage, max 12) */}
      <RecentlyViewedTracker
        slug={product.slug}
        slugEn={product.slugEn}
        name={product.name}
        price={product.price}
        comparePrice={product.comparePrice ?? null}
        discountPercent={percent}
        image={product.image?.url ?? ''}
      />

      <nav className="plp-breadcrumb" aria-label="Breadcrumb">
        <Link href={localePath('/', locale)}>{t(locale, 'pdp.home')}</Link>
        {(path ?? []).map((node) => (
          <span key={node.id} className="plp-breadcrumb-item">
            <span className="plp-breadcrumb-sep" aria-hidden="true">
              ›
            </span>
            <Link href={localePath(`/c/${locale === 'en' ? node.slugEn : node.slug}`, locale)}>{node.name}</Link>
          </span>
        ))}
        <span className="plp-breadcrumb-sep" aria-hidden="true">
          ›
        </span>
        <span className="plp-breadcrumb-current">{product.name}</span>
      </nav>

      <div className="pdp-layout">
        <Gallery images={galleryImages} name={product.name} gradient={gradient} emoji={emoji} percent={percent} locale={locale} />

        <div className="pdp-info">
          <h1 className="pdp-name">{product.name}</h1>
          <div className="pdp-meta">
            <StarRating value={product.ratingAvg} size="sm" ariaLabel={`${product.name}: ${product.ratingAvg}/5`} />
            {/* T8b (P0-2): count là link anchor #tab-reviews — click → hash →
                PdpTabs activate panel reviews (e2e review-flow click link này) */}
            <a className="pdp-meta-count" href="#tab-reviews">
              {product.ratingCount} {t(locale, 'pdp.reviewsUnit')}
            </a>
            <span className="pdp-meta-sold">
              {t(locale, 'pdp.sold')} {product.ratingCount}
            </span>
            {/* SF-8: wishlist heart — guest → /account (đăng nhập shell) */}
            <WishlistHeart productId={product.id} locale={locale} variant="pdp" />
          </div>

          <PdpBuyBox product={product} locale={locale} />

          {/* T8b: perk icon tròn 30 nền tint-primary (§2.3) — check = Icon
              primitive; ship = inline SVG (catalog 24 names không có truck,
              precedent Header stroke 1.8). Decorative → aria-hidden. */}
          <div className="pdp-perks">
            <span className="pdp-perk">
              <span className="pdp-perk-icon" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
              {t(locale, 'pdp.perkAuth')}
            </span>
            <span className="pdp-perk">
              <span className="pdp-perk-icon" aria-hidden="true">
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="1" y="3" width="15" height="13" />
                  <path d="M16 8h4l3 3v5h-7z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </span>
              {t(locale, 'pdp.perkShip')}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs thật (T8b): primitive Tabs keyboard ←→ + hashchange deep-link;
          panels vẫn SSR sẵn trong HTML, ẩn/hiện qua hidden attribute. */}
      <PdpTabs
        labels={{ desc: t(locale, 'pdp.tabDesc'), info: t(locale, 'pdp.tabInfo'), reviews: t(locale, 'pdp.tabReviews') }}
        desc={<p className="pdp-desc">{product.description || product.name}</p>}
        info={
          <table className="pdp-spec">
            <tbody>
              <tr>
                <th scope="row">{t(locale, 'pdp.infoBrand')}</th>
                <td>{product.brand || '—'}</td>
              </tr>
              <tr>
                <th scope="row">{t(locale, 'pdp.infoSku')}</th>
                <td>{locale === 'en' ? product.slugEn : product.slug}</td>
              </tr>
              <tr>
                <th scope="row">{t(locale, 'pdp.infoCat')}</th>
                <td>{path?.[path.length - 1]?.name ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row">{t(locale, 'pdp.infoRating')}</th>
                <td>
                  {product.ratingAvg}/5 — {product.ratingCount} {t(locale, 'pdp.reviewsUnit')}
                </td>
              </tr>
            </tbody>
          </table>
        }
        reviews={
          <>
            {/* SF-8: reviews section SSR (chỉ APPROVED + badge verified) — thay placeholder reviews SF-4; dead i18n key đã xoá (SF-3) */}
            <ProductReviewsSection slug={params.slug} productId={product.id} locale={locale} reviewPage={reviewPage} />
            {/* SF-8: panel quản lý review PENDING của chính mình (Sửa/Xóa) */}
            <MyPendingReviewPanel productId={product.id} locale={locale} />
          </>
        }
      />

      {related && related.items.length > 0 ? (
        <section className="featured" aria-label={t(locale, 'pdp.related')} data-testid="related-products">
          <div className="featured-head">
            <div className="featured-head-left">
              <span className="section-bar" aria-hidden="true" />
              <h2 className="section-title">{t(locale, 'pdp.related')}</h2>
            </div>
          </div>
          <div className="featured-grid">
            {related.items.map((item) => (
              <ProductCardView key={item.id} product={item} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
