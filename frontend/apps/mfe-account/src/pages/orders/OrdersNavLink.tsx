// pages/orders/OrdersNavLink.tsx — widget đăng ký vào header slot (slot registry:
// remote đăng ký widget TỪ app của mình, không sửa Header của shell — SF-9 slice).
// Chỉ hiện khi đã đăng nhập (useAuth từ singleton @ecommerce/auth).
import type { ReactElement } from 'react';
import { useAuth } from '@ecommerce/auth';
import { appNavigate } from '../../bootstrap';

export default function OrdersNavLink(): ReactElement | null {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <a
      href="/account/orders"
      data-testid="orders-nav-link"
      onClick={(event) => {
        event.preventDefault();
        appNavigate('/account/orders');
      }}
      style={{
        color: 'var(--c-text, #212121)',
        fontSize: 'var(--text-md, 14px)',
        textDecoration: 'none'
      }}
    >
      Đơn hàng
    </a>
  );
}
