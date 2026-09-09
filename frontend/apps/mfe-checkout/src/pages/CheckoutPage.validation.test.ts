import { describe, expect, it } from 'vitest';
import { fieldInvalid } from './CheckoutPage';

/**
 * FI-393 review-G3 — unit test predicate validation realtime (T7).
 *
 * `fieldInvalid` là pure predicate: KHÔNG đụng React/i18n — message catalog
 * (`checkout.step1.<name>.error`) được gắn lúc render trong CheckoutPage,
 * nên chỉ cần test đúng/sai của rule.
 *
 * Invariant touched-gating (để lại inline JSX trong component — KHÔNG refactor
 * hành vi): `field(name)` chỉ hiện error khi `touched[name] === true` — true
 * được set onBlur hoặc khi submit toàn form (submit = chạm mọi field); onChange
 * re-validate CHỈ khi field đã touched. Nghĩa là: lỗi chưa-blur chưa hiện,
 * và lỗi đã hiện biến mất NGAY khi user sửa thành giá trị hợp lệ. Logic này
 * nằm trong closure component nên không unit-test được nếu không render —
 * branch render đã được cover bởi e2e SF-3.
 */
describe('fieldInvalid — rule từng field checkout (FI-393 T7)', () => {
  describe('fullName — trim().length >= 2', () => {
    it('rỗng / dưới 2 ký tự sau trim → invalid', () => {
      expect(fieldInvalid('fullName', '')).toBe(true);
      expect(fieldInvalid('fullName', 'A')).toBe(true);
      expect(fieldInvalid('fullName', '   ')).toBe(true); // trim → rỗng
      expect(fieldInvalid('fullName', ' A ')).toBe(true); // trim → 'A' (1 ký tự)
    });

    it('biên đúng 2 ký tự sau trim trở lên → valid', () => {
      expect(fieldInvalid('fullName', 'An')).toBe(false);
      expect(fieldInvalid('fullName', ' An ')).toBe(false);
      expect(fieldInvalid('fullName', 'Nguyen Van A')).toBe(false);
    });
  });

  describe('phone — /^(0|\\+84)[\\s.-]?(\\d[\\s.-]?){8,10}$/', () => {
    it('đầu số 0, đủ 8-10 số → valid', () => {
      expect(fieldInvalid('phone', '0901234567')).toBe(false);
    });

    it('+84 quốc tế (regex chấp nhận) → valid', () => {
      expect(fieldInvalid('phone', '+84901234567')).toBe(false);
    });

    it('chữ / sai đầu số / quá ngắn → invalid', () => {
      expect(fieldInvalid('phone', 'abc')).toBe(true);
      expect(fieldInvalid('phone', '12345678901')).toBe(true); // không 0/+84
      expect(fieldInvalid('phone', '0901234')).toBe(true); // 7 số < lower bound
      expect(fieldInvalid('phone', '')).toBe(true);
    });

    it('biên lower bound: 8 số SAU đầu số (9 số tổng) → valid; 7 số → invalid', () => {
      expect(fieldInvalid('phone', '090123456')).toBe(false);
      expect(fieldInvalid('phone', '09012345')).toBe(true); // 7 số sau đầu số — dưới bound
    });
  });

  describe('line1 — trim().length >= 4', () => {
    it('rỗng / dưới 4 ký tự sau trim → invalid', () => {
      expect(fieldInvalid('line1', '')).toBe(true);
      expect(fieldInvalid('line1', '12 ')).toBe(true); // trim '12' (2 ký tự)
      expect(fieldInvalid('line1', 'abc')).toBe(true); // 3 ký tự
    });

    it('biên đúng 4 ký tự sau trim trở lên → valid', () => {
      expect(fieldInvalid('line1', 'abcd')).toBe(false);
      expect(fieldInvalid('line1', '12 Nguyen Hue')).toBe(false);
    });
  });

  describe.each(['ward', 'district', 'city'] as const)('%s — non-empty sau trim', (name) => {
    it('rỗng / toàn khoảng trắng → invalid', () => {
      expect(fieldInvalid(name, '')).toBe(true);
      expect(fieldInvalid(name, '   ')).toBe(true);
    });

    it('có nội dung → valid', () => {
      expect(fieldInvalid(name, 'X')).toBe(false);
    });
  });
});
