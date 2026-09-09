import { describe, expect, it, beforeEach } from 'vitest';
import {
  COUPON_CARRY_KEY,
  clearCarryCoupon,
  getCarryCoupon,
  setCarryCoupon
} from './couponCarry';

describe('couponCarry (FI-393 T5)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('set → get trả đúng code (key ecommerce.coupon)', () => {
    setCarryCoupon('WELCOME10');
    expect(window.sessionStorage.getItem(COUPON_CARRY_KEY)).toBe('WELCOME10');
    expect(getCarryCoupon()).toBe('WELCOME10');
  });

  it('chưa set → get trả null (không ném)', () => {
    expect(getCarryCoupon()).toBeNull();
  });

  it('clear → key bị xóa, get về null', () => {
    setCarryCoupon('SALE20');
    clearCarryCoupon();
    expect(window.sessionStorage.getItem(COUPON_CARRY_KEY)).toBeNull();
    expect(getCarryCoupon()).toBeNull();
  });

  it('set đè code cũ (áp mã mới thay mã trước)', () => {
    setCarryCoupon('OLD');
    setCarryCoupon('NEW');
    expect(getCarryCoupon()).toBe('NEW');
  });
});
