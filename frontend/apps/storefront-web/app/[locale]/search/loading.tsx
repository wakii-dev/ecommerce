import { ProductCardSkeleton, Skeleton } from '../../../components/ui-kit';

/**
 * Search loading (FI-392 T2) — 6 ProductCardSkeleton grid 3 col (khớp
 * .plp-grid của kết quả thật — direction §4). KHÔNG fetch — reserve CLS.
 */
export default function SearchLoading() {
  return (
    <div className="container plp sk-plp" aria-busy="true">
      <p className="sk-sr-only" role="status">
        Đang tải kết quả… / Loading results…
      </p>
      <div className="sk-plp-head" aria-hidden="true">
        <Skeleton variant="text" width="40%" height={26} />
      </div>
      <div className="sk-grid sk-grid--3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
