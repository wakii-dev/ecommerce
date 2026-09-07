import { Be_Vietnam_Pro } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import GaPageview from '../components/GaPageview';

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

export default function RootLayout({ children }: { children: ReactNode }) {
  const locale = headers().get('x-app-locale');
  const gaId = process.env.NEXT_PUBLIC_GA_ID || '';
  return (
    <html lang={locale === 'en' ? 'en' : 'vi'} className={beVietnamPro.className}>
      <body>
        {children}
        {/* SF-13 A7a: GA4 chỉ load khi có NEXT_PUBLIC_GA_ID; pageview theo
            navigation qua GaPageview (App Router không reload). */}
        {gaId ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`
              }}
            />
            <GaPageview />
          </>
        ) : null}
      </body>
    </html>
  );
}
