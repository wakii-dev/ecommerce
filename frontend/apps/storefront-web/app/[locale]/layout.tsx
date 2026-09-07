import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import '@ecommerce/ui-kit/styles.css';
import '@ecommerce/ui-kit/tokens.css';

import Footer from '../../components/Footer';
import Header from '../../components/Header';
import LiveChat from '../../components/LiveChat';
import PwaRegister from '../../components/PwaRegister';
import { resolveLocale } from '../../lib/format';
import { buildAlternates } from '../../lib/seo';
import { siteUrl } from '../../lib/site';

const DESCRIPTION: Record<string, string> = {
  vi: 'Chợ sôi động — hàng nghìn sản phẩm chính hãng, giá tốt mỗi ngày.',
  en: 'Shop VN — thousands of official products at great prices, every day.',
};

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

/**
 * Locale layout — shell Header/main/Footer. SF-8 sửa build vỡ có sẵn:
 * <html>/<body> + font chuyển lên root app/layout.tsx (Next ≥14.2 bắt buộc
 * root layout vì app/not-found.tsx — pattern i18n chuẩn; chi tiết trong
 * app/layout.tsx). Guard locale lạ giữ nguyên — not-found render trong
 * root layout.
 */
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
    <>
      <Header locale={locale} />
      <main>{children}</main>
      <Footer locale={locale} />
      <PwaRegister />
      <LiveChat />
    </>
  );
}
