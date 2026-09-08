import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatPrice, Price } from '../components/Price';
import { StarRating } from '../components/StarRating';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Tabs } from '../components/Tabs';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Pagination } from '../components/Pagination';
import { QuantityStepper } from '../components/QuantityStepper';
import { ToastProvider } from '../components/Toast';
import {
  Breadcrumbs,
  breadcrumbJsonld
} from '../components/Breadcrumbs';
import { IconButton } from '../components/IconButton';
import { Alert } from '../components/Alert';
import { Checkbox } from '../components/Checkbox';
import { Radio, RadioGroup } from '../components/Radio';
import { Textarea } from '../components/Textarea';

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

describe('QuantityStepper', () => {
  it('role=group + aria-label mặc định đúng (group/input/2 nút) + input value + min/max', () => {
    const html = renderToStaticMarkup(
      <QuantityStepper value={3} onChange={() => {}} />
    );
    expect(html).toContain('role="group"');
    expect(count(html, 'aria-label="Số lượng"')).toBe(2); // group + input
    expect(html).toContain('aria-label="Tăng số lượng"');
    expect(html).toContain('aria-label="Giảm số lượng"');
    expect(html).toContain('value="3"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="99"');
    // glyph − là &minus; (U+2212), không phải hyphen
    expect(html).toContain('−');
  });

  it('clamp cận: value=1 → nút − disabled; value=99 → nút + disabled', () => {
    const atMin = renderToStaticMarkup(
      <QuantityStepper value={1} onChange={() => {}} />
    );
    expect(atMin).toContain('aria-label="Giảm số lượng" disabled');
    expect(atMin).not.toContain('aria-label="Tăng số lượng" disabled');
    const atMax = renderToStaticMarkup(
      <QuantityStepper value={99} onChange={() => {}} />
    );
    expect(atMax).toContain('aria-label="Tăng số lượng" disabled');
    expect(atMax).not.toContain('aria-label="Giảm số lượng" disabled');
  });

  it('prop disabled → cả 2 nút + input đều disabled', () => {
    const html = renderToStaticMarkup(
      <QuantityStepper value={2} onChange={() => {}} disabled />
    );
    expect(count(html, 'disabled')).toBe(3);
  });
});

