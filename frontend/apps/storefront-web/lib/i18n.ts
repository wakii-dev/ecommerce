import type { Locale } from './format';

/**
 * i18n storefront (FI-392 T12) — gom COPY rải rác 20+ file về 1 module nội bộ
 * (spec item 12: KHÔNG ép qua @ecommerce/i18n — storefront dùng [locale]
 * routing; giữ pattern COPY nhưng tập trung + type-safe).
 *
 * Mỗi entry leaf là `Record<Locale, string>`; key dạng dotted path
 * `'header.cart'` (miền.leaf — 1 cấp, literal type union `I18nKey`).
 * `t(locale, key)` pure function — server + client component đều gọi được
 * (không class, không context, không hook).
 *
 * Interpolation `{name}`: `tParams(locale, 'plp.pageN', { n: 2 })` → 'Trang 2'
 * (chỉ nơi thật cần — pageLabel/hero dots/gallery/thumb count).
 *
 * Exports đặc biệt:
 * - `COPY` — shape cũ của AddToCart copy (Record<Locale, {…}>) GIỮ nguyên cho
 *   tests/addtocart.test.ts (honesty SF-3); AddToCart.tsx re-export từ đây.
 * - `HERO_SLIDES` — slide hero là CẤU TRÚC (gradient + 3 string), không phải
 *   leaf — giữ ở đây như domain catalog hero (HeroCarousel import).
 */

type Entry = Record<Locale, string>;

