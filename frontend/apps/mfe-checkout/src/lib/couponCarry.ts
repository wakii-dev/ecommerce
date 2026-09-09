/**
 * couponCarry (FI-393 T5) — giữ mã giảm giá áp ở CartPage sang CheckoutPage
 * qua sessionStorage (precedent `ecommerce.last_order`). Same-origin cả
 * standalone lẫn shell-mounted → đọc được ở 2 đầu. try/catch mọi thao tác
 * (private mode / storage đầy → im lặng, flow checkout không chết vì carry).
 * Server-authoritative: checkout vẫn validate LẠI qua validate-coupon lúc
 * auto-apply — stale code fail → clear ngay (không re-error mỗi lần vào).
 */

export const COUPON_CARRY_KEY = 'ecommerce.coupon';

export function setCarryCoupon(code: string): void {
  try {
    window.sessionStorage.setItem(COUPON_CARRY_KEY, code);
  } catch {
    // private mode / storage đầy — carry là enhancement, không chặn flow
  }
}

export function getCarryCoupon(): string | null {
  try {
    return window.sessionStorage.getItem(COUPON_CARRY_KEY);
  } catch {
    return null;
  }
}

export function clearCarryCoupon(): void {
  try {
    window.sessionStorage.removeItem(COUPON_CARRY_KEY);
  } catch {
    // ignore
  }
}
