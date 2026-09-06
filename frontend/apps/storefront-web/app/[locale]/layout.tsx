import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/tokens.css';
import '../app.css';

import Footer from '../../components/Footer';
import Header from '../../components/Header';
import { resolveLocale } from '../../lib/format';
import { buildAlternates } from '../../lib/seo';
import { siteUrl } from '../../lib/site';

const DESCRIPTION: Record<string, string> = {
  vi: 'Chợ sôi động — hàng nghìn sản phẩm chính hãng, giá tốt mỗi ngày.',
  en: 'Shop VN — thousands of official products at great prices, every day.',
};

const beVietnamPro = Be_Vietnam_Pro({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['vietnamese', 'latin'],
  display: 'swap',
});

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale = resolveLocale(params.locale);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: 'Shop VN — Chợ sôi động', template: '%s | Shop VN' },
    description: DESCRIPTION[locale ?? 'vi'],
    // hreflang vi/en trang chủ — per-page (PLP/PDP) qua helper ở Task 12/13.
    alternates: buildAlternates('/'),
  };
}

/** Root layout theo segment [locale] — pattern i18n chuẩn Next App Router. */
export default function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const locale = resolveLocale(params.locale);
  if (!locale) notFound();
  return (
    <html lang={locale} className={beVietnamPro.className}>
      <body>
        <Header locale={locale} />
        <main>{children}</main>
        <Footer locale={locale} />
      </body>
    </html>
  );
}