/** Export cho parity test (tests/i18n.test.ts) — đọc trực tiếp, không qua t(). */
export const dictionaries = {
  common: {
    langShort: { vi: 'EN', en: 'VI' },
    themeToDark: { vi: 'Chuyển giao diện tối', en: 'Switch to dark mode' },
    themeToLight: { vi: 'Chuyển giao diện sáng', en: 'Switch to light mode' },
    themeDark: { vi: 'Tối', en: 'Dark' },
    themeLight: { vi: 'Sáng', en: 'Light' },
    /** Desc degraded chung (home + PLP + search) — title theo miền riêng. */
    busy: {
      vi: 'Hệ thống đang bận — vui lòng thử lại sau ít phút.',
      en: 'The catalog is temporarily unavailable — please try again in a few minutes.',
    },
    errorTitle: { vi: 'Đã có lỗi xảy ra', en: 'Something went wrong' },
    errorDesc: { vi: 'Không tải được nội dung — vui lòng thử lại.', en: "We couldn't load this page — please try again." },
    errorRetry: { vi: 'Thử lại', en: 'Try again' },
  },
  header: {
    ticker: { vi: 'CHÍNH HÃNG · FREESHIP', en: 'OFFICIAL · FREESHIP' },
    cart: { vi: 'Giỏ hàng', en: 'Cart' },
    account: { vi: 'Tài khoản', en: 'Account' },
    categories: { vi: 'Danh mục', en: 'Categories' },
    newArrivals: { vi: 'Hàng mới', en: 'New arrivals' },
    bestSellers: { vi: 'Bán chạy', en: 'Best sellers' },
    logo: { vi: 'Shop VN — trang chủ', en: 'Shop VN — home' },
    quickNav: { vi: 'Danh mục nhanh', en: 'Quick categories' },
  },
  hero: {
    cta: { vi: 'Mua ngay', en: 'Shop now' },
    pause: { vi: 'Tạm dừng tự động chuyển slide', en: 'Pause auto-rotate' },
    prev: { vi: 'Slide trước', en: 'Previous slide' },
    next: { vi: 'Slide sau', en: 'Next slide' },
    goToSlide: { vi: 'Chuyển đến slide {n}', en: 'Go to slide {n}' },
    section: { vi: 'Khuyến mãi nổi bật', en: 'Featured promotions' },
  },
  home: {
    featuredTitle: { vi: 'Gợi ý hôm nay', en: 'Picked for today' },
    seeMore: { vi: 'Xem thêm ›', en: 'See more ›' },
    seeMoreTile: { vi: 'Xem thêm →', en: 'See more →' },
    seeAll: { vi: 'Xem tất cả', en: 'See all' },
    categoriesTitle: { vi: 'Danh mục nổi bật', en: 'Top categories' },
    flashSection: { vi: 'Flash sale', en: 'Flash sale' },
    recentlyViewed: { vi: 'Đã xem gần đây', en: 'Recently viewed' },
    countdown: { vi: 'Đếm ngược flash sale', en: 'Flash sale countdown' },
  },
  plp: {
    home: { vi: 'Trang chủ', en: 'Home' },
    sortBy: { vi: 'Sắp xếp', en: 'Sort by' },
    sortPriceAsc: { vi: 'Giá: thấp → cao', en: 'Price: low → high' },
    sortPriceDesc: { vi: 'Giá: cao → thấp', en: 'Price: high → low' },
    sortRating: { vi: 'Đánh giá cao', en: 'Top rated' },
    sortNewest: { vi: 'Mới nhất', en: 'Newest' },
    sortDiscount: { vi: 'Giảm nhiều', en: 'Biggest discount' },
    productsCount: { vi: '{n} sản phẩm', en: '{n} products' },
    emptyTitle: { vi: 'Không tìm thấy sản phẩm phù hợp', en: 'No matching products found' },
    emptyDesc: { vi: 'Thử bỏ một vài bộ lọc hoặc xem danh mục khác nhé.', en: 'Try removing some filters or browsing another category.' },
    clearAll: { vi: 'Xóa tất cả', en: 'Clear all' },
    pagination: { vi: 'Phân trang', en: 'Pagination' },
    prevPage: { vi: 'Trang trước', en: 'Previous page' },
    nextPage: { vi: 'Trang sau', en: 'Next page' },
    pageN: { vi: 'Trang {n}', en: 'Page {n}' },
  },
  pdp: {
    home: { vi: 'Trang chủ', en: 'Home' },
    reviewsUnit: { vi: 'đánh giá', en: 'reviews' },
    perkAuth: { vi: 'Hàng chính hãng 100%', en: '100% authentic' },
    perkShip: { vi: 'Miễn phí vận chuyển', en: 'Free shipping' },
    tabDesc: { vi: 'Mô tả', en: 'Description' },
    tabInfo: { vi: 'Thông tin', en: 'Specifications' },
    tabReviews: { vi: 'Đánh giá', en: 'Reviews' },
    infoBrand: { vi: 'Thương hiệu', en: 'Brand' },
    infoSku: { vi: 'Mã sản phẩm', en: 'SKU' },
    infoCat: { vi: 'Danh mục', en: 'Category' },
    infoRating: { vi: 'Đánh giá', en: 'Rating' },
    related: { vi: 'Sản phẩm tương tự', en: 'Similar products' },
    unavailable: { vi: 'Sản phẩm tạm thời không khả dụng', en: 'Product temporarily unavailable' },
    unavailableDesc: { vi: 'Hệ thống đang bận — vui lòng thử lại sau ít phút.', en: 'The system is busy — please try again in a few minutes.' },
    buyColor: { vi: 'Màu', en: 'Color' },
    buySize: { vi: 'Size', en: 'Size' },
    buyNote: { vi: 'Giá tốt mỗi ngày — hàng chính hãng 100%', en: 'Great price every day — 100% authentic' },
    qty: { vi: 'Số lượng', en: 'Quantity' },
    qtyDec: { vi: 'Giảm số lượng', en: 'Decrease quantity' },
    qtyInc: { vi: 'Tăng số lượng', en: 'Increase quantity' },
    atcAdd: { vi: 'THÊM VÀO GIỎ', en: 'ADD TO CART' },
    atcBuy: { vi: 'MUA NGAY', en: 'BUY NOW' },
    atcToastFail: { vi: 'Không thêm được vào giỏ — thử lại', en: "Couldn't add to cart — please try again" },
    atcToastOk: { vi: 'Đã thêm vào giỏ ✓', en: 'Added to cart ✓' },
    atcInStock: { vi: 'Còn hàng', en: 'In stock' },
    atcOutStock: { vi: 'Hết hàng', en: 'Out of stock' },
    galleryThumbs: { vi: '{name} — ảnh sản phẩm', en: '{name} — product images' },
    galleryImage: { vi: '{name} — ảnh {n}', en: '{name} — image {n}' },
    stockTitle: { vi: 'Hết hàng — nhắn tôi khi có hàng', en: 'Out of stock — notify me when back' },
    stockEmail: { vi: 'Email của bạn', en: 'Your email' },
    stockSubmit: { vi: 'Nhắn tôi khi có hàng', en: 'Notify me when available' },
    stockOk: { vi: 'Đã đăng ký ✓ Sẽ nhắn bạn ngay khi hàng về.', en: 'Subscribed ✓ We will email you when it is back.' },
    stockFail: { vi: 'Không đăng ký được — thử lại sau.', en: 'Could not subscribe — try again later.' },
    stockInvalidEmail: { vi: 'Email không hợp lệ', en: 'Invalid email' },
  },
  search: {
    placeholder: { vi: 'Tìm sản phẩm, thương hiệu...', en: 'Search products, brands...' },
    products: { vi: 'Sản phẩm', en: 'Products' },
    categories: { vi: 'Danh mục', en: 'Categories' },
    hot: { vi: 'ĐANG HOT', en: 'HOT' },
    submit: { vi: 'Tìm kiếm', en: 'Search' },
    title: { vi: 'Tìm kiếm', en: 'Search' },
    prompt: { vi: 'Nhập từ khóa để tìm kiếm', en: 'Enter a search term' },
    promptDesc: { vi: 'Gõ tên sản phẩm, thương hiệu hoặc danh mục vào ô tìm kiếm ở trên nhé.', en: 'Type a product, brand or category name in the search box above.' },
    zero: { vi: 'Không tìm thấy kết quả cho', en: 'No results for' },
    zeroDesc: { vi: 'Thử từ khóa khác, hoặc xem gợi ý bên dưới.', en: 'Try a different keyword, or pick one of the suggestions below.' },
    tryKeywords: { vi: 'Gợi ý từ khóa:', en: 'Suggested keywords:' },
    down: { vi: 'Catalog tạm thời không khả dụng', en: 'Catalog is temporarily unavailable' },
    resultsFor: { vi: 'Kết quả cho "{q}"', en: 'Results for "{q}"' },
  },
  coupons: {
    title: { vi: 'Mã giảm giá', en: 'Coupons' },
    empty: { vi: 'Chưa có mã giảm giá nào — quay lại sau nhé', en: 'No coupons available — check back soon' },
    emptyDesc: { vi: 'Ưu đãi mới sẽ xuất hiện tại đây khi có chương trình khuyến mãi.', en: 'New deals will appear here when a promotion starts.' },
    minOrder: { vi: 'Đơn tối thiểu', en: 'Min. order' },
    expires: { vi: 'HSD', en: 'Exp.' },
    expired: { vi: 'Hết hạn', en: 'Expired' },
    copy: { vi: 'Sao chép', en: 'Copy' },
    copied: { vi: 'Đã copy', en: 'Copied!' },
  },
  footer: {
    colCategories: { vi: 'Danh mục nổi bật', en: 'Top categories' },
    colAccount: { vi: 'Tài khoản', en: 'Account' },
    catElectronics: { vi: 'Điện Tử', en: 'Electronics' },
    catFashion: { vi: 'Thời Trang', en: 'Fashion' },
    catHome: { vi: 'Nhà Cửa', en: 'Home & Living' },
    catBooks: { vi: 'Sách', en: 'Books' },
    catBeauty: { vi: 'Làm Đẹp', en: 'Beauty' },
    linkCart: { vi: 'Giỏ hàng', en: 'Cart' },
    linkAccount: { vi: 'Tài khoản', en: 'Account' },
    linkOrders: { vi: 'Đơn hàng của tôi', en: 'My orders' },
    linkWishlist: { vi: 'Sản phẩm yêu thích', en: 'Wishlist' },
    linkMyReviews: { vi: 'Đánh giá của tôi', en: 'My reviews' },
  },
  newsletter: {
    title: { vi: 'Đăng ký nhận tin', en: 'Newsletter' },
    desc: { vi: 'Nhận khuyến mãi và flash deal mới nhất.', en: 'Get the latest promos and flash deals.' },
    placeholder: { vi: 'Email của bạn', en: 'Your email' },
    submit: { vi: 'Đăng ký', en: 'Subscribe' },
    loading: { vi: 'Đang gửi…', en: 'Sending…' },
    ok: { vi: 'Đã đăng ký! Kiểm tra email chào mừng nhé.', en: 'Subscribed! Check your welcome email.' },
    already: { vi: 'Email này đã được đăng ký từ trước.', en: 'This email is already subscribed.' },
    error: { vi: 'Có lỗi xảy ra — thử lại.', en: 'Something went wrong — try again.' },
  },
  reviews: {
    heading: { vi: 'Đánh giá sản phẩm', en: 'Product reviews' },
    reviewsUnit: { vi: 'đánh giá', en: 'reviews' },
    empty: { vi: 'Chưa có đánh giá nào — hãy là người đầu tiên!', en: 'No reviews yet — be the first!' },
    degraded: { vi: 'Không tải được đánh giá lúc này — thử lại sau ít phút.', en: 'Could not load reviews right now — try again later.' },
    verified: { vi: 'Mua đã xác nhận', en: 'Verified purchase' },
    prev: { vi: 'Trang trước', en: 'Previous' },
    next: { vi: 'Trang sau', en: 'Next' },
    write: { vi: 'Viết đánh giá', en: 'Write a review' },
    toastPending: { vi: 'Đã gửi đánh giá — đang chờ duyệt', en: 'Review submitted — pending moderation' },
    toastEdit: { vi: 'Đã cập nhật đánh giá — vẫn đang chờ duyệt', en: 'Review updated — still pending moderation' },
    editTitle: { vi: 'Sửa đánh giá của bạn', en: 'Edit your review' },
    guestTitle: { vi: 'Đăng nhập để đánh giá', en: 'Sign in to review' },
    guestDesc: { vi: 'Bạn cần đăng nhập tài khoản để viết đánh giá sản phẩm.', en: 'You need an account to review this product.' },
    guestCta: { vi: 'Đăng nhập', en: 'Sign in' },
    yourRating: { vi: 'Đánh giá của bạn', en: 'Your rating' },
    nameLabel: { vi: 'Tiêu đề (không bắt buộc)', en: 'Title (optional)' },
    contentLabel: { vi: 'Nội dung', en: 'Review' },
    contentPlaceholder: { vi: 'Chia sẻ trải nghiệm của bạn về sản phẩm…', en: 'Share your experience with this product…' },
    submit: { vi: 'Gửi đánh giá', en: 'Submit review' },
    saving: { vi: 'Đang gửi…', en: 'Sending…' },
    duplicate: { vi: 'Bạn đã đánh giá sản phẩm này rồi', en: 'You already reviewed this product' },
    submitError: { vi: 'Gửi đánh giá thất bại — thử lại sau ít phút', en: 'Failed to submit — please try again later' },
    ratingRequired: { vi: 'Hãy chọn số sao', en: 'Pick a star rating' },
    pendingHeading: { vi: 'Đánh giá của bạn (đang chờ duyệt)', en: 'Your review (pending moderation)' },
    statusPending: { vi: 'Chờ duyệt', en: 'Pending' },
    edit: { vi: 'Sửa', en: 'Edit' },
    remove: { vi: 'Xóa', en: 'Delete' },
    removing: { vi: 'Đang xóa…', en: 'Deleting…' },
    removed: { vi: 'Đã xóa đánh giá đang chờ duyệt', en: 'Pending review deleted' },
    loadError: { vi: 'Không tải được đánh giá của bạn', en: 'Could not load your review' },
    deleteFail: { vi: 'Xóa thất bại — thử lại', en: 'Delete failed — try again' },
  },
  wishlist: {
    add: { vi: 'Thêm vào yêu thích', en: 'Add to wishlist' },
    remove: { vi: 'Bỏ yêu thích', en: 'Remove from wishlist' },
    guest: { vi: 'Đăng nhập để lưu yêu thích', en: 'Sign in to save to wishlist' },
  },
} as const;

