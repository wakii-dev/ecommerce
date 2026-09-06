import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatPrice, Price } from '../components/Price';
import { StarRating } from '../components/StarRating';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Tabs } from '../components/Tabs';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { ToastProvider } from '../components/Toast';

/** ICU vi-VN dùng NBSP (U+00A0) hoặc narrow NBSP (U+202F) trước ký hiệu ₫ */
const normalizeSpace = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ');
const count = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

describe('Price — VND format (D17: vi-VN)', () => {
  it('formatPrice(1_290_000) = "1.290.000 ₫"', () => {
    expect(normalizeSpace(formatPrice(1_290_000))).toBe('1.290.000 ₫');
  });

  it('render Price — đúng số + ký hiệu ₫, không có giá gạch khi thiếu comparePrice', () => {
    const html = renderToStaticMarkup(<Price value={1_290_000} />);
    expect(html).toContain('1.290.000');
    expect(normalizeSpace(html)).toContain('1.290.000 ₫');
    expect(html).not.toContain('<s ');
    expect(html).not.toContain('<s>');
  });

  it('render Price với comparePrice — giá gạch strikethrough + badge -30%', () => {
    const html = renderToStaticMarkup(
      <Price value={1_290_000} comparePrice={1_850_000} />
    );
    expect(html).toContain('uk-price__compare');
    expect(html).toContain('<s');
    expect(html).toContain('1.850.000');
    expect(html).toContain('uk-badge--danger');
    expect(html).toContain('-30%');
  });

  it('comparePrice nhỏ hơn value → không hiện giảm giá', () => {
    const html = renderToStaticMarkup(
      <Price value={1_850_000} comparePrice={1_290_000} />
    );
    expect(html).not.toContain('<s ');
    expect(html).not.toContain('<s>');
    expect(html).not.toContain('%');
  });
});

describe('StarRating', () => {
  it('value 3.5 → 3 sao đầy + 1 nửa + 1 rỗng', () => {
    const html = renderToStaticMarkup(<StarRating value={3.5} />);
    expect(count(html, 'uk-star--full')).toBe(3);
    expect(count(html, 'uk-star--half')).toBe(1);
    expect(count(html, 'uk-star--empty')).toBe(1);
  });

  it('có aria-label và 5 sao mặc định', () => {
    const html = renderToStaticMarkup(
      <StarRating value={5} ariaLabel="Xếp hạng sản phẩm" />
    );
    expect(html).toContain('aria-label="Xếp hạng sản phẩm"');
    expect(count(html, 'uk-star--full')).toBe(5);
    // 'uk-star' đứng riêng (không tính 'uk-star--full' lẫn wrapper 'uk-stars')
    expect((html.match(/uk-star(?![\w-])/g) ?? []).length).toBe(5);
  });
});

describe('Badge', () => {
  it('variant → class tương ứng', () => {
    expect(renderToStaticMarkup(<Badge variant="danger">-30%</Badge>)).toBe(
      '<span class="uk-badge uk-badge--danger">-30%</span>'
    );
    expect(
      renderToStaticMarkup(<Badge variant="success">Còn hàng</Badge>)
    ).toContain('uk-badge--success');
  });

  it('mặc định neutral', () => {
    expect(renderToStaticMarkup(<Badge>Mới</Badge>)).toContain(
      'uk-badge--neutral'
    );
  });
});

describe('Button', () => {
  it('variant class + loading → disabled + aria-busy', () => {
    const html = renderToStaticMarkup(
      <Button variant="danger" loading>
        Lưu
      </Button>
    );
    expect(html).toContain('uk-btn--danger');
    expect(html).toContain('uk-btn__spinner');
    expect(html).toContain('disabled');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('Tabs', () => {
  it('tab active theo defaultKey + chỉ render panel active', () => {
    const html = renderToStaticMarkup(
      <Tabs
        defaultKey="b"
        items={[
          { key: 'a', label: 'A', content: <p>Content A</p> },
          { key: 'b', label: 'B', content: <p>Content B</p> }
        ]}
      />
    );
    expect(html).toContain('uk-tab--active');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Content B');
    expect(html).not.toContain('Content A');
  });
});

describe('Skeleton / EmptyState', () => {
  it('Skeleton count=3 → 3 khối', () => {
    const html = renderToStaticMarkup(<Skeleton variant="text" count={3} />);
    expect(count(html, 'uk-skeleton--text')).toBe(3);
  });

  it('EmptyState render title + description + action', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="Giỏ hàng trống"
        description="Hãy mua sắm"
        action={<button type="button">Mua ngay</button>}
      />
    );
    expect(html).toContain('Giỏ hàng trống');
    expect(html).toContain('Hãy mua sắm');
    expect(html).toContain('Mua ngay');
  });
});

describe('ToastProvider', () => {
  it('render region + không crash khi không có toast', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <div>children</div>
      </ToastProvider>
    );
    expect(html).toContain('uk-toast-region');
    expect(html).toContain('children');
    expect(html).not.toContain('uk-toast uk-toast--');
  });
});
