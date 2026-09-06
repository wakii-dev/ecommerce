'use client';

import { useEffect, useRef, useState } from 'react';

import type { Locale } from '../../lib/format';
import { shellUrl } from '../../lib/site';

/**
 * AddToCart PDP (SF-4 → wire THẬT ở SF-6): qty stepper (−/+ 36px, input 44px,
 * 1–99) + 2 CTA §3 — "THÊM VÀO GIỎ" outline 2px + "MUA NGAY" gradient. Cả hai
 * POST `/api/cart/items?slug={slug}` qua rewrites proxy (Conventions #10) —
 * cart-service (SF-6, port 8083) nhận thật: auto-create guest + Set-Cookie
 * cart_token; thành công → toast "Đã thêm vào giỏ" + dispatch
 * `ecommerce:cart-changed` (CartBadge của shell cùng window qua gateway tự
 * refresh) + nhớ cartToken (localStorage ecommerce.guest_cart_token) cho
 * merge-on-login. Lỗi MẠNG (cart-service chết) → toast êm cũ, KHÔNG crash.
 * "MUA NGAY" → thêm xong điều hướng /cart (shell app pages, cùng cookie jar
 * localhost — cookie không phân biệt port).
 *
 * Slug hint: catalog không có lookup theo productId (REQUIREMENT-GAP FI-310)
 * → cart-service enrich qua GET /api/catalog/products/{slug} bằng hint này.
 *
 * Tồn kho: fetch `GET /api/inventory/availability?variantIds={id}` (contract
 * inventory: availability theo VARIANT — bỏ qua khi chưa chọn variant).
 * Lỗi/404/non-array → KHÔNG render UI tồn kho (cart vẫn kiểm 409 lúc add).
 */

/** Shell origin (cart/checkout là trang shell, KHÔNG phải route Next —
 *  code-review P1: '/cart' relative 404 trên mọi dev topology). Next app dùng
 *  process.env.NEXT_PUBLIC_* (KHÔNG import.meta.env — Vite-only, crash PDP). */

const COPY = {
  vi: {
    add: 'THÊM VÀO GIỎ',
    buy: 'MUA NGAY',
    toastFail: 'Giỏ hàng sẽ sớm khả dụng',
    toastOk: 'Đã thêm vào giỏ ✓',
    inStock: 'Còn hàng',
    outStock: 'Hết hàng',
    qty: 'Số lượng',
  },
  en: {
    add: 'ADD TO CART',
    buy: 'BUY NOW',
    toastFail: 'Cart is coming soon',
    toastOk: 'Added to cart ✓',
    inStock: 'In stock',
    outStock: 'Out of stock',
    qty: 'Quantity',
  },
} as const;

/**
 * Payload AddItemRequest (contracts/generated/cartSchema.d.ts — POST /items):
 * `qty` (KHÔNG phải `quantity`); variantId OMIT khi null (contract: string khi
 * có mặt). Pure fn — unit-test được shape ở tests/pdp.test.ts.
 */
export function buildAddItemPayload(
  productId: string,
  variantId: string | null,
  qty: number,
): { productId: string; variantId?: string; qty: number } {
  return { productId, ...(variantId ? { variantId } : {}), qty };
}

interface AddToCartProps {
  productId: string;
  /** Variant đang chọn — null → POST không variantId (sản phẩm không variant). */
  variantId: string | null;
  /** Slug vi của product — hint cho cart-service enrichment (SF-6). */
  slug: string;
  locale: Locale;
}

export default function AddToCart({ productId, variantId, slug, locale }: AddToCartProps) {
  const copy = COPY[locale];
  const [qty, setQty] = useState(1);
  const [pending, setPending] = useState(false);
  const [toastOk, setToastOk] = useState(false);
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

  function showToast(ok: boolean): void {
    setToastOk(ok);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 2500);
  }

  async function submit(buyNow: boolean): Promise<void> {
    if (pending) return; // chặn double-submit
    setPending(true);
    try {
      const params = slug ? `?slug=${encodeURIComponent(slug)}` : '';
      const res = await fetch(`/api/cart/items${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(buildAddItemPayload(productId, variantId, qty)),
      });
      if (!res.ok) throw new Error(`cart ${res.status}`);
      // Thành công thật (SF-6): nhớ guest token cho merge-on-login + báo badge
      const cart = (await res.json()) as { cartToken?: string | null };
      if (cart.cartToken) {
        try {
          window.localStorage.setItem('ecommerce.guest_cart_token', cart.cartToken);
        } catch {
          // private mode — merge sẽ dùng cookie leniency phía server
        }
      }
      window.dispatchEvent(new CustomEvent('ecommerce:cart-changed'));
      showToast(true);
      if (buyNow) window.location.assign(`${shellUrl()}/cart`);
    } catch {
      // network/cart-service chết → toast êm (giữ hành vi cũ, không crash)
      showToast(false);
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
        <button
          type="button"
          className="pdp-cta pdp-cta--secondary"
          disabled={pending}
          onClick={() => void submit(false)}
        >
          {copy.add}
        </button>
        <button
          type="button"
          className="pdp-cta pdp-cta--primary"
          disabled={pending}
          onClick={() => void submit(true)}
        >
          {copy.buy}
        </button>
      </div>

      {toast ? (
        <div className="pdp-toast" role="status">
          {toastOk ? copy.toastOk : copy.toastFail}
        </div>
      ) : null}
    </div>
  );
}
