import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import './app.css';

/**
 * Root layout (SF-8 sửa build vỡ có sẵn — pack cho phép sửa "khi bắt buộc,
 * additive + ghi rõ commit"): Next ≥14.2 BẮT BUỘC app/not-found.tsx phải có
 * root layout; trước đó app này không có → `next build` fail ("not-found.tsx
 * doesn't have a root layout") từ khi lockfile drift 14.2.32→14.2.35.
 *
 * <html>/<body> chuyển từ [locale]/layout lên đây (pattern i18n chuẩn Next —
 * docs "app-i18n": root layout sở hữu html, layout con giữ shell). Locale
 * cho `lang` qua header `x-app-locale` do middleware gắn (root layout không
 * thấy params segment); header vắng → vi.
 */
const beVietnamPro = Be_Vietnam_Pro({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['vietnamese', 'latin'],
  display: 'swap',
});

/** PWA metadata (SF-15) — manifest qua app/manifest.ts; child generateMetadata
 * ([locale]/layout) merge đè title/description, giữ manifest/icons. */
export const metadata: Metadata = {
  applicationName: 'ShopVN',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'ShopVN', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#F53D2D',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const locale = headers().get('x-app-locale');
  return (
    <html lang={locale === 'en' ? 'en' : 'vi'} className={beVietnamPro.className}>
      <body>{children}</body>
    </html>
  );
}
