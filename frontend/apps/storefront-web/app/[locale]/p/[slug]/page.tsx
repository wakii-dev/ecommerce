import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Gallery from '../../../../components/pdp/Gallery';
import PdpBuyBox from '../../../../components/pdp/PdpBuyBox';
import RecentlyViewedTracker from '../../../../components/pdp/RecentlyViewedTracker';
import MyPendingReviewPanel from '../../../../components/reviews/MyPendingReviewPanel';
import ProductReviewsSection from '../../../../components/reviews/ProductReviewsSection';
import WishlistHeart from '../../../../components/wishlist/WishlistHeart';
import { EmptyState, StarRating } from '../../../../components/ui-kit';
import {
  catalogApi,
  CatalogUnavailableError,
  categoryEmoji,
  categoryGradient,
  discountPercent,
  type Category,
  type ProductDetail,
} from '../../../../lib/catalog-api';
import { localePath, resolveLocale } from '../../../../lib/format';
import { categoryPathById, jsonLdFor } from '../../../../lib/pdp';
import { pdpMetadata } from '../../../../lib/seo';
import { siteUrl } from '../../../../lib/site';

/**
 * PDP SSR (plan Task 13) — metadata/JSON-LD/OG server-rendered + gallery/
 * variant/buy-box client (vẫn SSR HTML lần đầu). Distinguish 404 (ApiError
 * status) vs catalog down qua `.status` của CatalogUnavailableError (lib doc).
 * Related: skip — relatedCount 0, API SF-4 không có related list.
 */

interface PdpPageProps {
  params: { locale: string; slug: string };
  /** SF-8: `?reviewPage=N` — pagination reviews section (server-rendered links). */
  searchParams?: { reviewPage?: string };
}

const COPY = {
  vi: {
    home: 'Trang chủ',
    sold: 'Đã bán',
    reviews: 'đánh giá',
    perkAuth: 'Hàng chính hãng 100%',
    perkShip: 'Miễn phí vận chuyển',
    tabDesc: 'Mô tả',
    tabInfo: 'Thông tin',
    tabReviews: 'Đánh giá',
    reviewsSoon: 'Sắp ra mắt',
    infoBrand: 'Thương hiệu',
    infoSku: 'Mã sản phẩm',
    infoCat: 'Danh mục',
    infoRating: 'Đánh giá',
    unavailable: 'Sản phẩm tạm thời không khả dụng',
    unavailableDesc: 'Hệ thống đang bận — vui lòng thử lại sau ít phút.',
  },
  en: {
    home: 'Home',
    sold: 'Sold',
    reviews: 'reviews',
    perkAuth: '100% authentic',
    perkShip: 'Free shipping',
    tabDesc: 'Description',
    tabInfo: 'Specifications',
    tabReviews: 'Reviews',
    reviewsSoon: 'Coming soon',
    infoBrand: 'Brand',
    infoSku: 'SKU',
    infoCat: 'Category',
    infoRating: 'Rating',
    unavailable: 'Product temporarily unavailable',
    unavailableDesc: 'The system is busy — please try again in a few minutes.',
  },
} as const;

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
  const copy = COPY[locale];
  const reviewPage = Math.max(1, Number.parseInt(searchParams?.reviewPage ?? '1', 10) || 1);

  let product: ProductDetail | null = null;
  let tree: Category[] = [];
  let catalogDown = false;

  try {
    const api = catalogApi(locale);
    const [detail, categories] = await Promise.all([api.getProduct(params.slug), api.getCategories()]);
    product = detail;
    tree = categories;
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
          <a href={localePath('/', locale)}>{copy.home}</a>
        </nav>
        <EmptyState icon="🛠️" title={copy.unavailable} description={copy.unavailableDesc} />
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
        <a href={localePath('/', locale)}>{copy.home}</a>
        {(path ?? []).map((node) => (
          <span key={node.id} className="plp-breadcrumb-item">
            <span className="plp-breadcrumb-sep" aria-hidden="true">
              ›
            </span>
            <a href={localePath(`/c/${locale === 'en' ? node.slugEn : node.slug}`, locale)}>{node.name}</a>
          </span>
        ))}
        <span className="plp-breadcrumb-sep" aria-hidden="true">
          ›
        </span>
        <span className="plp-breadcrumb-current">{product.name}</span>
      </nav>

      <div className="pdp-layout">
        <Gallery images={galleryImages} name={product.name} gradient={gradient} emoji={emoji} percent={percent} />

        <div className="pdp-info">
          <h1 className="pdp-name">{product.name}</h1>
          <div className="pdp-meta">
            <StarRating value={product.ratingAvg} size="sm" ariaLabel={`${product.name}: ${product.ratingAvg}/5`} />
            <span className="pdp-meta-count">
              ({product.ratingCount} {copy.reviews})
            </span>
            <span className="pdp-meta-sold">
              {copy.sold} {product.ratingCount}
            </span>
            {/* SF-8: wishlist heart — guest → /account (đăng nhập shell) */}
            <WishlistHeart productId={product.id} locale={locale} variant="pdp" />
          </div>

          <PdpBuyBox product={product} locale={locale} />

          <div className="pdp-perks">
            <span className="pdp-perk">
              <span className="pdp-perk-icon" aria-hidden="true">
                ✓
              </span>
              {copy.perkAuth}
            </span>
            <span className="pdp-perk">
              <span className="pdp-perk-icon" aria-hidden="true">
                🚚
              </span>
              {copy.perkShip}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs CSS :target — cả 3 panel đều nằm sẵn trong HTML (D16), không JS. */}
      <div className="pdp-tabs">
        <nav className="pdp-tab-bar" aria-label={copy.tabDesc}>
          <a href="#tab-desc">{copy.tabDesc}</a>
          <a href="#tab-info">{copy.tabInfo}</a>
          <a href="#tab-reviews">{copy.tabReviews}</a>
        </nav>

        <section id="tab-desc" className="pdp-panel">
          <p className="pdp-desc">{product.description || product.name}</p>
        </section>

        <section id="tab-info" className="pdp-panel">
          <table className="pdp-spec">
            <tbody>
              <tr>
                <th scope="row">{copy.infoBrand}</th>
                <td>{product.brand || '—'}</td>
              </tr>
              <tr>
                <th scope="row">{copy.infoSku}</th>
                <td>{locale === 'en' ? product.slugEn : product.slug}</td>
              </tr>
              <tr>
                <th scope="row">{copy.infoCat}</th>
                <td>{path?.[path.length - 1]?.name ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row">{copy.infoRating}</th>
                <td>
                  {product.ratingAvg}/5 — {product.ratingCount} {copy.reviews}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="tab-reviews" className="pdp-panel">
          {/* SF-8: reviews section SSR (chỉ APPROVED + badge verified) — thay "Sắp ra mắt" SF-4 */}
          <ProductReviewsSection slug={params.slug} productId={product.id} locale={locale} reviewPage={reviewPage} />
          {/* SF-8: panel quản lý review PENDING của chính mình (Sửa/Xóa) */}
          <MyPendingReviewPanel productId={product.id} locale={locale} />
        </section>
      </div>
    </div>
  );
}
