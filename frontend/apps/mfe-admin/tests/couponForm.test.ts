import { describe, expect, it } from 'vitest';

import {
  buildCouponWrite,
  couponToForm,
  emptyCouponForm,
  type AdminCouponView,
  type CouponFormState
} from '../src/lib/couponForm';

function baseForm(): CouponFormState {
  return { ...emptyCouponForm(), code: 'WELCOME10', value: '10', usageLimit: '100' };
}

describe('buildCouponWrite', () => {
  it('PERCENT hợp lệ → payload đủ field, rỗng = undefined', () => {
    const { payload, errors } = buildCouponWrite(baseForm());
    expect(errors).toEqual([]);
    expect(payload).toEqual({
      code: 'WELCOME10',
      type: 'PERCENT',
      value: 10,
      minOrderValue: undefined,
      startsAt: undefined,
      endsAt: undefined,
      usageLimit: 100,
      active: true,
      description: ''
    });
  });

  it('PERCENT ngoài [1,100] → lỗi value (mirror BE 400)', () => {
    expect(buildCouponWrite({ ...baseForm(), value: '0' }).errors).toContain('value');
    expect(buildCouponWrite({ ...baseForm(), value: '101' }).errors).toContain('value');
    expect(buildCouponWrite({ ...baseForm(), value: '50' }).errors).not.toContain('value');
  });

  it('FIXED ≤ 0 → lỗi value; FIXED lớn hợp lệ', () => {
    expect(buildCouponWrite({ ...baseForm(), type: 'FIXED', value: '-1' }).errors).toContain('value');
    expect(buildCouponWrite({ ...baseForm(), type: 'FIXED', value: '0' }).errors).toContain('value');
    expect(buildCouponWrite({ ...baseForm(), type: 'FIXED', value: '50000' }).errors).toEqual([]);
  });

  it('garbage số "1e999" (Infinity) → chặn, không lọt payload (guard FI-368 T8)', () => {
    expect(buildCouponWrite({ ...baseForm(), value: '1e999' }).errors).toContain('value');
    expect(
      buildCouponWrite({ ...baseForm(), minOrderValue: '1e999' }).errors
    ).toContain('minOrderValue');
  });

  it('code sai format/độ dài → lỗi code (regex BE [A-Za-z0-9_-]{1,64})', () => {
    expect(buildCouponWrite({ ...baseForm(), code: '' }).errors).toContain('code');
    expect(buildCouponWrite({ ...baseForm(), code: 'it bad code!' }).errors).toContain('code');
    expect(buildCouponWrite({ ...baseForm(), code: 'a'.repeat(65) }).errors).toContain('code');
    expect(buildCouponWrite({ ...baseForm(), code: 'a'.repeat(64) }).errors).not.toContain('code');
    expect(buildCouponWrite({ ...baseForm(), code: 'AB-c_9' }).errors).not.toContain('code');
  });

  it('cửa sổ rỗng (endsAt ≤ startsAt/now) → lỗi window; không endsAt thì ok', () => {
    expect(
      buildCouponWrite({ ...baseForm(), startsAt: '2030-01-01T10:00', endsAt: '2030-01-01T09:00' }).errors
    ).toContain('window');
    expect(
      buildCouponWrite({ ...baseForm(), startsAt: '2030-01-01T10:00', endsAt: '2030-01-01T10:00' }).errors
    ).toContain('window');
    expect(
      buildCouponWrite({ ...baseForm(), startsAt: '2030-01-01T10:00', endsAt: '2030-01-01T10:01' }).errors
    ).toEqual([]);
    expect(buildCouponWrite({ ...baseForm(), endsAt: '' }).errors).toEqual([]);
  });

  it('usageLimit 0 → lỗi; trống = không giới hạn (undefined)', () => {
    expect(buildCouponWrite({ ...baseForm(), usageLimit: '0' }).errors).toContain('usageLimit');
    const noLimit = buildCouponWrite({ ...baseForm(), usageLimit: '' });
    expect(noLimit.errors).toEqual([]);
    expect(noLimit.payload?.usageLimit).toBeUndefined();
  });

  it('minOrderValue âm → lỗi; ≥ 0 hợp lệ', () => {
    expect(buildCouponWrite({ ...baseForm(), minOrderValue: '-1' }).errors).toContain('minOrderValue');
    expect(buildCouponWrite({ ...baseForm(), minOrderValue: '0' }).errors).toEqual([]);
  });
});

describe('couponToForm round-trip', () => {
  it('view → form → payload giữ nguyên giá trị policy + usage không đụng', () => {
    const view: AdminCouponView = {
      code: 'GIAM50K',
      type: 'FIXED',
      value: 50000,
      minOrderValue: 500000,
      startsAt: '2026-09-01T00:00:00Z',
      endsAt: undefined,
      usageLimit: 100,
      usedCount: 7,
      active: true,
      description: 'Giảm 50.000đ'
    };
    const form = couponToForm(view);
    expect(form.code).toBe('GIAM50K');
    expect(form.value).toBe('50000');
    expect(form.minOrderValue).toBe('500000');
    expect(form.usageLimit).toBe('100');

    const { payload, errors } = buildCouponWrite(form);
    expect(errors).toEqual([]);
    expect(payload?.code).toBe('GIAM50K');
    expect(payload?.value).toBe(50000);
    expect(payload?.usageLimit).toBe(100);
    // usedCount KHÔNG nằm trong write payload — server preserve (domain applyUpdate)
    expect(payload).not.toHaveProperty('usedCount');
  });

  it('inactive view → form active=false → payload active=false (toggle qua edit)', () => {
    const view: AdminCouponView = {
      code: 'OFF10',
      type: 'PERCENT',
      value: 10,
      usedCount: 0,
      active: false,
      description: ''
    };
    expect(couponToForm(view).active).toBe(false);
    expect(buildCouponWrite(couponToForm(view)).payload?.active).toBe(false);
  });
});
