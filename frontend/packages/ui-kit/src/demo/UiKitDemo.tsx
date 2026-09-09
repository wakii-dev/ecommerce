import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Drawer,
  EmptyState,
  Icon,
  IconButton,
  ICON_PATHS,
  Input,
  Modal,
  Pagination,
  Price,
  QuantityStepper,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  StarRating,
  Stepper,
  ListSkeleton,
  ProductCardSkeleton,
  TableSkeleton,
  Table,
  Tabs,
  Textarea,
  ToastProvider,
  useToast
} from '../components';
// Hook nội bộ — không qua barrel (useOverlay cũng không export từ barrel)
import { useReveal } from '../components/useReveal';
import type { ButtonVariant, IconName, TableColumn } from '../components';

export type ThemeName = 'storefront' | 'admin' | 'dark' | 'admin-dark';

const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'storefront', label: 'Storefront' },
  { value: 'admin', label: 'Admin' },
  { value: 'dark', label: 'Storefront dark' },
  { value: 'admin-dark', label: 'Admin dark' }
];

function readTheme(): ThemeName {
  if (typeof document === 'undefined') return 'storefront';
  const current = document.documentElement.dataset.theme as ThemeName;
  return THEMES.some((t) => t.value === current) ? current : 'storefront';
}

/** Switch theme bằng data-theme trên <html> — 4 state (FI-391 T13) */
function useThemeSwitcher(): [ThemeName, (next: ThemeName) => void] {
  const [theme, setTheme] = useState<ThemeName>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const switchTheme = (next: ThemeName) => setTheme(next);
  return [theme, switchTheme];
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

/** Thẻ reveal demo — hook gắn `uk-reveal--pending`, intersect đầu thì hiện */
function RevealCard({ title, delayMs }: { title: string; delayMs: number }) {
  const ref = useReveal<HTMLDivElement>({ delayMs });
  return (
    <div className="uk-card" ref={ref}>
      <h3 className="uk-card__title">{title}</h3>
      <p>Cuộn tới là hiện dần — stagger {delayMs}ms.</p>
    </div>
  );
}

function DemoInner() {
  const { toast } = useToast();
  const [theme, switchTheme] = useThemeSwitcher();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rating, setRating] = useState(4);
  const [qty, setQty] = useState(1);
  const [page, setPage] = useState(4);
  const [alertKey, setAlertKey] = useState(0);
  const [agree, setAgree] = useState(false);
  const [payment, setPayment] = useState('cod');
  const [step, setStep] = useState(0);

  return (
    <div className="uk-demo">
      <header className="uk-demo__header">
        <h1 className="uk-demo__title">UI Kit v1</h1>
        <div className="uk-demo__themes" role="group" aria-label="Theme demo">
          {THEMES.map((t) => (
            <Button
              key={t.value}
              variant={theme === t.value ? 'primary' : 'secondary'}
              aria-pressed={theme === t.value}
              onClick={() => switchTheme(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
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
        <h2 className="uk-demo__section-title">Checkbox</h2>
        <div className="uk-demo__col">
          <Checkbox
            label="Đồng ý điều khoản dịch vụ"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            hint={agree ? 'Đã đồng ý' : undefined}
          />
          <Checkbox label="Nhận tin khuyến mãi" defaultChecked />
          <Checkbox label="Checkbox bị lỗi" error="Bắt buộc chọn mục này" />
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Radio</h2>
        <RadioGroup
          label="Phương thức thanh toán"
          name="payment"
          value={payment}
          onChange={setPayment}
        >
          <Radio value="cod" label="Thanh toán khi nhận hàng (COD)" />
          <Radio value="momo" label="Ví MoMo" />
          <Radio value="card" label="Thẻ tín dụng / ghi nợ" />
        </RadioGroup>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Textarea</h2>
        <div className="uk-demo__col">
          <Textarea
            label="Ghi chú đơn hàng"
            placeholder="Ví dụ: giao giờ hành chính..."
            hint="Tùy chọn — tối đa 200 ký tự"
          />
          <Textarea
            label="Địa chỉ giao hàng"
            defaultValue="Số 1, đường ABC"
            error="Địa chỉ quá ngắn, vui lòng nhập chi tiết hơn"
          />
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
        <h2 className="uk-demo__section-title">QuantityStepper</h2>
        <div className="uk-demo__row">
          <QuantityStepper value={qty} onChange={setQty} />
          <span>Giá trị: {qty}</span>
          <QuantityStepper value={2} onChange={() => {}} disabled />
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Pagination</h2>
        <div className="uk-demo__row">
          <Pagination page={page} totalPages={12} onPageChange={setPage} />
          <span>
            Trang {page}/12
          </span>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Breadcrumbs</h2>
        <Breadcrumbs
          items={[
            { label: 'Trang chủ', href: '/' },
            { label: 'Danh mục', href: '/c' },
            { label: 'Áo thun' }
          ]}
        />
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">IconButton</h2>
        <div className="uk-demo__row">
          <IconButton aria-label="Tìm kiếm">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </IconButton>
          <IconButton aria-label="Thêm" variant="outline">
            +
          </IconButton>
          <IconButton aria-label="Đóng" size="sm">
            ×
          </IconButton>
          <IconButton aria-label="Xoá" variant="outline" size="sm">
            ×
          </IconButton>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Alert</h2>
        <div className="uk-demo__col">
          <Alert title="Đang có khuyến mãi" icon="i">
            Freeship cho đơn từ 300.000 ₫ — áp dụng tới hết tuần.
          </Alert>
          <Alert variant="success" title="Đặt hàng thành công">
            Chúng tôi đã gửi email xác nhận đơn hàng của bạn.
          </Alert>
          <Alert variant="warning" title="Kho sắp hết">
            Chỉ còn 2 sản phẩm — nhanh tay kẻo lỡ.
          </Alert>
          <Alert variant="danger" title="Thanh toán thất bại">
            Thẻ của bạn bị từ chối, vui lòng thử phương thức khác.
          </Alert>
          <Alert
            key={alertKey}
            variant="info"
            title="Thông báo có thể đóng"
            dismissible
            onClose={() => toast('Đã đóng thông báo', { variant: 'info' })}
          >
            Bấm nút × để đóng — hoặc &quot;Hiện lại&quot;.
          </Alert>
          <Button variant="secondary" size="sm" onClick={() => setAlertKey((k) => k + 1)}>
            Hiện lại
          </Button>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Stepper (keyboard ←→)</h2>
        <div className="uk-demo__col">
          <Stepper
            steps={[
              { key: 'cart', label: 'Giỏ hàng' },
              { key: 'pay', label: 'Thanh toán' },
              { key: 'confirm', label: 'Xác nhận' }
            ]}
            current={step}
            onStepClick={setStep}
          />
          <div className="uk-demo__row">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Lùi
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep((s) => Math.min(2, s + 1))}
            >
              Tiếp
            </Button>
            <span>Bước {step + 1}/3</span>
          </div>
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Icon set</h2>
        <div className="uk-demo__icons">
          {(Object.keys(ICON_PATHS) as IconName[]).map((name) => (
            <div key={name} className="uk-demo__icon">
              <Icon name={name} />
              <span>{name}</span>
            </div>
          ))}
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
        <h2 className="uk-demo__section-title">Skeleton compositions</h2>
        <div className="uk-demo__sk">
          <ProductCardSkeleton />
          <TableSkeleton rows={4} cols={3} />
          <ListSkeleton count={3} />
        </div>
      </section>

      <section className="uk-demo__section">
        <h2 className="uk-demo__section-title">Scroll reveal</h2>
        <div className="uk-demo__row">
          <RevealCard title="Giao nhanh 2h" delayMs={0} />
          <RevealCard title="Đổi trả 30 ngày" delayMs={70} />
          <RevealCard title="Thanh toán an toàn" delayMs={140} />
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
