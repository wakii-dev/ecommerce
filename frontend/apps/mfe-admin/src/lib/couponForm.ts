// lib/couponForm.ts — state form coupon + mapping pure sang AdminCouponWrite
// (amendment A3) và ngược lại từ AdminCoupon view. Test node được (không React)
// — pattern lib/productForm.ts. Validation mirror BE §4.10
// (CouponService.validateAdmin): code [A-Za-z0-9_-]{1,64}; PERCENT value 1-100;
// FIXED value > 0; minOrderValue ≥ 0; endsAt sau startsAt (cửa sổ không rỗng);
// usageLimit ≥ 1 hoặc bỏ trống (không giới hạn).
//
// Types local cấu trúc-đúng với AdminCoupon/AdminCouponWrite (A3) — swap sang
// generated `operations` khi coordinator apply A3 + regen contracts (FI-371).

import { localDateTimeToIso, isoToLocalDateTime } from './productForm';

/** = AdminCoupon (A3) — admin view đủ usage fields (khác PublicCoupon). */
export interface AdminCouponView {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderValue?: number;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  usedCount: number;
  active: boolean;
  description: string;
}

/** = AdminCouponWrite (A3) — create/update body (code không đổi khi update). */
export interface CouponWriteBody {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderValue?: number;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  active?: boolean;
  description?: string;
}

export interface CouponFormState {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: string;
  minOrderValue: string;
  /** datetime-local value — rỗng = now (create). */
  startsAt: string;
  /** rỗng = không hạn. */
  endsAt: string;
  /** rỗng = không giới hạn. */
  usageLimit: string;
  active: boolean;
  description: string;
}

export function emptyCouponForm(): CouponFormState {
  return {
    code: '',
    type: 'PERCENT',
    value: '',
    minOrderValue: '',
    startsAt: '',
    endsAt: '',
    usageLimit: '',
    active: true,
    description: ''
  };
}

/** View → Form (edit round-trip — code hiển thị nhưng khóa, không đổi PK). */
export function couponToForm(view: AdminCouponView): CouponFormState {
  return {
    code: view.code,
    type: view.type,
    value: String(view.value),
    minOrderValue: view.minOrderValue !== undefined ? String(view.minOrderValue) : '',
    startsAt: isoToLocalDateTime(view.startsAt),
    endsAt: isoToLocalDateTime(view.endsAt),
    usageLimit: view.usageLimit !== undefined ? String(view.usageLimit) : '',
    active: view.active,
    description: view.description
  };
}

/** Guard số như productForm: Infinity/NaN ("1e999") đều chặn, không lọt payload. */
function toFiniteInt(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : Number.NaN;
}

/** Field keys lỗi — page map sang i18n, hiển thị list, không toast khi rỗng. */
export type CouponFieldError = 'code' | 'value' | 'minOrderValue' | 'window' | 'usageLimit';

export function buildCouponWrite(state: CouponFormState): {
  payload: CouponWriteBody | null;
  errors: CouponFieldError[];
} {
  const errors: CouponFieldError[] = [];
  const code = state.code.trim();

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) errors.push('code');

  const value = toFiniteInt(state.value);
  if (state.type === 'PERCENT' && (Number.isNaN(value) || value < 1 || value > 100)) {
    errors.push('value');
  }
  if (state.type === 'FIXED' && (Number.isNaN(value) || value <= 0)) {
    errors.push('value');
  }

  const minOrderValue =
    state.minOrderValue.trim() !== '' ? toFiniteInt(state.minOrderValue) : undefined;
  if (minOrderValue !== undefined && (Number.isNaN(minOrderValue) || minOrderValue < 0)) {
    errors.push('minOrderValue');
  }

  const startsAt = localDateTimeToIso(state.startsAt);
  const endsAt = localDateTimeToIso(state.endsAt);
  // Cửa sổ không rỗng (BE: endsAt > effectiveStart; effectiveStart = startsAt || now)
  if (endsAt !== undefined) {
    const effectiveStart = startsAt !== undefined ? Date.parse(startsAt) : Date.now();
    if (Number.isNaN(effectiveStart) || Date.parse(endsAt) <= effectiveStart) {
      errors.push('window');
    }
  }

  const usageLimit = state.usageLimit.trim() !== '' ? toFiniteInt(state.usageLimit) : undefined;
  if (usageLimit !== undefined && (Number.isNaN(usageLimit) || usageLimit < 1)) {
    errors.push('usageLimit');
  }

  if (errors.length > 0) return { payload: null, errors };

  return {
    payload: {
      code,
      type: state.type,
      value,
      minOrderValue,
      startsAt,
      endsAt,
      usageLimit,
      active: state.active,
      description: state.description.trim()
    },
    errors: []
  };
}
