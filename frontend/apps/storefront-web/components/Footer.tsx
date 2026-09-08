import Link from 'next/link';

import type { Locale } from '../lib/format';
import { localePath } from '../lib/format';
import { t } from '../lib/i18n';
import { shellUrl } from '../lib/site';

import NewsletterForm from './NewsletterForm';

/**
 * Footer honesty-pass (SF-3, N5): CHỈ link tới route có thật — cột Danh mục
 * (5 slug root seed-verified: SeedData "Điện Tử"/"Thời Trang"/"Nhà Cửa"/"Sách"
 * /"Làm Đẹp") + cột Tài khoản (trang shell: cart/account/orders/wishlist/
 * reviews, origin shellUrl()) + newsletter. Cột care/about/social cũ XOÁ —
 * không có trang thật, dead link là nói dối user (không tạo trang content
 * mới để lấp — N5). T12: labels trong lib/i18n (miền `footer`).
 */

/** Shell origin (cart/account là trang shell Vite — KHÔNG phải route Next). */
function shellHref(path: string): string {
  return `${shellUrl()}${path}`;
}

interface FooterLink {
  label: string;
  href: string;
}

function columns(locale: Locale): ReadonlyArray<{ title: string; links: ReadonlyArray<FooterLink> }> {
  return [
    {
      title: t(locale, 'footer.colCategories'),
      links: [
        { label: t(locale, 'footer.catElectronics'), href: localePath('/c/dien-tu', locale) },
        { label: t(locale, 'footer.catFashion'), href: localePath('/c/thoi-trang', locale) },
        { label: t(locale, 'footer.catHome'), href: localePath('/c/nha-cua', locale) },
        { label: t(locale, 'footer.catBooks'), href: localePath('/c/sach', locale) },
        { label: t(locale, 'footer.catBeauty'), href: localePath('/c/lam-dep', locale) },
      ],
    },
    {
      title: t(locale, 'footer.colAccount'),
      links: [
        { label: t(locale, 'footer.linkCart'), href: shellHref('/cart') },
        { label: t(locale, 'footer.linkAccount'), href: shellHref('/account') },
        { label: t(locale, 'footer.linkOrders'), href: shellHref('/account/orders') },
        { label: t(locale, 'footer.linkWishlist'), href: shellHref('/account/wishlist') },
        { label: t(locale, 'footer.linkMyReviews'), href: shellHref('/account/reviews') },
      ],
    },
  ];
}

/**
 * Footer §2.2.5: nền #212121 (var --c-text), cột link gap 32px, link #bbb
 * hover accent. SF-13 A8: cột newsletter (client island — subscribe form).
 */
export default function Footer({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        {columns(locale).map((column) => (
          <section key={column.title}>
            <h4>{column.title}</h4>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  {/* Shell link (origin khác — cart/account) giữ <a> thường;
                      link nội bộ (Danh mục) → next/link SPA nav. */}
                  {link.href.startsWith('http') ? (
                    <a href={link.href}>{link.label}</a>
                  ) : (
                    <Link href={link.href}>{link.label}</Link>
                  )}
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
