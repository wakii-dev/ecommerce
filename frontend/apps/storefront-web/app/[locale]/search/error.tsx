'use client';

import { usePathname } from 'next/navigation';

import { Icon } from '../../../components/ui-kit';
import { t, type I18nKey } from '../../../lib/i18n';

/**
 * Route error boundary (FI-392 T2) — thay crash screen mặc định của Next.
 * Locale không có params ở error.tsx → parse segment đầu từ usePathname
 * (vi|en); không resolve được → bilingual fallback (pattern not-found).
 * "Thử lại" gọi reset() để Next render lại segment — không reload trang.
 * T12: copy trong lib/i18n (miền `common.error*`).
 */

function errorCopy(locale: 'vi' | 'en' | null, key: I18nKey, sep = ' / '): string {
  // fallback bilingual: nối bằng sep — desc dùng SPACE (giữ nguyên output
  // trước T12: title/retry ' / ', desc space — review-D P0)
  return locale ? t(locale, key) : `${t('vi', key)}${sep}${t('en', key)}`;
}

export default function RouteError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const segment = pathname.split('/')[1];
  const locale = segment === 'vi' || segment === 'en' ? segment : null;

  const title = errorCopy(locale, 'common.errorTitle');
  const desc = errorCopy(locale, 'common.errorDesc', ' ');
  const retry = errorCopy(locale, 'common.errorRetry');

  return (
    <div className="container route-error" role="alert">
      <span className="route-error-icon" aria-hidden="true">
        <Icon name="alert" size={28} />
      </span>
      <h1 className="route-error-title">{title}</h1>
      <p className="route-error-desc">{desc}</p>
      <button type="button" className="route-error-retry" onClick={() => reset()}>
        {retry}
      </button>
    </div>
  );
}
