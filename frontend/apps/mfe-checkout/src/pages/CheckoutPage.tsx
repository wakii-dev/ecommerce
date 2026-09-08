import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { authStore } from '@ecommerce/auth';
import { Button, Card, Icon, Input, Skeleton, Stepper } from '@ecommerce/ui-kit';
import { formatPrice } from '@ecommerce/ui-kit';
import { useT } from '@ecommerce/i18n';
import { appNavigate } from '../bootstrap';
import { useCart } from '../lib/useCart';
import { removeCartItem } from '../lib/cartApi';
import {
  ApiErrorClient,
  createOrder,
  fetchLoyaltyBalance,
  fetchShippingMethods,
  validateCoupon,
  POINT_VND,
  type Address,
  type CreatedOrder,
  type Order,
  type PaymentMethod,
  type ShippingMethod
} from '../lib/orderingApi';
import { mountPaymentElement, confirmPayment, type MountedPayment } from '../lib/stripePay';
import { readAffiliateRef } from '../lib/affiliateRef';
import { clearCarryCoupon, getCarryCoupon, setCarryCoupon } from '../lib/couponCarry';
import '../page.css';

/**
 * Checkout 3 bước (SF-6 UI giữ nguyên; SF-10 wire live): 1 Địa chỉ →
 * 2 Vận chuyển (flat fee env) → 3 Thanh toán + review (coupon validate-coupon
 * THẬT, POST /orders saga thật → clientSecret → Stripe PaymentElement confirm
 * THẬT). Yêu cầu đăng nhập (POST /orders là bearerAuth — guest thấy gate).
 * 502 từ saga (payment/catalog/inventory hỏng — đơn đã FAILED + release) →
 * hiện lý do server, cho thử lại.
 */

const SHIPPING_FEE = Number(import.meta.env.VITE_SHIPPING_FLAT_FEE ?? 25000); // fallback env
const PHONE_RE = /^(0|\+84)[\s.-]?(\d[\s.-]?){8,10}$/;
// FI-393 T8 — ảnh summary thiếu src → svg placeholder (như CartPage T4)
const IMG_FALLBACK =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="%23fafafa"/></svg>';

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

// FI-393 T7 — rule từng field tách khỏi validateAddress (message lấy từ
// catalog `checkout.step1.<name>.error` lúc render — component giữ i18n).
const FIELD_NAMES = ['fullName', 'phone', 'line1', 'ward', 'district', 'city'] as const;

// FI-393 review-G3 — export để unit-test được (pure, không đụng React).
export function fieldInvalid(name: keyof Address, value: string): boolean {
  switch (name) {
    case 'fullName':
      return value.trim().length < 2;
    case 'phone':
      return !PHONE_RE.test(value.trim());
    case 'line1':
      return value.trim().length < 4;
    default:
      return !value.trim(); // ward / district / city
  }
}

// autoComplete chuẩn WHATWG (T7) — fullName→name, phone→tel, address-level*.
const FIELD_AUTO_COMPLETE: Record<keyof Address, string> = {
  fullName: 'name',
  phone: 'tel',
  line1: 'address-line1',
  ward: 'address-level3',
  district: 'address-level2',
  city: 'address-level1'
};

