'use client';

import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';

import type { Locale } from '../../lib/format';
import { t } from '../../lib/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Stock alert PDP (SF-15): variant đang chọn hết hàng (availability === 0) →
 * hiện form "Nhắn tôi khi có hàng" → POST /api/catalog/products/{slug}/
 * stock-alert (public, 202). Pattern AddToCart: fetch availability qua Next
 * rewrite; fetch lỗi/không xác định (null) → ẨN form (không hiện khi không
 * biết trạng thái — guest vẫn đọc được qua public-paths inventory availability).
 * T12: copy trong lib/i18n (miền `pdp.stock*`).
 */
export default function StockAlertInput({ variantId, slug, locale }: {
  variantId: string | null;
  slug: string;
  locale: Locale;
}): ReactElement | null {
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
      setError(t(locale, 'pdp.stockInvalidEmail'));
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
      setError(t(locale, 'pdp.stockFail'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="pdp-stock-alert" data-testid="stock-alert">
      {done ? (
        <p className="pdp-stock-alert-ok" role="status">{t(locale, 'pdp.stockOk')}</p>
      ) : (
        <>
          <p className="pdp-stock-alert-title">{t(locale, 'pdp.stockTitle')}</p>
          <form onSubmit={(e) => void submit(e)} noValidate className="pdp-stock-alert-form">
            <input
              type="email"
              name="email"
              className="pdp-stock-alert-input"
              placeholder={t(locale, 'pdp.stockEmail')}
              autoComplete="email"
              aria-label={t(locale, 'pdp.stockEmail')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="pdp-stock-alert-btn" disabled={pending}>
              {t(locale, 'pdp.stockSubmit')}
            </button>
          </form>
          {error ? <p className="pdp-stock-alert-error" role="alert">{error}</p> : null}
        </>
      )}
    </div>
  );
}
