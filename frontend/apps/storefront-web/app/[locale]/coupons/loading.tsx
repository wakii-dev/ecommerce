import { ProductCardSkeleton, Skeleton } from '../../../components/ui-kit';

/**
 * Coupons loading (FI-392 T2 — Step 1b: không có loading riêng sẽ fallback
 * skeleton home). 6 ProductCardSkeleton grid 3 col khớp .coupons-grid.
 * KHÔNG fetch — reserve CLS.
 */
export default function CouponsLoading() {
  return (
    <div className="container coupons sk-coupons" aria-busy="true">
      <p className="sk-sr-only" role="status">
        Đang tải mã giảm giá… / Loading coupons…
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