export default function CheckoutPage(): ReactElement {
  const authed = useAuthState();
  const { cart, loading: cartLoading } = useCart();
  const { t } = useT();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof Address, string>>>({});
  // FI-393 T7 — touched per field: lỗi hiện ngay khi blur (hoặc sau submit),
  // không đợi submit toàn form; onChange re-validate nếu field đã touched.
  const [touched, setTouched] = useState<Partial<Record<keyof Address, boolean>>>({});

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  // SF-14 (D22): chọn phương thức vận chuyển (GHN/flat) + dùng điểm thưởng
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [methodId, setMethodId] = useState('standard');
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [usePoints, setUsePoints] = useState(0);

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
  // SF-14: phí theo method chọn (fetch động; chưa load → flat env fallback)
  const selectedFee = methods.find((m) => m.id === methodId)?.fee ?? SHIPPING_FEE;
  // Điểm dùng cap ≤ (subtotal - coupon)/POINT_VND — không giảm âm phần hàng
  const maxPoints = Math.min(
    pointsBalance ?? 0,
    Math.floor(Math.max(0, subtotal - discount) / POINT_VND)
  );
  const effectivePoints = Math.min(usePoints, maxPoints);
  const pointsDiscountValue = effectivePoints * POINT_VND;
  const total = Math.max(0, subtotal - discount - pointsDiscountValue) + selectedFee;

  // Balance điểm (authed) — affiliate chết → null, checkout vẫn chạy (degraded)
  useEffect(() => {
    if (!authed) return;
    let alive = true;
    fetchLoyaltyBalance().then((account) => {
      if (alive && account) setPointsBalance(account.balance);
    });
    return () => {
      alive = false;
    };
  }, [authed]);

  // Methods khi vào bước 2 — địa chỉ quyết định phí GHN (province/district)
  useEffect(() => {
    if (step !== 2) return;
    let alive = true;
    setMethodsLoading(true);
    fetchShippingMethods(address.city, address.district)
      .then((list) => {
        if (!alive) return;
        setMethods(list);
        if (list.length > 0 && !list.some((m) => m.id === methodId)) {
          setMethodId(list[0]?.id ?? 'standard');
        }
      })
      .catch(() => alive && setMethods([]))
      .finally(() => alive && setMethodsLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, address.city, address.district]);

  // Cleanup PaymentElement khi rời trang
  useEffect(() => () => {
    mountedRef.current?.destroy();
    mountedRef.current = null;
  }, []);

  /** FI-393 T5 — apply coupon (nút "Áp dụng" step-3 KHÔNG đổi, hoặc auto-apply
   *  mã carry từ cart). Trả true khi áp OK để caller (carry) biết đường clear.
   *  Success → setCarryCoupon luôn (giữ carry fresh khi user cart↔checkout). */
  const applyCoupon = useCallback(async (rawCode?: string): Promise<boolean> => {
    const code = (rawCode ?? couponCode).trim();
    if (!code || couponChecking) return false;
    setCouponChecking(true);
    let ok = false;
    try {
      const result = await validateCoupon(code, subtotal);
      if (result.valid) {
        setCouponDiscount(result.discount);
        setCouponCode(code);
        setCouponError(null);
        setCarryCoupon(code);
        ok = true;
      } else {
        setCouponDiscount(null);
        setCouponError(result.message ?? t('checkout.coupon.invalid'));
      }
    } catch (err) {
      setCouponDiscount(null);
      setCouponError(err instanceof Error ? err.message : 'Không kiểm tra được mã');
    } finally {
      setCouponChecking(false);
    }
    return ok;
  }, [couponCode, couponChecking, subtotal, t]);

  // FI-393 T5 — coupon carry từ cart: khi cart ĐÃ LOAD (subtotal thật —
  // validate với subtotal 0 sẽ sai minOrder) và chưa có coupon nào áp → tự
  // apply mã carry đúng 1 LẦN (ref — cart đổi tiếp không apply lại). Fail
  // (hết hạn/minOrder) → couponError hiển thị như apply thủ công + clear
  // carry NGAY (stale code không re-error mỗi lần vào checkout).
  const carryTriedRef = useRef(false);
  useEffect(() => {
    if (carryTriedRef.current || !cart) return;
    carryTriedRef.current = true;
    const carried = getCarryCoupon();
    if (!carried || couponDiscount !== null) return;
    void applyCoupon(carried).then((ok) => {
      if (!ok) clearCarryCoupon();
    });
  }, [cart, couponDiscount, applyCoupon]);

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
    clearCarryCoupon(); // FI-393 T5 — đơn xong: mã đã tiêu thụ, carry hết hiệu lực
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
        shippingMethod: methodId,
        paymentMethod,
        ...(couponDiscount !== null && couponCode.trim()
          ? { couponCode: couponCode.trim() }
          : {}),
        // SF-14 (D22): dùng điểm — server cap lại theo subtotal - coupon (D4)
        ...(effectivePoints > 0 ? { usePoints: effectivePoints } : {}),
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
            {t('checkout.guestGate.prefix')}{' '}
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault();
                appNavigate('/login');
              }}
              style={{ color: 'var(--c-primary, #F53D2D)' }}
            >
              {t('checkout.guestGate.ctaLink')}
            </a>{' '}
            {t('checkout.guestGate.middle')}
          </div>
        </Card>
      </div>
    );
  }

  // ── FI-393 T8 — cart đang load (chưa có data): skeleton, KHÔNG rơi vào
  //    empty-state (guard orderPhase không đổi — phase vẫn 'idle' lúc mount).
  if (cartLoading && !cart) {
    return (
      <div className="cart-page">
        <h1 className="page-title">{t('checkout.title')}</h1>
        <div className="checkout-grid">
          <Card>
            <Skeleton variant="text" />
            <Skeleton variant="rect" className="skeleton-line" />
            <Skeleton variant="rect" className="skeleton-line" />
          </Card>
          <Card className="cart-summary">
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
          </Card>
        </div>
      </div>
    );
  }

  // ── Giỏ trống / hết item khả dụng ─────────────────────────────────────
  if (availableItems.length === 0 && orderPhase === 'idle') {
    return (
      <div className="cart-page">
        <h1 className="page-title">{t('checkout.title')}</h1>
        <Card>
          <p>{t('checkout.noAvailableItems')}</p>
          <Button onClick={() => appNavigate('/cart')}>{t('checkout.empty.back')}</Button>
        </Card>
      </div>
    );
  }

  // FI-393 T7 — message lỗi 1 field (catalog) — undefined khi field hợp lệ.
  const validateField = (name: keyof Address, value: string): string | undefined =>
    fieldInvalid(name, value) ? t(`checkout.step1.${name}.error`) : undefined;

  const onAddressSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const errors: Partial<Record<keyof Address, string>> = {};
    for (const name of FIELD_NAMES) {
      const message = validateField(name, address[name]);
      if (message) errors[name] = message;
    }
    setAddressErrors(errors);
    // submit = chạm tất cả field → toàn bộ lỗi hiện như trước (same error set)
    setTouched({ fullName: true, phone: true, line1: true, ward: true, district: true, city: true });
    if (Object.keys(errors).length === 0) setStep(2);
  };

  const field = (name: keyof Address): ReactElement => (
    <Input
      label={t(`checkout.step1.${name}.label`)}
      name={name}
      value={address[name]}
      placeholder={t(`checkout.step1.${name}.placeholder`)}
      error={touched[name] ? addressErrors[name] : undefined}
      inputMode={name === 'phone' ? 'tel' : undefined}
      autoComplete={FIELD_AUTO_COMPLETE[name]}
      onBlur={() => {
        setTouched((prev) => ({ ...prev, [name]: true }));
        setAddressErrors((prev) => ({ ...prev, [name]: validateField(name, address[name]) }));
      }}
      onChange={(e) => {
        const value = e.target.value;
        setAddress((prev) => ({ ...prev, [name]: value }));
        if (touched[name]) {
          setAddressErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
        }
      }}
    />
  );

  return (
    <div className="cart-page">
      <h1 className="page-title">{t('checkout.title')}</h1>

      {/* FI-393 T6 — Stepper primitive (ui-kit): nút thật keyboard/roving,
          disable future steps; click chỉ quay lại bước TRƯỚC (i+1 < step). */}
      <Stepper
        steps={[
          { key: 'address', label: t('checkout.stepper.address') },
          { key: 'shipping', label: t('checkout.stepper.shipping') },
          { key: 'payment', label: t('checkout.stepper.payment') }
        ]}
        current={step - 1}
        onStepClick={(i) => {
          if (i + 1 < step) setStep((i + 1) as 1 | 2 | 3);
        }}
        label={t('checkout.stepper.label')}
      />

      <div className="checkout-grid">
        <Card>
          {step === 1 && (
            <form onSubmit={onAddressSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.step1.title')}</h2>
              {field('fullName')}
              {field('phone')}
              {field('line1')}
              {field('ward')}
              {field('district')}
              {field('city')}
              <Button type="submit" variant="primary">
                {t('checkout.continueShipping')}
              </Button>
            </form>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.step2.title')}</h2>
              {methodsLoading ? (
                <p style={{ margin: 0, color: 'var(--c-text-secondary, #666)' }}>{t('checkout.loadingFee')}</p>
              ) : methods.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--c-text-secondary, #666)' }}>
                  {t('checkout.feeLoadFail')}
                </p>
              ) : (
                methods.map((method) => (
                  // FI-393 T8 — shipping card (direction §2.4): hover lift,
                  // selected viền primary + tint + check tròn góc trên-phải.
                  // Radio native GIỮ trong label (a11y) — ẩn thị giác.
                  <label
                    key={method.id}
                    className={`shipping-card${methodId === method.id ? ' shipping-card--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="shippingMethod"
                      className="visually-hidden"
                      value={method.id}
                      checked={methodId === method.id}
                      onChange={() => setMethodId(method.id)}
                      aria-label={method.name}
                    />
                    <span className="shipping-card__body">
                      <strong>{method.name}</strong>
                      <span className="shipping-card__eta">{t('checkout.eta', { days: method.etaDays })}</span>
                      <span className="summary-note">
                        {method.id.startsWith('ghn:') ? t('checkout.ghnNote') : t('checkout.flatNote')}
                      </span>
                    </span>
                    <strong className="shipping-card__fee">{formatPrice(method.fee)}</strong>
                    <span className="shipping-card__check" aria-hidden="true">
                      <Icon name="check" size={12} />
                    </span>
                  </label>
                ))
              )}
              <div className="checkout-actions">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  {t('checkout.backAddress')}
                </Button>
                <Button variant="primary" onClick={() => setStep(3)}>
                  {t('checkout.continuePayment')}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.coupon.title')}</h2>
              {couponDiscount !== null ? (
                <div className="coupon-applied">
                  <span>
                    <strong>{couponCode.trim().toUpperCase()}</strong> —{' '}
                    {t('checkout.coupon.applied', { amount: formatPrice(couponDiscount) })}
                  </span>
                  <button
                    type="button"
                    className="cart-line-remove"
                    onClick={() => {
                      setCouponDiscount(null);
                      setCouponCode('');
                      clearCarryCoupon(); // FI-393 T5 — gỡ thủ công → carry cũng hết
                    }}
                  >
                    {t('checkout.coupon.remove')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="coupon-box">
                    <Input
                      label={t('checkout.coupon.label')}
                      name="coupon"
                      placeholder="WELCOME10"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                    />
                    <Button variant="secondary" disabled={couponChecking} onClick={() => void applyCoupon()}>
                      {couponChecking ? t('checkout.coupon.checking') : t('checkout.coupon.apply')}
                    </Button>
                  </div>
                  {couponError ? (
                    <div className="coupon-error" role="alert">
                      {couponError}
                    </div>
                  ) : null}
                </>
              )}

              <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.points.title')}</h2>
              {pointsBalance !== null && pointsBalance > 0 ? (
                maxPoints > 0 ? (
                  <div className="coupon-box" data-testid="points-box">
                    <Input
                      // FI-393 T7 — label ngắn 1 dòng (key checkout.points.label);
                      // chi tiết balance đã có trong pill "Dùng N điểm" phía dưới.
                      label={t('checkout.points.label', {
                        max: maxPoints.toLocaleString('vi-VN'),
                        value: formatPrice(maxPoints * POINT_VND)
                      })}
                      name="usePoints"
                      type="number"
                      min={0}
                      max={maxPoints}
                      value={String(usePoints || '')}
                      placeholder="0"
                      onChange={(e) => {
                        const value = Number(e.target.value) || 0;
                        setUsePoints(Math.max(0, Math.min(maxPoints, Math.trunc(value))));
                      }}
                    />
                    {/* FI-393 review-G3 — label ngắn T7 đã bỏ số dư → hiện lại
                        balance dưới input points (display-only). */}
                    <div className="summary-note">
                      {t('checkout.points.balance', { points: pointsBalance.toLocaleString('vi-VN') })}
                    </div>
                    {effectivePoints > 0 && (
                      <div className="coupon-applied">
                        <span>
                          {t('checkout.points.use', {
                            points: effectivePoints.toLocaleString('vi-VN'),
                            amount: formatPrice(pointsDiscountValue)
                          })}
                        </span>
                        <button type="button" className="cart-line-remove" onClick={() => setUsePoints(0)}>
                          {t('checkout.points.remove')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="summary-note" style={{ margin: 0 }}>
                    {t('checkout.points.notEligible', { amount: formatPrice(POINT_VND) })}
                  </p>
                )
              ) : (
                <p className="summary-note" style={{ margin: 0 }}>
                  {pointsBalance === 0 ? t('checkout.points.none') : t('checkout.points.noPoints')}
                </p>
              )}

              <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.payment.title')}</h2>
              <div className="pay-methods" role="radiogroup" aria-label={t('checkout.payment.title')}>
                <label className={`pay-method${paymentMethod === 'stripe' ? ' pay-method--selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment-method"
                    value="stripe"
                    checked={paymentMethod === 'stripe'}
                    disabled={orderPhase !== 'idle'}
                    onChange={() => setPaymentMethod('stripe')}
                    data-testid="payment-method-stripe"
                  />
                  <span>{t('checkout.payment.stripe')}</span>
                </label>
                <label className={`pay-method${paymentMethod === 'cod' ? ' pay-method--selected' : ''}`}>
                  <input
                    type="radio"
                    name="payment-method"
                    value="cod"
                    checked={paymentMethod === 'cod'}
                    disabled={orderPhase !== 'idle'}
                    onChange={() => setPaymentMethod('cod')}
                    data-testid="payment-method-cod"
                  />
                  <span>{t('checkout.payment.cod')}</span>
                </label>
              </div>
              {paymentMethod === 'cod' ? (
                <div className="cod-note" role="note" data-testid="cod-note">
                  {t('checkout.codNote')}
                </div>
              ) : null}
              {payUnavailable ? (
                <div className="pay-warning" role="status">
                  ⚠{' '}
                  {/* catalog prefix nhúng {{id}} — testid bọc RIÊNG id qua
                      visually-hidden (textContent = đúng id cho SF-6), câu hiển
                      thị lấy từ key prefix; i18n pkg READ-ONLY nên không tách key */}
                  <span className="visually-hidden" data-testid="pending-order-id">
                    {created?.order.id}
                  </span>
                  {t('checkout.payUnavailable.prefix', { id: created?.order.id })}{' '}
                  <a
                    href="/account/orders"
                    onClick={(e) => {
                      e.preventDefault();
                      appNavigate('/account/orders');
                    }}
                    style={{ color: 'var(--c-primary, #F53D2D)' }}
                  >
                    {t('checkout.payUnavailable.ctaLink')}
                  </a>{' '}
                  {t('checkout.payUnavailable.suffix')}
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
                  className="btn-order"
                  onClick={() => void placeOrder()}
                  data-testid="place-order-btn"
                >
                  {paymentMethod === 'cod'
                    ? t('checkout.placeOrder.cod', { total: formatPrice(total) })
                    : t('checkout.placeOrder.card', { total: formatPrice(total) })}
                </Button>
              ) : payUnavailable || paymentMethod === 'cod' ? null : (
                <Button
                  variant="primary"
                  disabled={orderPhase !== 'awaiting-card' || !elementReady}
                  onClick={() => void payWithCard()}
                >
                  {orderPhase === 'confirming' ? t('checkout.payingCard') : t('checkout.payByCard')}
                </Button>
              )}
              <div className="checkout-actions">
                <Button variant="secondary" onClick={() => setStep(2)}>
                  {t('checkout.backShipping')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="cart-summary">
          <h2 style={{ margin: 0, fontSize: 18 }}>{t('checkout.summary.title')}</h2>
          {availableItems.map((item) => (
            // FI-393 T8 — line có ảnh 56px + qty badge; .summary-row GIỮ trên row
            <div className="summary-row summary-item" key={item.id}>
              <span className="summary-item__thumb">
                <img src={item.image || IMG_FALLBACK} alt={item.name ?? 'Sản phẩm'} />
                <span className="summary-item__qty">{item.qty}</span>
              </span>
              <span className="summary-item__name">{item.name ?? 'Sản phẩm'}</span>
              <span className="summary-item__price">{formatPrice(item.lineTotal)}</span>
            </div>
          ))}
          <hr className="summary-divider" />
          <div className="summary-row">
            <span>{t('checkout.summary.subtotal')}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="summary-row summary-row--discount">
              <span>{t('checkout.summary.discount')}</span>
              <span className="summary-value">−{formatPrice(discount)}</span>
            </div>
          )}
          {pointsDiscountValue > 0 && (
            <div className="summary-row summary-row--discount" data-testid="summary-points">
              <span>{t('checkout.summary.points', { points: effectivePoints.toLocaleString('vi-VN') })}</span>
              <span className="summary-value">−{formatPrice(pointsDiscountValue)}</span>
            </div>
          )}
          <div className="summary-row">
            {/* SF-3 honesty-pass (ADR 0006 D15-3): phí phẳng — nhãn trung thực,
                không giả vờ báo giá GHN thời gian thực. */}
            <span>{t('checkout.summary.shipping')}</span>
            <span>{formatPrice(selectedFee)}</span>
          </div>
          <hr className="summary-divider" />
          <div className="summary-row summary-row--total">
            <span>{t('checkout.summary.total')}</span>
            <span>{formatPrice(total)}</span>
          </div>
          <div className="summary-note">
            {t('checkout.summary.shipTo')}{' '}
            {[address.line1, address.ward, address.district, address.city].filter(Boolean).join(', ') || '—'}
          </div>
        </Card>
      </div>
    </div>
  );
}
