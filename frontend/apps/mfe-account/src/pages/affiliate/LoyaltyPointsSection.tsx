import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Badge, Card, ListSkeleton } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';
import { useT } from '@ecommerce/i18n';
import { appNavigate, authReady } from '../../bootstrap';
import { fetchMyLoyalty, type LoyaltyAccount } from './loyaltyApi';

/**
 * Section điểm thưởng (SF-14, FI-324, D22) — chắp vào trang affiliate theo
 * pack ("account dashboard block điểm"). Điểm earn 1% mỗi đơn CONFIRMED,
 * dùng ở checkout để giảm tiền; hiển thị quy đổi VND (1 điểm = 100đ).
 * Tự fetch độc lập — khách không đăng ký affiliate vẫn thấy điểm.
 * SF-4 (FI-394 T9): `<section id="loyalty">` anchor — side-nav item
 * /account/affiliate#loyalty scrollIntoView sau loaded (tôn trọng
 * prefers-reduced-motion); stats → KPI pattern (value màu chuẩn, quy đổi
 * thành Badge tint-primary — KHÔNG tô value --c-primary); loading →
 * ListSkeleton; i18n `account.loyalty.*`.
 */
export default function LoyaltyPointsSection(): ReactElement {
  const { t } = useT();
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    authReady.then(() => {
      if (!alive) return;
      if (!authStore.isAuthenticated()) {
        appNavigate('/login');
        return;
      }
      fetchMyLoyalty()
        .then((acc) => {
          if (alive) {
            setAccount(acc);
            setLoaded(true);
          }
        })
        .catch(() => alive && setLoaded(true));
    });
    return () => {
      alive = false;
    };
  }, []);

  // Anchor #loyalty — scroll SAU khi loaded (deps [loaded]; section đã mount).
  useEffect(() => {
    if (!loaded) return;
    if (typeof window === 'undefined' || window.location.hash !== '#loyalty') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sectionRef.current?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [loaded]);

  if (!loaded) {
    return (
      <section
        id="loyalty"
        data-testid="loyalty-section"
        className="af-loyalty"
        ref={sectionRef}
        aria-label={t('account.loyalty.loading')}
      >
        <ListSkeleton count={1} />
      </section>
    );
  }

  return (
    <section
      id="loyalty"
      data-testid="loyalty-section"
      className="af-loyalty"
      ref={sectionRef}
    >
      <Card>
        <h2 className="auth-subtitle af-loyalty__title">{t('account.loyalty.title')}</h2>
        {account ? (
          <div className="af-kpis">
            <Card>
              <p className="af-kpi__label">{t('account.loyalty.balance')}</p>
              <p className="af-kpi__value">
                <span data-testid="loyalty-balance">
                  {account.balance.toLocaleString('vi-VN')}
                </span>{' '}
                <span className="af-kpi__unit">{t('account.loyalty.points')}</span>
              </p>
              <Badge variant="primary">≈ {formatPrice(account.balance * 100)}</Badge>
            </Card>
            <Card>
              <p className="af-kpi__label">{t('account.loyalty.totalEarned')}</p>
              <p className="af-kpi__value">
                {account.totalEarned.toLocaleString('vi-VN')}{' '}
                <span className="af-kpi__unit">{t('account.loyalty.points')}</span>
              </p>
            </Card>
            <Card>
              <p className="af-kpi__label">{t('account.loyalty.convert')}</p>
              <p className="af-kpi__value">
                {t('account.loyalty.convertRate', {
                  amount: formatPrice(account.balance * 100),
                })}
              </p>
            </Card>
          </div>
        ) : (
          <p className="af-loyalty__error">{t('account.loyalty.errorLoad')}</p>
        )}
      </Card>
    </section>
  );
}
