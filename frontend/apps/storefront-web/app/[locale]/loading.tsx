import { ProductCardSkeleton, Skeleton } from '../../components/ui-kit';

/**
 * HOME loading (FI-392 T2) — streaming SSR skeleton: hero block tĩnh + flash
 * rail + featured grid ×8 ProductCardSkeleton. KHÔNG fetch — chỉ reserve
 * chiều cao chống CLS. Server component (no hook). Shimmer = .uk-skeleton
 * có sẵn của ui-kit (--dur-shimmer; reduced-motion đã block ở global css).
 */
export default function HomeLoading() {
  return (
    <div className="container home sk-home" aria-busy="true">
      <p className="sk-sr-only" role="status">
        Đang tải trang… / Loading…
      </p>

      {/* Hero block tĩnh — cao khớp .hero (380px, §2.2.1) chống CLS */}
      <div className="uk-skeleton sk-hero" aria-hidden="true" />

      {/* Flash rail — title + 5 card hẹp (khớp .flash-row flex 186px) */}
      <div className="sk-flash" aria-hidden="true">
        <Skeleton variant="text" width={220} height={24} />
        <div className="sk-flash-row">
          {Array.from({ length: 5 }, (_, i) => (
            <ProductCardSkeleton key={i} className="sk-flash-card" />
          ))}
        </div>
      </div>

      {/* Featured grid ×8 — khớp .featured-grid 4 cột */}
      <div className="sk-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
