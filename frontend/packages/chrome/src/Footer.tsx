'use client';

import type { ReactElement } from 'react';
import { useT } from '@ecommerce/i18n';
import { localePath, sfUrl, shellUrl } from './site';

/**
 * Footer (FI-398 T6, spec §3.3) — port từ storefront components/Footer.tsx
 * (honesty-pass SF-3, N5): CHỈ link tới route có thật — cột Danh mục (5 slug
 * root seed-verified: dien-tu/thoi-trang/nha-cua/sach/lam-dep) + cột Tài
 * khoản (trang shell: cart/account/orders/wishlist/reviews qua shellUrl()).
 * KHÔNG NewsletterForm (storefront-owned client island — SF-4 quyết khi swap
 * layout). Labels chrome.footer.* (mirror EXACT string storefront footer.*).
 * Cross-origin ĐÚNG như hiện trạng (Danh mục → sfUrl, Tài khoản → shellUrl) —
 * SF-3 flip same-origin sau.
 *
 * Visual FI-390 §2.2.5: nền tối (#212121), link muted hover accent — css port
 * EXACT storefront app.css .site-footer* vào chrome.css (tokens-only, exception
 * có comment). Self-contained: dùng .chrome-container (KHÔNG phụ thuộc
 * .container storefront).
 *
 * Link render <a> thuần (SSR-safe, shell-compatible).
 */
// Next SPA-nav (next/link) là ext-point SF-4 khi wire layout (chrome không phụ thuộc next).

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: ReadonlyArray<FooterLink>;
}

export function Footer(): ReactElement {
  const { t, lang } = useT();
  const columns: ReadonlyArray<FooterColumn> = [
    {
      title: t('chrome.footer.colCategories'),
      links: [
        { label: t('chrome.footer.catElectronics'), href: `${sfUrl()}${localePath('/c/dien-tu', lang)}` },
        { label: t('chrome.footer.catFashion'), href: `${sfUrl()}${localePath('/c/thoi-trang', lang)}` },
        { label: t('chrome.footer.catHome'), href: `${sfUrl()}${localePath('/c/nha-cua', lang)}` },
        { label: t('chrome.footer.catBooks'), href: `${sfUrl()}${localePath('/c/sach', lang)}` },
        { label: t('chrome.footer.catBeauty'), href: `${sfUrl()}${localePath('/c/lam-dep', lang)}` }
      ]
    },
    {
      title: t('chrome.footer.colAccount'),
      links: [
        { label: t('chrome.footer.linkCart'), href: `${shellUrl()}/cart` },
        { label: t('chrome.footer.linkAccount'), href: `${shellUrl()}/account` },
        { label: t('chrome.footer.linkOrders'), href: `${shellUrl()}/account/orders` },
        { label: t('chrome.footer.linkWishlist'), href: `${shellUrl()}/account/wishlist` },
        { label: t('chrome.footer.linkMyReviews'), href: `${shellUrl()}/account/reviews` }
      ]
    }
  ];

  return (
    <footer className="chrome-site-footer">
      <div className="chrome-container chrome-site-footer__inner">
        {columns.map((column) => (
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
      </div>
    </footer>
  );
}

export default Footer;
