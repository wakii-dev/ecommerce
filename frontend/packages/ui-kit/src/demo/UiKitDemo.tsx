import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Input,
  Modal,
  Price,
  Select,
  Skeleton,
  StarRating,
  Table,
  Tabs,
  ToastProvider,
  useToast
} from '../components';
import type { ButtonVariant, TableColumn } from '../components';

export type ThemeName = 'storefront' | 'admin';

function readTheme(): ThemeName {
  if (typeof document === 'undefined') return 'storefront';
  return document.documentElement.dataset.theme === 'admin'
    ? 'admin'
    : 'storefront';
}

/** Switch theme bằng data-theme trên <html> — storefront <-> admin */
function useThemeSwitcher(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'storefront' ? 'admin' : 'storefront'));
  return [theme, toggle];
}

const DEMO_PRODUCTS = [
  { id: 'p1', name: 'iPhone 15 Pro Max 256GB', price: 29_490_000, comparePrice: 33_990_000 },
  { id: 'p2', name: 'Tai nghe Bluetooth ANC', price: 1_290_000, comparePrice: 1_850_000 },
  { id: 'p3', name: 'Ốp lưng silicon trong', price: 149_000 },
  { id: 'p4', name: 'Sạc nhanh 20W USB-C', price: 320_000, comparePrice: 400_000 }
];

const PRICE_COLUMNS: TableColumn<(typeof DEMO_PRODUCTS)[number]>[] = [
  { key: 'name', header: 'Sản phẩm' },
  {
    key: 'price',
    header: 'Giá',
    align: 'right',
    render: (row) => (
      <Price value={row.price} comparePrice={row.comparePrice} size="sm" />
    )
  }
];

const TAB_ITEMS = [
  { key: 'desc', label: 'Mô tả', content: <p>Mô tả sản phẩm — nội dung tab đầu.</p> },
  { key: 'specs', label: 'Thông số', content: <p>Thông số kỹ thuật — tab hai.</p> },
  { key: 'reviews', label: 'Đánh giá', content: <p>Đánh giá của khách hàng — tab ba.</p> }
];

function DemoInner() {
  const { toast } = useToast();
  const [theme, toggleTheme] = useThemeSwitcher();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rating, setRating] = useState(4);

  return (
    <div className="uk-demo">
      <header className="uk-demo__header">
        <h1 className="uk-demo__title">UI Kit v1</h1>
        <Button variant="secondary" onClick={toggleTheme}>
          Theme: {theme} (đổi)
        </Button>
      </header>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Button</h2>
        <div className="uk-demo__row">
          {(['primary', 'secondary', 'ghost', 'danger'] as ButtonVariant[]).map(
            (variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            )
          )}
          <Button loading>Đang lưu</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Input / Select</h2>
        <div className="uk-demo__row" style={{ alignItems: 'flex-start' }}>
          <Input label="Email" placeholder="you@example.com" hint="Dùng email thật để nhận đơn" />
          <Input label="Mã giảm giá" error="Mã không tồn tại hoặc đã hết hạn" defaultValue="SALE99" />
          <Select label="Sắp xếp" defaultValue="newest">
            <option value="newest">Mới nhất</option>
            <option value="price-asc">Giá thấp → cao</option>
            <option value="price-desc">Giá cao → thấp</option>
          </Select>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Card</h2>
        <Card
          title="Đơn hàng #1024"
          subtitle="Giao thứ 2, 09/09"
          actions={<Badge variant="success">Đang giao</Badge>}
        >
          <p>3 sản phẩm — Tổng: <Price value={1_290_000} size="md" /></p>
        </Card>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Badge</h2>
        <div className="uk-demo__row">
          <Badge variant="primary">primary</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warning">warning</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge>neutral</Badge>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Modal & Drawer</h2>
        <div className="uk-demo__row">
          <Button onClick={() => setModalOpen(true)}>Mở Modal</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Mở Drawer (trái)
          </Button>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Tabs (keyboard ←→)</h2>
        <Tabs items={TAB_ITEMS} defaultKey="desc" />
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Table + giá VND</h2>
        <Table columns={PRICE_COLUMNS} rows={DEMO_PRODUCTS} rowKey={(row) => row.id} />
        <div className="uk-demo__row">
          <Price value={1_290_000} comparePrice={1_850_000} size="lg" />
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Toast</h2>
        <div className="uk-demo__row">
          <Button variant="secondary" onClick={() => toast('Đã thêm vào giỏ hàng', { variant: 'success' })}>
            Success toast
          </Button>
          <Button variant="secondary" onClick={() => toast('Kết nối mạng chậm', { variant: 'warning' })}>
            Warning toast
          </Button>
          <Button variant="danger" onClick={() => toast('Đặt hàng thất bại, thử lại', { variant: 'danger' })}>
            Danger toast
          </Button>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">StarRating</h2>
        <div className="uk-demo__row">
          <StarRating value={rating} onInput={setRating} size="lg" ariaLabel="Chọn đánh giá của bạn" />
          <span>{rating} / 5</span>
          <StarRating value={3.5} ariaLabel="Ví dụ chỉ đọc" />
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Skeleton</h2>
        <div className="uk-demo__row">
          <Skeleton variant="text" count={3} width="100%" />
          <Skeleton variant="circle" />
          <Skeleton variant="rect" width={160} height={90} />
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">EmptyState</h2>
        <EmptyState
          icon="🛒"
          title="Giỏ hàng trống"
          description="Hãy khám phá hàng ngàn sản phẩm đang chờ bạn."
          action={<Button>Tiếp tục mua sắm</Button>}
        />
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Xác nhận đặt hàng"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false);
                toast('Đặt hàng thành công', { variant: 'success' });
              }}
            >
              Đặt hàng
            </Button>
          </>
        }
      >
        <p>
          Tổng thanh toán: <Price value={1_290_000} size="lg" />
        </p>
        <p>Mô tả modal: portal + focus trap + ESC để đóng.</p>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side="left"
        title="Bộ lọc tìm kiếm"
        footer={<Button fullWidth>Áp dụng</Button>}
      >
        <Input label="Giá từ" placeholder="0 ₫" />
        <Input label="Đến" placeholder="50.000.000 ₫" />
      </Drawer>
    </div>
  );
}

/** Demo page mount ở shell route /ui-kit (Task 14) — tự chứa ToastProvider. */
export function UiKitDemo() {
  return (
    <ToastProvider>
      <DemoInner />
    </ToastProvider>
  );
}