describe('Pagination — SSR', () => {
  const href = (p: number) => `/c/ao-thun?page=${p}`;

  it('URL mode: <a href> đúng pageHref(2) khi page=2 + aria-current + rel prev/next', () => {
    const html = renderToStaticMarkup(
      <Pagination page={2} totalPages={12} pageHref={href} />
    );
    expect(html).toContain('href="/c/ao-thun?page=2"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).toContain('aria-label="Phân trang"');
    expect(html).not.toContain('<button');
  });

  it('client mode: render <button>, không có href', () => {
    const html = renderToStaticMarkup(
      <Pagination page={2} totalPages={12} onPageChange={() => {}} />
    );
    expect(html).toContain('<button');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('href=');
  });

  it('totalPages=1 → markup rỗng (null)', () => {
    const html = renderToStaticMarkup(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} />
    );
    expect(html).toBe('');
  });

  it('totalPages>7 → window xuất hiện ellipsis …', () => {
    const html = renderToStaticMarkup(
      <Pagination page={4} totalPages={12} onPageChange={() => {}} />
    );
    expect(html).toContain('…');
    expect(html).toContain('uk-page--dots');
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

describe('Breadcrumbs', () => {
  const items = [
    { label: 'Trang chủ', href: '/' },
    { label: 'Danh mục', href: '/c' },
    { label: 'Áo thun' }
  ];

  it('nav aria-label + item cuối span aria-current="page" + item giữa <a>', () => {
    const html = renderToStaticMarkup(<Breadcrumbs items={items} />);
    expect(html).toContain('aria-label="Bạn đang ở:"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/c"');
    // item cuối là span, không phải link
    expect(html).toContain('<span aria-current="page">Áo thun</span>');
    // separator li aria-hidden giữa các item
    expect(html).toContain('uk-breadcrumbs__sep');
    expect(html).toContain('aria-hidden="true"');
  });

  it('item giữa KHÔNG href → span thường', () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs items={[{ label: 'A' }, { label: 'B', href: '/b' }, { label: 'C' }]} />
    );
    expect(html).toContain('<span>A</span>');
  });

  it('breadcrumbJsonld — JSON hợp lệ BreadcrumbList, Position 1-based', () => {
    const parsed = JSON.parse(breadcrumbJsonld(items)) as {
      '@context': string;
      '@type': string;
      itemListElement: { '@type': string; position: number; name: string; item?: string }[];
    };
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('BreadcrumbList');
    expect(parsed.itemListElement).toHaveLength(3);
    expect(parsed.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Trang chủ',
      item: '/'
    });
    // item cuối không href → không có field item
    expect(parsed.itemListElement[2]).toEqual({
      '@type': 'ListItem',
      position: 3,
      name: 'Áo thun'
    });
  });
});

describe('IconButton', () => {
  it('aria-label + class size/variant default md/ghost', () => {
    const html = renderToStaticMarkup(<IconButton aria-label="Đóng">×</IconButton>);
    expect(html).toContain('class="uk-icon-btn uk-icon-btn--md uk-icon-btn--ghost"');
    expect(html).toContain('aria-label="Đóng"');
    expect(html).toContain('type="button"');
  });

  it('size/variant props → class tương ứng', () => {
    const html = renderToStaticMarkup(
      <IconButton aria-label="Thêm" size="sm" variant="outline">
        +
      </IconButton>
    );
    expect(html).toContain('uk-icon-btn--sm');
    expect(html).toContain('uk-icon-btn--outline');
  });

  it('thiếu aria-label → console.error dev-warn nhưng vẫn render (không crash)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToStaticMarkup(
      <IconButton {...({} as Record<string, never>)}>×</IconButton>
    );
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(html).toContain('uk-icon-btn');
    errSpy.mockRestore();
  });
});

describe('Alert', () => {
  it('4 variant → class tint tương ứng', () => {
    for (const variant of ['info', 'success', 'warning', 'danger'] as const) {
      const html = renderToStaticMarkup(<Alert variant={variant}>Nội dung</Alert>);
      expect(html).toContain(`uk-alert--${variant}`);
    }
  });

  it('default info + role: danger → alert, còn lại → status', () => {
    expect(renderToStaticMarkup(<Alert>Nội dung</Alert>)).toContain(
      'role="status"'
    );
    for (const variant of ['info', 'success', 'warning'] as const) {
      expect(renderToStaticMarkup(<Alert variant={variant}>x</Alert>)).toContain(
        'role="status"'
      );
    }
    expect(renderToStaticMarkup(<Alert variant="danger">x</Alert>)).toContain(
      'role="alert"'
    );
  });

  it('dismissible → nút × aria-label default; title/icon render', () => {
    const html = renderToStaticMarkup(
      <Alert
        variant="danger"
        title="Thanh toán thất bại"
        icon="!"
        dismissible
      >
        Thử lại sau.
      </Alert>
    );
    expect(html).toContain('aria-label="Đóng thông báo"');
    expect(html).toContain('uk-alert__close');
    expect(html).toContain('uk-alert__title');
    expect(html).toContain('Thanh toán thất bại');
    expect(html).toContain('!');
  });

  it('dismissLabel override theo ui.alert.dismiss surface truyền vào', () => {
    const html = renderToStaticMarkup(
      <Alert dismissible dismissLabel="Tắt cảnh báo">x</Alert>
    );
    expect(html).toContain('aria-label="Tắt cảnh báo"');
  });
});

