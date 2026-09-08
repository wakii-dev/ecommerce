import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { createCatalogClient, ApiErrorClient } from '@ecommerce/contracts';
import { useT } from '@ecommerce/i18n';
import {
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Modal,
  ProductCardSkeleton
} from '@ecommerce/ui-kit';

import { AccountLayout } from '../../AccountLayout';
import { appNavigate, authReady } from '../../bootstrap';
import '../../page.css';

/**
 * Wishlist page (SF-8 pack slice — SF-4 FI-394 T7 elevation): grid product-card
 * anatomy direction §2.2 (hover lift −3px + shadow-3 — commerce highlight §3.1)
 * + Xóa qua IconButton → Modal confirm → mới gọi removeWishlistItem; loading =
 * 4 ProductCardSkeleton; empty = EmptyState heart. Guard authReady như
 * AccountPage — guest → /login. Fetch self-contained TRONG page dir (file-slice
 * — không import chéo slice khác); typed client @ecommerce/contracts (getWishlist/
 * removeWishlistItem có trong contract).
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

/** Skeleton grid — đếm 4 khớp minmax(200px) 1 hàng màn rộng (CLS reserve). */
const SKELETON_KEYS = [0, 1, 2, 3];

export default function WishlistPage(): ReactElement {
  const { t } = useT();
  const [items, setItems] = useState<WishCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Confirm delete 2 bước: chọn SP → Modal xác nhận → MỚI gọi API.
  const [pendingDelete, setPendingDelete] = useState<WishCard | null>(null);

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
          setError(
            err instanceof ApiErrorClient ? err.detail ?? err.title : t('account.wishlist.errorLoad')
          );
          setItems([]);
        });
    });
    return () => {
      alive = false;
    };
    // Mount-once (deps rỗng) như AccountPage — guard authReady race.
  }, []);

  const onRemove = (productId: string): void => {
    setRemovingId(productId);
    client()
      .removeWishlistItem({ productId })
      .then(() => setItems((prev) => prev?.filter((item) => item.id !== productId) ?? prev))
      .catch(() => setError(t('account.wishlist.errorRemove')))
      .finally(() => {
        setRemovingId(null);
        setPendingDelete(null);
      });
  };

  return (
    <AccountLayout active="wishlist">
      <div className="acc-content">
        <h1 className="acc-page-title">{t('account.wishlist.title')}</h1>
        {error ? (
          <Card>
            <p role="alert">{error}</p>
          </Card>
        ) : null}
        {items === null ? (
          <div className="wl-grid" aria-busy="true">
            {SKELETON_KEYS.map((key) => (
              <ProductCardSkeleton key={key} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="wl-empty">
            <EmptyState
              icon={<Icon name="heart" size={40} />}
              title={t('account.wishlist.emptyTitle')}
              description={t('account.wishlist.emptyDesc')}
            />
          </div>
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
                        <Icon name="package" size={44} />
                      </span>
                    )}
                  </span>
                  <span className="wl-card-name">{item.name}</span>
                  <span className="wl-card-meta">
                    <span className="wl-card-price">{formatVnd(item.price)}</span>
                    <span className="wl-card-rating">
                      <span className="wl-card-stars" aria-hidden="true">
                        ★
                      </span>{' '}
                      {item.ratingAvg} ({item.ratingCount})
                    </span>
                  </span>
                </a>
                <IconButton
                  className="wl-card-remove"
                  variant="outline"
                  size="sm"
                  aria-label={t('account.wishlist.delete')}
                  disabled={removingId === item.id}
                  onClick={() => setPendingDelete(item)}
                >
                  <Icon name="trash" size={14} />
                </IconButton>
              </Card>
            ))}
          </div>
        )}

        {/* Confirm delete — footer phải + danger loading khi đang gọi API
            (pattern od-modal-footer T6). Đóng trong finally: thành công → grid
            đã filter; lỗi → alert page-level hiện sau khi modal đóng. */}
        <Modal
          open={pendingDelete !== null}
          onClose={() => setPendingDelete(null)}
          title={t('account.wishlist.deleteConfirmTitle')}
          footer={
            <div className="od-modal-footer">
              <Button variant="secondary" onClick={() => setPendingDelete(null)}>
                {t('account.wishlist.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={removingId !== null}
                onClick={() => {
                  if (pendingDelete) onRemove(pendingDelete.id);
                }}
              >
                {removingId !== null ? t('account.wishlist.deleting') : t('account.wishlist.delete')}
              </Button>
            </div>
          }
        >
          <p className="od-modal-text">
            {t('account.wishlist.deleteConfirmDesc', { name: pendingDelete?.name ?? '' })}
          </p>
        </Modal>
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
