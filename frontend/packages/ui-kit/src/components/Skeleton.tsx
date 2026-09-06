import type { CSSProperties } from 'react';

export type SkeletonVariant = 'text' | 'rect' | 'circle';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Số khối skeleton liên tiếp (vd 3 dòng text) */
  count?: number;
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({
  variant = 'text',
  count = 1,
  width,
  height,
  className
}: SkeletonProps) {
  const items = Array.from({ length: Math.max(1, count) }, (_, i) => i);

  return (
    <>
      {items.map((i) => {
        const style: CSSProperties = {};
        if (width !== undefined) style.width = width;
        if (height !== undefined) style.height = height;
        return (
          <span
            key={i}
            className={[
              'uk-skeleton',
              `uk-skeleton--${variant}`,
              className ?? null
            ]
              .filter(Boolean)
              .join(' ')}
            style={Object.keys(style).length > 0 ? style : undefined}
            aria-hidden="true"
          />
        );
      })}
    </>
  );
}
