'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { Locale } from '../lib/format';
import { switchLocalePath } from '../lib/format';
import { t } from '../lib/i18n';

/**
 * Locale switcher header (Task 10): link mảnh sang locale còn lại, giữ nguyên
 * path. usePathname trả path đã rewrite — trang vi chạy route `/vi/**` nên
 * switchLocalePath chuẩn hóa cả prefix `/vi` lẫn `/en` trước khi đổi.
 * Link SPA (T3 migration — href giữ nguyên, no-JS vẫn GET được).
 */
export default function LocaleSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? '/';
  const target: Locale = locale === 'en' ? 'vi' : 'en';
  return (
    <Link
      className="locale-switch"
      href={switchLocalePath(pathname, target)}
      aria-label="Switch language / Chuyển ngôn ngữ"
    >
      {t(locale, 'common.langShort')}
    </Link>
  );
}
