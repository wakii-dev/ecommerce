import type { Locale } from '../lib/format';
import { localePath } from '../lib/format';
import { shellUrl } from '../lib/site';

import NewsletterForm from './NewsletterForm';

/**
 * Footer honesty-pass (SF-3, N5): CHỈ link tới route có thật — cột Danh mục
 * (5 slug root seed-verified: SeedData "Điện Tử"/"Thời Trang"/"Nhà Cửa"/"Sách"
 * /"Làm Đẹp") + cột Tài khoản (trang shell: cart/account/orders/wishlist/
 * reviews, origin shellUrl()) + newsletter. Cột care/about/social cũ XOÁ —
 * không có trang thật, dead link là nói dối user (không tạo trang content
 * mới để lấp — N5).
 */

/** Shell origin (cart/account là trang shell Vite — KHÔNG phải route Next). */
function shellHref(path: string): string {
  return `${shellUrl()}${path}`;
}

interface FooterLink {
  label: string;
  href: string;
}

const COLUMNS: Record<Locale, ReadonlyArray<{ title: string; links: ReadonlyArray<FooterLink> }>> = {
  vi: [
    {
      title: 'Danh mục nổi bật',
      links: [
        { label: 'Điện Tử', href: localePath('/c/dien-tu', 'vi') },
        { label: 'Thời Trang', href: localePath('/c/thoi-trang', 'vi') },
        { label: 'Nhà Cửa', href: localePath('/c/nha-cua', 'vi') },
        { label: 'Sách', href: localePath('/c/sach', 'vi') },
        { label: 'Làm Đẹp', href: localePath('/c/lam-dep', 'vi') },
      ],
    },
    {
      title: 'Tài khoản',
      links: [
        { label: 'Giỏ hàng', href: shellHref('/cart') },
        { label: 'Tài khoản', href: shellHref('/account') },
        { label: 'Đơn hàng của tôi', href: shellHref('/account/orders') },
        { label: 'Sản phẩm yêu thích', href: shellHref('/account/wishlist') },
        { label: 'Đánh giá của tôi', href: shellHref('/account/reviews') },
      ],
    },
  ],
  en: [
    {
      title: 'Top categories',
      links: [
        { label: 'Electronics', href: localePath('/c/dien-tu', 'en') },
        { label: 'Fashion', href: localePath('/c/thoi-trang', 'en') },
        { label: 'Home & Living', href: localePath('/c/nha-cua', 'en') },
        { label: 'Books', href: localePath('/c/sach', 'en') },
        { label: 'Beauty', href: localePath('/c/lam-dep', 'en') },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Cart', href: shellHref('/cart') },
        { label: 'Account', href: shellHref('/account') },
        { label: 'My orders', href: shellHref('/account/orders') },
        { label: 'Wishlist', href: shellHref('/account/wishlist') },
        { label: 'My reviews', href: shellHref('/account/reviews') },
      ],
    },
  ],
};

/**
 * Footer §2.2.5: nền #212121 (var --c-text), cột link gap 32px, link #bbb
 * hover accent. SF-13 A8: cột newsletter (client island — subscribe form).
 */
export default function Footer({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        {COLUMNS[locale].map((column) => (
          <section key={column.title}>
            <h4>{column.title}</h4>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <NewsletterForm locale={locale} />
      </div>
    </footer>
  );
}
