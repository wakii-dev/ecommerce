'use client';

import { useEffect, useState } from 'react';
import type { ReactElement, MouseEvent } from 'react';

import { ensureSession } from '../../lib/account-session';
import type { Locale } from '../../lib/format';
import { bustWishlistIdsCache, fetchWishlistIds, toggleWishlist } from './wishlist-api';

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

  useEffect(() => {
    let alive = true;
    ensureSession().then((ok) => {
      if (!alive) return;
      setAuthed(ok);
      if (!ok) return;
      fetchWishlistIds().then((ids) => {
        if (alive) setActive(ids.has(productId));
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
      window.location.href = '/account';
      return;
    }
    const next = !active;
    setActive(next); // optimistic
    toggleWishlist(productId, next)
      .then((ok) => {
        if (ok) {
          bustWishlistIdsCache();
        } else {
          setActive(!next); // revert
        }
      })
      .catch(() => setActive(!next));
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
