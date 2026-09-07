import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Card } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { authStore } from '@ecommerce/auth';
import { appNavigate, authReady } from '../../bootstrap';
import { fetchMyLoyalty, type LoyaltyAccount } from './loyaltyApi';

/**
 * Section điểm thưởng (SF-14, FI-324, D22) — chắp vào trang affiliate theo
 * pack ("account dashboard block điểm"). Điểm earn 1% mỗi đơn CONFIRMED,
 * dùng ở checkout để giảm tiền; hiển thị quy đổi VND (1 điểm = 100đ).
 * Tự fetch độc lập — khách không đăng ký affiliate vẫn thấy điểm.
 */
export default function LoyaltyPointsSection(): ReactElement {
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  if (!loaded) {
    return (
      <Card>
        <p style={{ margin: 0, color: 'var(--c-text-secondary, #666)' }}>Đang tải điểm thưởng…</p>
      </Card>
    );
  }

  return (
    <Card data-testid="loyalty-section">
      <h2 className="auth-subtitle" style={{ marginTop: 0 }}>Điểm thưởng</h2>
      {account ? (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div data-testid="loyalty-balance">
            <div style={{ color: 'var(--c-text-secondary, #666)', fontSize: 'var(--text-sm, 13px)' }}>
              Điểm hiện có
            </div>
            <strong style={{ fontSize: 22, color: 'var(--c-primary, #F53D2D)' }}>
              {account.balance.toLocaleString('vi-VN')}
            </strong>{' '}
            điểm
          </div>
          <div>
            <div style={{ color: 'var(--c-text-secondary, #666)', fontSize: 'var(--text-sm, 13px)' }}>
              Tổng đã nhận
            </div>
            <strong>{account.totalEarned.toLocaleString('vi-VN')}</strong> điểm
          </div>
          <div>
            <div style={{ color: 'var(--c-text-secondary, #666)', fontSize: 'var(--text-sm, 13px)' }}>
              Quy đổi khi mua hàng
            </div>
            ≈ {formatPrice(account.balance * 100)} (1 điểm = 100đ)
          </div>
        </div>
      ) : (
        <p style={{ margin: 0 }}>Không tải được điểm thưởng — thử tải lại trang.</p>
      )}
    </Card>
  );
}
