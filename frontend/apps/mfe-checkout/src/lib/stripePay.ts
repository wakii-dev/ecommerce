/**
 * stripePay (SF-6) — Stripe.js Elements mount thủ công (KHÔNG
 * @stripe/react-stripe-js — giảm dep, 1 element duy nhất cần mount).
 * Publishable key từ env FE (`VITE_STRIPE_PUBLISHABLE_KEY`); KHÔNG key → null
 * → CheckoutPage rơi mock pay panel (acceptance: "không key → mock panel").
 */
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';

let stripePromise: Promise<Stripe | null> | null = null;

/** Stripe instance hoặc null khi chưa cấu hình key. */
export function getStripe(): Promise<Stripe | null> {
  if (!PUBLISHABLE_KEY) return Promise.resolve(null);
  stripePromise ??= loadStripe(PUBLISHABLE_KEY).catch(() => null);
  return stripePromise;
}

export interface MountedPayment {
  elements: StripeElements;
  /** Gọi trước khi unmount (React effect cleanup). */
  destroy: () => void;
}

export async function mountPaymentElement(
  container: HTMLElement,
  clientSecret: string
): Promise<MountedPayment | null> {
  const stripe = await getStripe();
  if (!stripe) return null;
  const elements = stripe.elements({ clientSecret, appearance: { theme: 'stripe' } });
  const paymentElement = elements.create('payment');
  paymentElement.mount(container);
  return {
    elements,
    destroy: () => paymentElement.unmount()
  };
}

export interface ConfirmResult {
  ok: boolean;
  /** Message lỗi Stripe (declined 4000…0002 v.v.) hiển thị trực tiếp UI. */
  error?: string;
}

/** elements.submit() (validate) → confirmPayment redirect: 'if_required' —
 *  card 4242 thành công inline; 4000…0002 trả error.message. */
export async function confirmPayment(mounted: MountedPayment): Promise<ConfirmResult> {
  const stripe = await getStripe();
  if (!stripe) return { ok: false, error: 'Stripe chưa sẵn sàng' };

  const { error: submitError } = await mounted.elements.submit();
  if (submitError) {
    return { ok: false, error: submitError.message ?? 'Thông tin thẻ chưa hợp lệ' };
  }

  const result = await stripe.confirmPayment({
    elements: mounted.elements,
    redirect: 'if_required'
  });
  if (result.error) {
    return { ok: false, error: result.error.message ?? 'Thanh toán thất bại' };
  }
  return { ok: true };
}
