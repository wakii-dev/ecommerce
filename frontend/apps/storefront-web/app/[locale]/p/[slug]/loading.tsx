import { Skeleton } from '../../../../components/ui-kit';

/**
 * PDP loading (FI-392 T2) — gallery square + info lines, khớp .pdp-layout
 * (media 45% + info). KHÔNG fetch — reserve CLS. Server component (no hook).
 */
export default function PdpLoading() {
  return (
    <div className="container sk-pdp-wrap" aria-busy="true">
      <p className="sk-sr-only" role="status">
        Đang tải sản phẩm… / Loading product…
      </p>
      <div className="sk-pdp">
        <div className="sk-pdp-media" aria-hidden="true">
          <div className="uk-skeleton sk-pdp-gallery" />
          <div className="sk-pdp-thumbs">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="uk-skeleton sk-pdp-thumb" />
            ))}
          </div>
        </div>
        <div className="sk-pdp-info" aria-hidden="true">
          <Skeleton variant="text" width="70%" height={28} />
          <Skeleton variant="text" width="30%" height={14} />
          <Skeleton variant="text" width="40%" height={24} />
          <Skeleton variant="text" width="100%" height={14} count={2} />
          <div className="uk-skeleton sk-pdp-cta" />
        </div>
      </div>
    </div>
  );
}