describe('Checkbox', () => {
  it('label htmlFor khớp id input + aria-describedby khi error (error ưu tiên hint)', () => {
    const html = renderToStaticMarkup(
      <Checkbox label="Đồng ý điều khoản" error="Bắt buộc chọn" />
    );
    const inputId = html.match(/id="([^"]+)"/)?.[1] ?? '';
    expect(inputId).not.toBe('');
    expect(html).toContain(`for="${inputId}"`);
    expect(html).toContain(`aria-describedby="${inputId}-error"`);
    expect(html).toContain(`id="${inputId}-error"`);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('-hint"');
  });

  it('hint khi không error + checked render (defaultChecked) + aria-invalid khi error', () => {
    const ok = renderToStaticMarkup(
      <Checkbox label="A" hint="Gợi ý" defaultChecked />
    );
    expect(ok).toContain('-hint"');
    // SSR serialize defaultChecked → attr checked=""
    expect(ok).toContain('checked=""');
    expect(ok).not.toContain('aria-invalid');
    const errHtml = renderToStaticMarkup(<Checkbox label="B" error="Lỗi" />);
    expect(errHtml).toContain('aria-invalid="true"');
  });
});

describe('Radio / RadioGroup', () => {
  it('name xuyên group qua Context — input name attr = group name', () => {
    const html = renderToStaticMarkup(
      <RadioGroup name="payment" label="Thanh toán">
        <Radio value="cod" label="COD" />
        <Radio value="momo" label="MoMo" />
      </RadioGroup>
    );
    expect((html.match(/name="payment"/g) ?? []).length).toBe(2);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-labelledby');
    expect(html).not.toContain('name="undefined"');
  });

  it('Radio trong group KHÔNG truyền name vẫn nhận name qua Context', () => {
    const html = renderToStaticMarkup(
      <RadioGroup name="ship">
        <Radio value="standard" />
      </RadioGroup>
    );
    expect(html).toContain('name="ship"');
  });

  it('controlled: group value="momo" → radio momo checked, cod không', () => {
    const html = renderToStaticMarkup(
      <RadioGroup name="payment" value="momo">
        <Radio value="cod" label="COD" />
        <Radio value="momo" label="MoMo" />
      </RadioGroup>
    );
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain('checked="" value="momo"');
  });

  it('uncontrolled: defaultValue="cod" → defaultChecked đúng radio (SSR serialize thành checked="")', () => {
    const html = renderToStaticMarkup(
      <RadioGroup name="payment" defaultValue="cod">
        <Radio value="cod" label="COD" />
        <Radio value="momo" label="MoMo" />
      </RadioGroup>
    );
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toContain('checked="" value="cod"');
  });

  it('group error → .uk-error role=alert + aria-describedby trên radiogroup', () => {
    const html = renderToStaticMarkup(
      <RadioGroup name="payment" error="Chọn một phương thức">
        <Radio value="cod" />
      </RadioGroup>
    );
    expect(html).toContain('role="alert"');
    const groupId = html.match(/aria-describedby="([^"]+)"/)?.[1] ?? '';
    expect(groupId).not.toBe('');
    expect(html).toContain(`id="${groupId}"`);
    expect(html).not.toContain('aria-invalid="true"');
  });
});

describe('Textarea', () => {
  it('label htmlFor khớp id + class uk-textarea + aria-invalid khi error', () => {
    const html = renderToStaticMarkup(
      <Textarea label="Ghi chú" placeholder="..." error="Quá ngắn" />
    );
    const taId = html.match(/id="([^"]+)"/)?.[1] ?? '';
    expect(taId).not.toBe('');
    expect(html).toContain(`for="${taId}"`);
    expect(html).toContain('uk-textarea--error');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(`aria-describedby="${taId}-error"`);
    expect(html).toContain('role="alert"');
  });

  it('không error + có hint → aria-describedby trỏ hint, uk-field wrapper', () => {
    const html = renderToStaticMarkup(
      <Textarea label="Ghi chú" hint="Tùy chọn" defaultValue="abc" />
    );
    expect(html).not.toContain('uk-textarea--error');
    expect(html).not.toContain('aria-invalid');
    expect(html).toContain('-hint"');
    expect(html).toContain('class="uk-field"');
  });
});
