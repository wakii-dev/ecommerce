'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactElement, MouseEvent } from 'react';

import { ensureSession } from '../../lib/account-session';
import { shellUrl } from '../../lib/site';
import type { Locale } from '../../lib/format';
import { applyToggle, bustWishlistIdsCache, fetchWishlistIds, toggleWishlist } from './wishlist-api';

/**
 * Wishlist heart (SF-8, spec Q15 — pack: heart client component trên PDP +
 * ProductCard). Mount → ensureSession (single-flight — guest không call API)
 * → fetch ids (cache dùng chung mọi heart trong page) → filled khi đã heart.
 * Click: preventDefault + stopPropagation (card là <a> — KHÔNG điều hướng);
 * guest → `/account` (shell đăng nhập — pack); authed → PUT/DELETE optimistic,
 * lỗi revert.
 */

const COPY = {
  vi: { add: 'Thêm vào yêu thích', remove: 'Bỏ yêu thích', guest: 'Đăng nhập để lưu yêu thích' },
  en: { add: 'Add to wishlist', remove: 'Remove from wishlist', guest: 'Sign in to save to wishlist' },
} as const;

export default function WishlistHeart({
  productId,
  locale,
  variant = 'card',
}: {
  productId: string;
  locale: Locale;
  variant?: 'card' | 'pdp';
}): ReactElement {
  const copy = COPY[locale];
  const [authed, setAuthed] = useState<boolean | null>(null); // null = đang boot
  const [active, setActive] = useState(false);
  const idsRef = useRef<string[]>([]); // state thật — update qua applyToggle (reducer đã test)

  useEffect(() => {
    let alive = true;
    ensureSession().then((ok) => {
      if (!alive) return;
      setAuthed(ok);
      if (!ok) return;
      fetchWishlistIds().then((ids) => {
        if (!alive) return;
        idsRef.current = [...ids];
        setActive(ids.has(productId));
      });
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    // Card bọc <a> — chặn điều hướng cả khi guest (đi /account thay vì PDP)
    event.preventDefault();
    event.stopPropagation();
    if (authed === false) {
      // Shell là app Vite riêng — link relative '/account' 404 trên origin
      // storefront (cùng bug SF-6 P1 với /cart) → absolute qua shellUrl().
      window.location.href = `${shellUrl()}/account`;
      return;
    }
    const next = !active;
    const nextIds = applyToggle(idsRef.current, productId, next); // optimistic
    idsRef.current = nextIds;
    setActive(nextIds.includes(productId));
    toggleWishlist(productId, next)
      .then((ok) => {
        if (ok) {
          bustWishlistIdsCache();
        } else {
          revert(next);
        }
      })
      .catch(() => revert(next));
  };

  /** Revert state về trước toggle (API lỗi/không 204). */
  const revert = (next: boolean): void => {
    idsRef.current = applyToggle(idsRef.current, productId, !next);
    setActive(idsRef.current.includes(productId));
  };

  const className = [
    'wl-heart',
    variant === 'card' ? 'wl-heart--card' : 'wl-heart--pdp',
    active ? 'wl-heart--on' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      aria-pressed={active}
      aria-label={authed === false ? copy.guest : active ? copy.remove : copy.add}
      title={authed === false ? copy.guest : active ? copy.remove : copy.add}
      onClick={onClick}
    >
      {active ? '♥' : '♡'}
    </button>
  );
}
