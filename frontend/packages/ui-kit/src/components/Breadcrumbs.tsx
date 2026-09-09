import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  /** Có → item giữa render <a>; item CUỐI luôn span aria-current="page" */
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Nhãn aria cho <nav> — default 'Bạn đang ở:' (ui.breadcrumbs.label) */
  label?: string;
  /** Default chevron svg 12px currentColor — không dùng Icon (tránh circular dep) */
  separator?: ReactNode;
  className?: string;
}

const DEFAULT_SEPARATOR = (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/** Breadcrumb điều hướng — server-safe, ol/li thuần; item cuối là vị trí hiện tại. */
export function Breadcrumbs({
  items,
  label = 'Bạn đang ở:',
  separator = DEFAULT_SEPARATOR,
  className
}: BreadcrumbsProps) {
  return (
    <nav
      className={['uk-breadcrumbs', className ?? null].filter(Boolean).join(' ')}
      aria-label={label}
    >
      <ol className="uk-breadcrumbs__list">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const li = (
            <li key={`item-${i}`} className="uk-breadcrumbs__item">
              {isLast ? (
                <span aria-current="page">{item.label}</span>
              ) : item.href ? (
                <a href={item.href}>{item.label}</a>
              ) : (
                <span>{item.label}</span>
              )}
            </li>
          );
          return isLast
            ? [li]
            : [
                li,
                <li
                  key={`sep-${i}`}
                  aria-hidden="true"
                  className="uk-breadcrumbs__sep"
                >
                  {separator}
                </li>
              ];
        })}
      </ol>
    </nav>
  );
}

/** JSON-LD schema.org BreadcrumbList — chuỗi thuần, consumer tự bọc <script type="application/ld+json">. */
export function breadcrumbJsonld(items: BreadcrumbItem[]): string {
  // Escape '<' → '\u003c' (JSON.parse khôi phục nguyên bản): label chứa
  // '</script>' không được phép xuất raw trong <script type="application/ld+json">
  // — breakout khỏi script tag = XSS. JSON.stringify không escape '<'.
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: item.href } : {})
    }))
  }).replace(/</g, '\\u003c');
}
