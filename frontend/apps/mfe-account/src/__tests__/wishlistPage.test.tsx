// SF-4 (FI-394 T7) — WishlistPage: grid product-card render (link PDP đúng slug
// + giá formatVnd + IconButton Xóa), confirm delete 2 bước (modal mở CHƯA gọi
// API → confirm mới gọi + item biến mất), loading = 4 ProductCardSkeleton,
// empty = EmptyState. Mock contracts client (createCatalogClient — vi.hoisted
// vì factory chạy lúc import) + bootstrap + auth (globals:false → cleanup
// afterEach — pattern orderDetail.test.tsx).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '@ecommerce/i18n';
import WishlistPage from '../pages/wishlist/WishlistPage';
import { appNavigate } from '../bootstrap';

const { getWishlist, removeWishlistItem } = vi.hoisted(() => ({
  getWishlist: vi.fn(),
  removeWishlistItem: vi.fn()
}));

vi.mock('../bootstrap', () => ({
  appNavigate: vi.fn(),
  authReady: Promise.resolve(true)
}));

vi.mock('@ecommerce/auth', () => ({
  authStore: {
    isAuthenticated: vi.fn(() => true),
    getToken: vi.fn(() => 'test-token'),
    fetch: vi.fn()
  }
}));

// Page import { createCatalogClient, ApiErrorClient } — factory trả client fake
// 2 method wishlist + class Error (catch instanceof → mock shape tối giản).
vi.mock('@ecommerce/contracts', () => ({
  createCatalogClient: vi.fn(() => ({ getWishlist, removeWishlistItem })),
  ApiErrorClient: class ApiErrorClient extends Error {}
}));

interface WishItem {
  id: string;
  slug: string;
  name: string;
  price: number;
  ratingAvg: number;
  ratingCount: number;
  image: { url: string; alt?: string };
}

function wishFixture(overrides: Partial<WishItem> = {}): WishItem {
  return {
    id: 'w1',
    slug: 'ao-so-mi-trang',
    name: 'Áo sơ mi trắng',
    price: 359000,
    ratingAvg: 4.5,
    ratingCount: 12,
    image: { url: '', alt: undefined },
    ...overrides
  };
}

function twoItems(): { items: WishItem[] } {
  return {
    items: [
      wishFixture(),
      wishFixture({
        id: 'w2',
        slug: 'quan-jeans-xanh',
        name: 'Quần jeans xanh',
        price: 450000,
        ratingAvg: 5,
        ratingCount: 3,
        image: { url: 'https://img.example/jeans.jpg', alt: 'jeans' }
      })
    ]
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getWishlist.mockReset();
  removeWishlistItem.mockReset();
  vi.mocked(appNavigate).mockClear();
});

beforeAll(async () => {
  await initI18n();
});

describe('WishlistPage', () => {
  it('render 2 items → link PDP đúng slug + giá formatVnd + Xóa IconButton aria-label', async () => {
    getWishlist.mockResolvedValue(twoItems());
    render(<WishlistPage />);

    expect(await screen.findByText('Áo sơ mi trắng')).toBeTruthy();
    const link = screen.getByText('Áo sơ mi trắng').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/p/ao-so-mi-trang');
    const link2 = screen.getByText('Quần jeans xanh').closest('a') as HTMLAnchorElement;
    expect(link2.getAttribute('href')).toBe('/p/quan-jeans-xanh');

    // Giá formatVnd local (359.000 ₫ / 450.000 ₫)
    expect(screen.getByText('359.000 ₫')).toBeTruthy();
    expect(screen.getByText('450.000 ₫')).toBeTruthy();

    // Nút Xóa = IconButton outline có tên (2 item)
    expect(screen.getAllByRole('button', { name: 'Xóa' }).length).toBe(2);
  });

  it('click Xóa → modal confirm mở + removeWishlistItem CHƯA gọi; Hủy đóng modal', async () => {
    getWishlist.mockResolvedValue(twoItems());
    render(<WishlistPage />);
    await screen.findByText('Áo sơ mi trắng');

    // Item đầu (2 nút Xóa — icon button card; [0]! vì noUncheckedIndexedAccess)
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[0]!);
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Xóa sản phẩm yêu thích?')).toBeTruthy();
    expect(dialog.getByText('“Áo sơ mi trắng” sẽ bị xóa khỏi danh sách yêu thích.')).toBeTruthy();
    expect(removeWishlistItem).not.toHaveBeenCalled();

    fireEvent.click(dialog.getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(removeWishlistItem).not.toHaveBeenCalled();
    expect(screen.getByText('Áo sơ mi trắng')).toBeTruthy();
  });

  it('confirm trong modal → removeWishlistItem gọi 1 lần + item biến mất + modal đóng', async () => {
    getWishlist.mockResolvedValue(twoItems());
    removeWishlistItem.mockResolvedValue(undefined);
    render(<WishlistPage />);
    await screen.findByText('Áo sơ mi trắng');

    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa' })[0]!);
    const dialog = within(await screen.findByRole('dialog'));
    // Nút Xóa trong dialog duy nhất (card IconButtons nằm ngoài portal dialog)
    fireEvent.click(dialog.getByRole('button', { name: 'Xóa' }));

    await waitFor(() => expect(screen.queryByText('Áo sơ mi trắng')).toBeNull());
    expect(removeWishlistItem).toHaveBeenCalledTimes(1);
    expect(removeWishlistItem).toHaveBeenCalledWith({ productId: 'w1' });
    // Item còn lại GIỮ + modal đã đóng sau success
    expect(screen.getByText('Quần jeans xanh')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('loading → grid 4 ProductCardSkeleton', async () => {
    getWishlist.mockReturnValue(new Promise(() => {}));
    render(<WishlistPage />);

    // findByRole heading (text trùng label side-nav — nav cũng 'Sản phẩm yêu thích')
    expect(await screen.findByRole('heading', { name: 'Sản phẩm yêu thích' })).toBeTruthy();
    expect(document.querySelectorAll('.wl-grid .uk-sk-card').length).toBe(4);
  });

  it('empty → EmptyState heart + title/desc', async () => {
    getWishlist.mockResolvedValue({ items: [] });
    render(<WishlistPage />);

    expect(await screen.findByText('Chưa có sản phẩm yêu thích')).toBeTruthy();
    expect(screen.getByText('Nhấn trái tim trên sản phẩm để lưu vào đây.')).toBeTruthy();
    expect(document.querySelector('.wl-empty')).toBeTruthy();
    // Icon heart (svg) trong uk-empty__icon
    expect(document.querySelector('.uk-empty__icon svg')).toBeTruthy();
  });
});
