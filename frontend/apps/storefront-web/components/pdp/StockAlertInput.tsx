'use client';

import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type { Locale } from '../../lib/format';

const COPY = {
  vi: {
    title: 'Hết hàng — nhắn tôi khi có hàng',
    email: 'Email của bạn',
    submit: 'Nhắn tôi khi có hàng',
    ok: 'Đã đăng ký ✓ Sẽ nhắn bạn ngay khi hàng về.',
    fail: 'Không đăng ký được — thử lại sau.',
    invalidEmail: 'Email không hợp lệ',
  },
  en: {
    title: 'Out of stock — notify me when back',
    email: 'Your email',
    submit: 'Notify me when available',
    ok: 'Subscribed ✓ We will email you when it is back.',
    fail: 'Could not subscribe — try again later.',
    invalidEmail: 'Invalid email',
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Stock alert PDP (SF-15): variant đang chọn hết hàng (availability === 0) →
 * hiện form "Nhắn tôi khi có hàng" → POST /api/catalog/products/{slug}/
 * stock-alert (public, 202). Pattern AddToCart: fetch availability qua Next
 * rewrite; fetch lỗi/không xác định (null) → ẨN form (không hiện khi không
 * biết trạng thái — guest vẫn đọc được qua public-paths inventory availability).
 */
export default function StockAlertInput({ variantId, slug, locale }: {
  variantId: string | null;
  slug: string;
  locale: Locale;
}): ReactElement | null {
  const copy = COPY[locale];
  const [available, setAvailable] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!variantId) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    setAvailable(null);
    setDone(false);
    fetch(`/api/inventory/availability?variantIds=${encodeURIComponent(variantId)}`, {
      credentials: 'same-origin',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const body: unknown = await res.json();
        const items = Array.isArray(body) ? body : [];
        const match = items.find((item) => (item as { variantId?: string })?.variantId === variantId);
        return cancelled ? null : typeof match?.available === 'number' ? match.available : null;
      })
      .catch(() => null)
      .then((value) => {
        if (!cancelled) setAvailable(value);
      });
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  // Chỉ hiện khi CHẮC CHẮN hết hàng; lỗi mạng/unknown → ẩn (P1 spec-critic).
  // done → giữ banner xác nhận dù availability đổi giữa chừng.
  if (!variantId) return null;
  if (!done && available !== 0) return null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError(copy.invalidEmail);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/catalog/products/${encodeURIComponent(slug)}/stock-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), variantId }),
      });
      if (!res.ok) throw new Error(`stock-alert ${res.status}`);
      setDone(true);
    } catch {
      setError(copy.fail);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="pdp-stock-alert" data-testid="stock-alert">
      {done ? (
        <p className="pdp-stock-alert-ok" role="status">{copy.ok}</p>
      ) : (
        <>
          <p className="pdp-stock-alert-title">{copy.title}</p>
          <form onSubmit={(e) => void submit(e)} noValidate className="pdp-stock-alert-form">
            <input
              type="email"
              name="email"
              className="pdp-stock-alert-input"
              placeholder={copy.email}
              autoComplete="email"
              aria-label={copy.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="pdp-stock-alert-btn" disabled={pending}>
              {copy.submit}
            </button>
          </form>
          {error ? <p className="pdp-stock-alert-error" role="alert">{error}</p> : null}
        </>
      )}
    </div>
  );
}