type Dictionaries = typeof dictionaries;

/** Key hợp lệ = 'miền.leaf' với (miền, leaf) tồn tại thật trong dictionaries. */
export type I18nKey = {
  [D in keyof Dictionaries & string]: `${D}.${keyof Dictionaries[D] & string}`;
}[keyof Dictionaries & string];

/** Tra copy theo locale — pure, server + client đều dùng được. */
export function t(locale: Locale, key: I18nKey): string {
  const dot = key.indexOf('.');
  const domain = dictionaries[key.slice(0, dot) as keyof Dictionaries];
  const entry = domain[key.slice(dot + 1) as keyof (typeof domain)] as Entry;
  return entry[locale];
}

/** Interpolation `{name}` — nhỏ, chỉ nơi thật cần (count/slide n). */
export function tParams(locale: Locale, key: I18nKey, params: Record<string, string | number>): string {
  return t(locale, key).replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Copy AddToCart — shape cũ GIỮ cho tests/addtocart.test.ts (honesty SF-3). */
const atc = (locale: Locale) => ({
  add: t(locale, 'pdp.atcAdd'),
  buy: t(locale, 'pdp.atcBuy'),
  toastFail: t(locale, 'pdp.atcToastFail'),
  toastOk: t(locale, 'pdp.atcToastOk'),
  inStock: t(locale, 'pdp.atcInStock'),
  outStock: t(locale, 'pdp.atcOutStock'),
  qty: t(locale, 'pdp.qty'),
});

export const COPY = {
  vi: atc('vi'),
  en: atc('en'),
} as const;

/** Slide hero = cấu trúc (gradient + 3 string) — domain catalog hero. */
export interface HeroSlide {
  gradient: string;
  kicker: string;
  title: string;
  ribbon: string;
}

export const HERO_SLIDES: Record<Locale, ReadonlyArray<HeroSlide>> = {
  vi: [
    { gradient: 'var(--grad-hero-1)', kicker: 'Siêu sale cuối tuần', title: 'Giảm đến 50% Điện Tử', ribbon: '50% OFF' },
    { gradient: 'var(--grad-hero-2)', kicker: 'Chính hãng 100%', title: 'Công nghệ giá tốt mỗi ngày', ribbon: 'HOT' },
    { gradient: 'var(--grad-hero-3)', kicker: 'Freeship toàn quốc', title: 'Thời trang & Làm đẹp', ribbon: 'NEW' },
  ],
  en: [
    { gradient: 'var(--grad-hero-1)', kicker: 'Weekend mega sale', title: 'Up to 50% off Electronics', ribbon: '50% OFF' },
    { gradient: 'var(--grad-hero-2)', kicker: '100% official', title: 'Great tech deals every day', ribbon: 'HOT' },
    { gradient: 'var(--grad-hero-3)', kicker: 'Free shipping nationwide', title: 'Fashion & Beauty', ribbon: 'NEW' },
  ],
};
