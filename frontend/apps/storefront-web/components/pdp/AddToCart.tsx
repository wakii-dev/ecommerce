'use client';

import { useEffect, useRef, useState } from 'react';

import type { Locale } from '../../lib/format';

/**
 * AddToCartStub PDP (plan Task 13): qty stepper (−/+ 36px, input 44px, 1–99)
 * + 2 CTA §3 — "THÊM VÀO GIỎ" outline 2px + "MUA NGAY" gradient. Cả hai POST
 * `/api/cart/items` qua rewrites proxy (Conventions #10) — lỗi MỌI loại
 * (network/non-ok/SF-9 chưa có) → toast êm "Giỏ hàng sẽ sớm khả dụng", KHÔNG
 * crash. Toast = implementation nội bộ tối giản (ui-kit Toast là primitive
 * stateful client — không deep-import vào client graph).
 *
 * Tồn kho: fetch `GET /api/inventory/availability?variantIds={id}` (contract
 * inventory: availability theo VARIANT — bỏ qua khi chưa chọn variant).
 * Lỗi/404/non-array → KHÔNG render UI tồn kho (SF-5 chưa merge → ẩn luôn).
 */

const COPY = {
  vi: {
    add: 'THÊM VÀO GIỎ',
    buy: 'MUA NGAY',
    toast: 'Giỏ hàng sẽ sớm khả dụng',
    inStock: 'Còn hàng',
    outStock: 'Hết hàng',
    qty: 'Số lượng',
  },
  en: {
    add: 'ADD TO CART',
    buy: 'BUY NOW',
    toast: 'Cart is coming soon',
    inStock: 'In stock',
    outStock: 'Out of stock',
    qty: 'Quantity',
  },
} as const;

interface AddToCartProps {
  productId: string;
  /** Variant đang chọn — null → POST không variantId (sản phẩm không variant). */
  variantId: string | null;
  locale: Locale;
}

export default function AddToCart({ productId, variantId, locale }: AddToCartProps) {
  const copy = COPY[locale];
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState(false);
  const [stock, setStock] = useState<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tồn kho theo variant — endpoint chết/lỗi → stock = null → ẩn UI (không crash).
  useEffect(() => {
    if (!variantId) {
      setStock(null);
      return;
    }
    let cancelled = false;
    setStock(null);
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
      .then((available) => {
        if (!cancelled) setStock(available);
      });
    return () => {
      cancelled = true;
    };
  }, [variantId]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function showToast(): void {
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2500);
  }

  async function submit(): Promise<void> {
    if (pending) return; // chặn double-submit
    setPending(true);
    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ productId, variantId, quantity: qty }),
      });
      // SF-9 chưa merge → mọi status đều rơi vào toast êm (giữ stub không crash).
      if (!res.ok) throw new Error(`cart ${res.status}`);
    } catch {
      showToast();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pdp-atc">
      <div className="pdp-atc-row">
        <span className="pdp-variant-label">{copy.qty}</span>
        <div className="pdp-stepper" role="group" aria-label={copy.qty}>
          <button
            type="button"
            className="pdp-stepper-btn"
            aria-label="−"
            disabled={qty <= 1 || pending}
            onClick={() => setQty((value) => Math.max(1, value - 1))}
          >
            −
          </button>
          <input
            className="pdp-stepper-input"
            type="number"
            min={1}
            max={99}
            value={qty}
            aria-label={copy.qty}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              setQty(Number.isNaN(next) ? 1 : Math.min(99, Math.max(1, next)));
            }}
          />
          <button
            type="button"
            className="pdp-stepper-btn"
            aria-label="+"
            disabled={qty >= 99 || pending}
            onClick={() => setQty((value) => Math.min(99, value + 1))}
          >
            +
          </button>
        </div>
        {stock !== null ? (
          stock > 0 ? (
            <span className="pdp-stock pdp-stock--in">{copy.inStock}</span>
          ) : (
            <span className="pdp-stock pdp-stock--out">{copy.outStock}</span>
          )
        ) : null}
      </div>

      <div className="pdp-cta-row">
        <button type="button" className="pdp-cta pdp-cta--secondary" disabled={pending} onClick={submit}>
          {copy.add}
        </button>
        <button type="button" className="pdp-cta pdp-cta--primary" disabled={pending} onClick={submit}>
          {copy.buy}
        </button>
      </div>

      {toast ? (
        <div className="pdp-toast" role="status">
          {copy.toast}
        </div>
      ) : null}
    </div>
  );
}
