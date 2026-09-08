import { ProductCardSkeleton, Skeleton } from '../../../../components/ui-kit';

/**
 * PLP loading (FI-392 T2) — 6 ProductCardSkeleton grid 4 col (direction §4
 * "loading: 6 ProductCardSkeleton shimmer"). KHÔNG fetch — reserve CLS.
 */
export default function PlpLoading() {
  return (
    <div className="container plp sk-plp" aria-busy="true">
      <p className="sk-sr-only" role="status">
        Đang tải sản phẩm… / Loading products…
      </p>
      <div className="sk-plp-head" aria-hidden="true">
        <Skeleton variant="text" width="40%" height={26} />
      </div>
      <div className="sk-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
