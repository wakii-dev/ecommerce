import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { Button, Card, Input } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { appNavigate } from '../bootstrap';
import { useCart } from '../lib/useCart';
import { removeCartItem } from '../lib/cartApi';
import {
  ApiErrorClient,
  createOrder,
  validateCoupon,
  type Address,
  type CreatedOrder,
  type Order,
  type PaymentMethod
} from '../lib/orderingApi';
import { mountPaymentElement, confirmPayment, type MountedPayment } from '../lib/stripePay';
import { readAffiliateRef } from '../lib/affiliateRef';
import '../page.css';

/**
 * Checkout 3 bước (SF-6 UI giữ nguyên; SF-10 wire live): 1 Địa chỉ →
 * 2 Vận chuyển (flat fee env) → 3 Thanh toán + review (coupon validate-coupon
 * THẬT, POST /orders saga thật → clientSecret → Stripe PaymentElement confirm
 * THẬT). Yêu cầu đăng nhập (POST /orders là bearerAuth — guest thấy gate).
 * 502 từ saga (payment/catalog/inventory hỏng — đơn đã FAILED + release) →
 * hiện lý do server, cho thử lại.
 */

const SHIPPING_FEE = Number(import.meta.env.VITE_SHIPPING_FLAT_FEE ?? 25000);
const SHIPPING_METHOD = 'standard';
const PHONE_RE = /^(0|\+84)[\s.-]?(\d[\s.-]?){8,10}$/;

function useAuthState(): boolean {
  const [authed, setAuthed] = useState(authStore.isAuthenticated());
  useEffect(
    () => authStore.subscribe(() => setAuthed(authStore.isAuthenticated())),
    []
  );
  return authed;
}

const EMPTY_ADDRESS: Address = {
  fullName: '',
  phone: '',
  line1: '',
  ward: '',
  district: '',
  city: ''
};

function validateAddress(a: Address): Partial<Record<keyof Address, string>> {
  const errors: Partial<Record<keyof Address, string>> = {};
  if (a.fullName.trim().length < 2) errors.fullName = 'Nhập họ tên người nhận';
  if (!PHONE_RE.test(a.phone.trim())) errors.phone = 'Số điện thoại không hợp lệ';
  if (a.line1.trim().length < 4) errors.line1 = 'Nhập số nhà + tên đường';
  if (!a.ward.trim()) errors.ward = 'Nhập phường/xã';
  if (!a.district.trim()) errors.district = 'Nhập quận/huyện';
  if (!a.city.trim()) errors.city = 'Nhập tỉnh/thành phố';
  return errors;
}

