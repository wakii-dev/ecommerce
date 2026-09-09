'use client';

import type { ReactNode } from 'react';

import { useReveal } from '../../../packages/ui-kit/src/components/useReveal';

/**
 * Client wrapper scroll-reveal (direction §3.2, plan Task 5) — div bọc
 * `useReveal` của ui-kit: mount → `uk-reveal uk-reveal--pending` (JS gắn),
 * intersect lần đầu (threshold .12) → hiện + unobserve; `delayMs` cho
 * stagger tuần tự (featured home: 70ms × index, cap ~5).
 *
 * SSR / no-JS / reduced-motion / IO-undefined → hook tự no-op, KHÔNG class
 * nào được gắn → content hiện sẵn (KHÔNG css-default-hidden). Deep-import
 * trực tiếp source vì barrel không export hook (pattern shim ui-kit.ts).
 *
 * Dùng CHỈ home sections (§5.5 — không rải reveal trang khác).
 */
export default function Reveal({
  delayMs,
  className,
  children,
}: {
  delayMs?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>({ delayMs });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
