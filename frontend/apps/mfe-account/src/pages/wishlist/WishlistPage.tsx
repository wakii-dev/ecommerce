import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { createCatalogClient, ApiErrorClient } from '@ecommerce/contracts';
import { Button, Card, EmptyState } from '@ecommerce/ui-kit';

import { AccountLayout } from '../../AccountLayout';
import { appNavigate, authReady } from '../../bootstrap';
import '../../page.css';

/**
 * Wishlist page (SF-8 — pack slice `pages/wishlist/*`): grid ProductCard
 * (ảnh + tên + giá + sao) + nút Xóa + link sang PDP. Guard authReady như
 * AccountPage — guest → /login. Fetch self-contained TRONG page dir
 * (file-slice — không import chéo slice khác); typed client @ecommerce/
 * contracts (Zweck SF-2 — getWishlist/removeWishlistItem có trong contract).
 */

interface WishCard {
  id: string;
  slug: string;
  name: string;
  price: number;
  ratingAvg: number;
  ratingCount: number;
  image: { url: string; alt?: string };
}

function client() {
  return createCatalogClient({
    baseURL: '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init),
  });
}

export default function WishlistPage(): ReactElement {
  const [items, setItems] = useState<WishCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    authReady.then(() => {
      if (!alive) return;
      if (!authStore.isAuthenticated()) {
        appNavigate('/login');
        return;
      }
      client()
        .getWishlist({ page: 1, size: 100 })
        .then((page) => alive && setItems(page.items as WishCard[]))
        .catch((err: unknown) => {
          if (!alive) return;
          setError(err instanceof ApiErrorClient ? err.detail ?? err.title : 'Không tải được wishlist');
          setItems([]);
        });
    });
    return () => {
      alive = false;
    };
  }, []);

  const onRemove = (productId: string): void => {
    setRemovingId(productId);
    client()
      .removeWishlistItem({ productId })
      .then(() => setItems((prev) => prev?.filter((item) => item.id !== productId) ?? prev))
      .catch(() => setError('Xóa thất bại — thử lại'))
      .finally(() => setRemovingId(null));
  };

  return (
    <AccountLayout active="wishlist">
      <div className="account-page">
        <h1 className="account-title">Sản phẩm yêu thích</h1>
      {error ? (
        <Card>
          <p role="alert">{error}</p>
        </Card>
      ) : null}
      {items === null ? (
        <p>Đang tải…</p>
      ) : items.length === 0 ? (
        <EmptyState title="Chưa có sản phẩm yêu thích" description="Nhấn trái tim trên sản phẩm để lưu vào đây." />
      ) : (
        <div className="wl-grid">
          {items.map((item) => (
            <Card key={item.id} className="wl-card">
              <a href={`/p/${item.slug}`} className="wl-card-link">
                <span className="wl-card-thumb">
                  {item.image?.url ? (
                    <img src={item.image.url} alt={item.image.alt ?? item.name} loading="lazy" />
                  ) : (
                    <span className="wl-card-thumb-fallback" aria-hidden="true">
                      🛍️
                    </span>
                  )}
                </span>
                <span className="wl-card-name">{item.name}</span>
                <span className="wl-card-meta">
                  <span className="wl-card-price">{formatVnd(item.price)}</span>
                  <span className="wl-card-rating">
                    ★ {item.ratingAvg} ({item.ratingCount})
                  </span>
                </span>
              </a>
              <Button variant="danger" size="sm" onClick={() => onRemove(item.id)} disabled={removingId === item.id}>
                {removingId === item.id ? 'Đang xóa…' : 'Xóa'}
              </Button>
            </Card>
          ))}
        </div>
      )}
      </div>
    </AccountLayout>
  );
}

/** VND format — tự chia nhóm như storefront lib/format (không import chéo app). */
function formatVnd(amount: number): string {
  const digits = Math.abs(Math.trunc(amount)).toString();
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.push(digits.slice(Math.max(0, end - 3), end));
  }
  return `${groups.reverse().join('.')} ₫`;
}