export default function CheckoutPage(): ReactElement {
  const authed = useAuthState();
  const { cart } = useCart();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof Address, string>>>({});

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  const [orderPhase, setOrderPhase] = useState<'idle' | 'creating' | 'awaiting-card' | 'confirming'>('idle');
  // SF-13 (D21): stripe | cod — COD bỏ Stripe.js, đơn CONFIRMED ngay sau reserve
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [created, setCreated] = useState<CreatedOrder | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  // SF-10: panel thay mock — đơn ĐÃ tạo (clientSecret thật) nhưng không mount
  // được PaymentElement (thiếu publishable key) → hướng dẫn my-orders, KHÔNG
  // còn nút "demo" giả CONFIRMED.
  const [payUnavailable, setPayUnavailable] = useState(false);
  const [elementReady, setElementReady] = useState(false);

  const payRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef<MountedPayment | null>(null);

  const availableItems = (cart?.items ?? []).filter((item) => !item.unavailable);
  const subtotal = cart?.subtotal ?? 0;
  const discount = couponDiscount ?? 0;
  const total = Math.max(0, subtotal - discount) + SHIPPING_FEE;

  // Cleanup PaymentElement khi rời trang
  useEffect(() => () => {
    mountedRef.current?.destroy();
    mountedRef.current = null;
  }, []);

  const applyCoupon = async (): Promise<void> => {
    if (!couponCode.trim() || couponChecking) return;
    setCouponChecking(true);
    try {
      const result = await validateCoupon(couponCode, subtotal);
      if (result.valid) {
        setCouponDiscount(result.discount);
        setCouponError(null);
      } else {
        setCouponDiscount(null);
        setCouponError(result.message ?? 'Mã không hợp lệ');
      }
    } catch (err) {
      setCouponDiscount(null);
      setCouponError(err instanceof Error ? err.message : 'Không kiểm tra được mã');
    } finally {
      setCouponChecking(false);
    }
  };

  const clearCartAfterSuccess = useCallback(async (): Promise<void> => {
    // Stub chưa có server persist giỏ sau order — xóa line khả dụng (contract
    // không có DELETE /api/cart; §3.3 thật = order.confirmed event, SF-10).
    for (const item of availableItems) {
      try {
        await removeCartItem(item.id);
      } catch {
        // cart-service chết lúc clear — confirmation vẫn hiện
      }
    }
  }, [availableItems]);

  const finalize = useCallback(async (order: Order): Promise<void> => {
    // SF-10: đơn PENDING thật từ server — trạng thái CONFIRMED do webhook
    // Stripe → PAID → CONFIRMED; confirmation page sẽ poll /me/orders/{id}.
    try {
      window.sessionStorage.setItem('ecommerce.last_order', JSON.stringify(order));
    } catch {
      // storage full — confirmation page sẽ hiện empty state
    }
    await clearCartAfterSuccess();
    appNavigate('/order/confirmation');
  }, [clearCartAfterSuccess]);

  const placeOrder = async (): Promise<void> => {
    if (availableItems.length === 0 || orderPhase !== 'idle') return;
    setPayError(null);
    setOrderPhase('creating');
    try {
      const result = await createOrder({
        items: availableItems.map((item) => ({
          id: item.id,
          productId: item.productId,
          variantId: item.variantId ?? '', // pin spec-critic: non-variant → ""
          name: item.name,
          image: item.image,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal
        })),
        address,
        shippingMethod: SHIPPING_METHOD,
        paymentMethod,
        ...(couponDiscount !== null && couponCode.trim()
          ? { couponCode: couponCode.trim() }
          : {}),
        // SF-12: attribution affiliate từ cookie aff_ref (nullable — order.confirmed)
        ...(readAffiliateRef() ? { affiliateCode: readAffiliateRef() as string } : {})
      });
      setCreated(result);
      // sync discount re-price server (authority §6.1.1) vào summary
      if (result.order.discount > 0) setCouponDiscount(result.order.discount);
      // COD (SF-13): clientSecret null — đơn đã CONFIRMED sau reserve →
      // finalize NGAY, không qua bước thẻ
      if (paymentMethod === 'cod' || result.clientSecret == null) {
        await finalize(result.order);
        return;
      }
      setOrderPhase('awaiting-card'); // mount PaymentElement cho card thật
    } catch (err) {
      if (err instanceof ApiErrorClient && err.errors.length > 0) {
        const first = err.errors[0];
        setPayError([first?.message, first?.field ? `(${first.field})` : null].filter(Boolean).join(' ') || err.detail || 'Không tạo được đơn hàng');
      } else {
        setPayError(err instanceof Error ? err.message : 'Không tạo được đơn hàng');
      }
      setOrderPhase('idle'); // saga đã hủy đơn + release — thử lại được
    }
  };

  // Mount PaymentElement sau khi có clientSecret + container render
  useEffect(() => {
    if (orderPhase !== 'awaiting-card' || !created?.clientSecret || !payRef.current) return;
    let cancelled = false;
    setElementReady(false);
    mountPaymentElement(payRef.current, created.clientSecret).then((mounted) => {
      if (cancelled) {
        mounted?.destroy();
        return;
      }
      mountedRef.current = mounted;
      if (mounted) {
        setElementReady(true);
      } else {
        // clientSecret thật nhưng không mount được (thiếu publishable key) —
        // đơn vẫn tồn tại: hướng dẫn my-orders, không có nút demo
        setPayUnavailable(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orderPhase, created]);

  const payWithCard = async (): Promise<void> => {
    if (!mountedRef.current || !created) return;
    setOrderPhase('confirming');
    const result = await confirmPayment(mountedRef.current);
    if (result.ok) {
      await finalize(created.order); // 4242 → thành công THẬT trên Stripe
    } else {
      setPayError(result.error ?? 'Thanh toán thất bại'); // 4000…0002 rơi đây
      setOrderPhase('awaiting-card'); // cho thử lại bằng thẻ khác
    }
  };

  // ── Guest gate ────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="cart-page">
        <h1 className="page-title">Thanh toán</h1>
        <Card>
          <div className="pay-warning" role="status">
            Bạn cần{' '}
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault();
                appNavigate('/login');
              }}
              style={{ color: 'var(--c-primary, #F53D2D)' }}
            >
              đăng nhập
            </a>{' '}
            để thanh toán. Giỏ hàng của bạn vẫn được giữ lại sau khi đăng nhập.
          </div>
        </Card>
      </div>
    );
  }

  // ── Giỏ trống / hết item khả dụng ─────────────────────────────────────
  if (availableItems.length === 0 && orderPhase === 'idle') {
    return (
      <div className="cart-page">
        <h1 className="page-title">Thanh toán</h1>
        <Card>
          <p>Không có sản phẩm khả dụng để thanh toán.</p>
          <Button onClick={() => appNavigate('/cart')}>Về giỏ hàng</Button>
        </Card>
      </div>
    );
  }

  const onAddressSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const errors = validateAddress(address);
    setAddressErrors(errors);
    if (Object.keys(errors).length === 0) setStep(2);
  };

  const field = (
    name: keyof Address,
    label: string,
    placeholder: string
  ): ReactElement => (
    <Input
      label={label}
      name={name}
      value={address[name]}
      placeholder={placeholder}
      error={addressErrors[name]}
      onChange={(e) => setAddress((prev) => ({ ...prev, [name]: e.target.value }))}
    />
  );

  return (
    <div className="cart-page">
      <h1 className="page-title">Thanh toán</h1>

      <ol className="stepper" aria-label="Các bước thanh toán">
        {([1, 2, 3] as const).map((num) => {
          const labels = { 1: 'Địa chỉ', 2: 'Vận chuyển', 3: 'Thanh toán' } as const;
          const state =
            step === num ? ' stepper-item--active' : step > num ? ' stepper-item--done' : '';
          return (
            <li
              key={num}
              className={`stepper-item${state}`}
              role={step > num ? 'button' : undefined}
              tabIndex={step > num ? 0 : undefined}
              onClick={step > num ? () => setStep(num) : undefined}
            >
              <span className="stepper-num">{step > num ? '✓' : num}</span>
              {labels[num]}
            </li>
          );
        })}
      </ol>

      <div className="checkout-grid">
        <Card>
          {step === 1 && (
            <form onSubmit={onAddressSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Địa chỉ nhận hàng</h2>
              {field('fullName', 'Họ tên người nhận', 'Nguyen Van A')}
              {field('phone', 'Số điện thoại', '0901234567')}
              {field('line1', 'Số nhà + đường', '12 Nguyen Hue')}
              {field('ward', 'Phường/xã', 'Ben Nghe')}
              {field('district', 'Quận/huyện', 'Quan 1')}
              {field('city', 'Tỉnh/thành phố', 'TP. Hồ Chí Minh')}
              <Button type="submit" variant="primary">
                Tiếp tục — chọn vận chuyển
              </Button>
            </form>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Phương thức vận chuyển</h2>
              <label
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  border: '1px solid var(--c-primary, #F53D2D)',
                  borderRadius: 4
                }}
              >
                <span>
                  <strong>Giao tiêu chuẩn</strong>
                  <div className="summary-note">3 – 5 ngày làm việc (demo flat-fee)</div>
                </span>
                <strong style={{ color: 'var(--c-primary, #F53D2D)' }}>
                  {formatPrice(SHIPPING_FEE)}
                </strong>
              </label>
              <div className="checkout-actions">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  ← Quay lại địa chỉ
                </Button>
                <Button variant="primary" onClick={() => setStep(3)}>
                  Tiếp tục — thanh toán
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Mã giảm giá</h2>
              {couponDiscount !== null ? (
                <div className="coupon-applied">
                  <span>
                    <strong>{couponCode.trim().toUpperCase()}</strong> — giảm{' '}
                    {formatPrice(couponDiscount)}
                  </span>
                  <button
                    type="button"
                    className="cart-line-remove"
                    onClick={() => {
                      setCouponDiscount(null);
                      setCouponCode('');
                    }}
                  >
                    Gỡ
                  </button>
                </div>
              ) : (
                <>
                  <div className="coupon-box">
                    <Input
                      label="Mã giảm giá"
                      name="coupon"
                      placeholder="WELCOME10"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                    />
                    <Button variant="secondary" disabled={couponChecking} onClick={() => void applyCoupon()}>
                      {couponChecking ? 'Đang kiểm tra…' : 'Áp dụng'}
                    </Button>
                  </div>
                  {couponError ? (
                    <div className="coupon-error" role="alert">
                      {couponError}
                    </div>
                  ) : null}
                </>
              )}

              <h2 style={{ margin: 0, fontSize: 18 }}>Thanh toán</h2>
              <div className="pay-methods" role="radiogroup" aria-label="Phương thức thanh toán">
                <label className="pay-method" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="payment-method"
                    value="stripe"
                    checked={paymentMethod === 'stripe'}
                    disabled={orderPhase !== 'idle'}
                    onChange={() => setPaymentMethod('stripe')}
                    data-testid="payment-method-stripe"
                  />
                  <span>Thẻ quốc tế (Stripe)</span>
                </label>
                <label className="pay-method" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="radio"
                    name="payment-method"
                    value="cod"
                    checked={paymentMethod === 'cod'}
                    disabled={orderPhase !== 'idle'}
                    onChange={() => setPaymentMethod('cod')}
                    data-testid="payment-method-cod"
                  />
                  <span>COD — Thanh toán khi nhận hàng</span>
                </label>
              </div>
              {paymentMethod === 'cod' ? (
                <div className="cod-note" role="note" data-testid="cod-note">
                  Kiểm tra hàng và thanh toán tiền mặt khi nhận — đơn được xác nhận ngay.
                </div>
              ) : null}
              {payUnavailable ? (
                <div className="pay-warning" role="status">
                  ⚠ Đơn <strong data-testid="pending-order-id">{created?.order.id}</strong> đã tạo nhưng chưa
                  mount được form thẻ (thiếu <code>VITE_STRIPE_PUBLISHABLE_KEY</code>). Vào{' '}
                  <a
                    href="/account/orders"
                    onClick={(e) => {
                      e.preventDefault();
                      appNavigate('/account/orders');
                    }}
                    style={{ color: 'var(--c-primary, #F53D2D)' }}
                  >
                    Đơn hàng của tôi
                  </a>{' '}
                  để thanh toán — đơn chưa trả sẽ tự hủy sau 30 phút.
                </div>
              ) : (
                <div ref={payRef} className="pay-panel" />
              )}
              {payError ? (
                <div className="pay-error" role="alert">
                  {payError}
                </div>
              ) : null}

              {orderPhase === 'idle' ? (
                <Button
                  variant="primary"
                  onClick={() => void placeOrder()}
                  data-testid="place-order-btn"
                >
                  {paymentMethod === 'cod'
                    ? `Đặt hàng COD — ${formatPrice(total)}`
                    : `Kiểm tra & tạo đơn — ${formatPrice(total)}`}
                </Button>
              ) : payUnavailable || paymentMethod === 'cod' ? null : (
                <Button
                  variant="primary"
                  disabled={orderPhase !== 'awaiting-card' || !elementReady}
                  onClick={() => void payWithCard()}
                >
                  {orderPhase === 'confirming' ? 'Đang xử lý thẻ…' : 'Thanh toán bằng thẻ'}
                </Button>
              )}
              <div className="checkout-actions">
                <Button variant="secondary" onClick={() => setStep(2)}>
                  ← Quay lại vận chuyển
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="cart-summary">
          <h2 style={{ margin: 0, fontSize: 18 }}>Đơn hàng</h2>
          {availableItems.map((item) => (
            <div className="summary-row" key={item.id}>
              <span>
                {item.name ?? 'Sản phẩm'} × {item.qty}
              </span>
              <span>{formatPrice(item.lineTotal)}</span>
            </div>
          ))}
          <hr className="summary-divider" />
          <div className="summary-row">
            <span>Tạm tính</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="summary-row summary-row--discount">
              <span>Giảm giá</span>
              <span className="summary-value">−{formatPrice(discount)}</span>
            </div>
          )}
          <div className="summary-row">
            <span>Phí vận chuyển</span>
            <span>{formatPrice(SHIPPING_FEE)}</span>
          </div>
          <hr className="summary-divider" />
          <div className="summary-row summary-row--total">
            <span>Tổng cộng</span>
            <span>{formatPrice(total)}</span>
          </div>
          <div className="summary-note">
            Địa chỉ: {[address.line1, address.ward, address.district, address.city].filter(Boolean).join(', ') || '—'}
          </div>
        </Card>
      </div>
    </div>
  );
}
