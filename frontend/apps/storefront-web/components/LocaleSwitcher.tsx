'use client';

import { usePathname } from 'next/navigation';

import type { Locale } from '../lib/format';
import { switchLocalePath } from '../lib/format';

/** Nhãn = locale ĐÍCH (UX chuẩn): trang vi hiện "EN", trang en hiện "VI". */
const TARGET_LABEL: Record<Locale, string> = { vi: 'EN', en: 'VI' };

/**
 * Locale switcher header (Task 10): link mảnh sang locale còn lại, giữ nguyên
 * path. usePathname trả path đã rewrite — trang vi chạy route `/vi/**` nên
 * switchLocalePath chuẩn hóa cả prefix `/vi` lẫn `/en` trước khi đổi.
 */
export default function LocaleSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? '/';
  const target: Locale = locale === 'en' ? 'vi' : 'en';
  return (
    <a
      className="locale-switch"
      href={switchLocalePath(pathname, target)}
      aria-label="Switch language / Chuyển ngôn ngữ"
    >
      {TARGET_LABEL[locale]}
    </a>
  );
}
