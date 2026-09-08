import { describe, expect, it } from 'vitest';

import { COPY } from '../components/pdp/AddToCart';

/**
 * SF-3 honesty-pass (FI-372 T4): toastFail phải là LỖI THẬT — cấm quay lại
 * copy hứa hẹn giả của bản cũ (hứa "sớm có" khi cart đã sống từ SF-6).
 * Hành vi toast (route.abort → toast hiển thị) assert ở E2E nav-honesty.spec.
 */
describe('AddToCart COPY — honesty', () => {
  it('toastFail là lỗi thật, cả 2 locale', () => {
    expect(COPY.vi.toastFail).toBe('Không thêm được vào giỏ — thử lại');
    expect(COPY.en.toastFail).toBe("Couldn't add to cart — please try again");
  });

  it('không COPY value nào hứa hẹn giả (soon/sớm/coming)', () => {
    for (const locale of [COPY.vi, COPY.en] as const) {
      for (const [key, value] of Object.entries(locale)) {
        expect(value, `${locale === COPY.vi ? 'vi' : 'en'}.${key}`).not.toMatch(/soon|sớm/i);
      }
    }
  });
});
