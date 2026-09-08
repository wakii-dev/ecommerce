'use client';

import { usePathname } from 'next/navigation';

import { Icon } from '../../../../components/ui-kit';

/**
 * Route error boundary (FI-392 T2) — thay crash screen mặc định của Next.
 * Locale không có params ở error.tsx → parse segment đầu từ usePathname
 * (vi|en); không resolve được → bilingual fallback (pattern not-found).
 * "Thử lại" gọi reset() để Next render lại segment — không reload trang.
 */
const COPY = {
  vi: {
    title: 'Đã có lỗi xảy ra',
    desc: 'Không tải được nội dung — vui lòng thử lại.',
    retry: 'Thử lại'
  },
  en: {
    title: 'Something went wrong',
    desc: "We couldn't load this page — please try again.",
    retry: 'Try again'
  }
} as const;

export default function RouteError({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const segment = pathname.split('/')[1];
  const locale = segment === 'vi' || segment === 'en' ? segment : null;

  const title = locale ? COPY[locale].title : `${COPY.vi.title} / ${COPY.en.title}`;
  const desc = locale ? COPY[locale].desc : `${COPY.vi.desc} ${COPY.en.desc}`;
  const retry = locale ? COPY[locale].retry : `${COPY.vi.retry} / ${COPY.en.retry}`;

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
