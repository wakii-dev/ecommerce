import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PaymentUnavailableError,
  confirmOrderMock,
  createOrder,
  validateCoupon,
  type Order
} from './orderingStub';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const ADDRESS = {
  fullName: 'Nguyen Van A',
  phone: '0901234567',
  line1: '12 Nguyen Hue',
  ward: 'Ben Nghe',
  district: 'Quan 1',
  city: 'TP. HCM'
};

function baseInput() {
  return {
    items: [
      {
        id: 'l1',
        productId: 'p1',
        variantId: '', // non-variant pin → ""
        qty: 2,
        unitPrice: 100000,
        lineTotal: 200000
      }
    ],
    address: ADDRESS,
    shippingMethod: 'standard',
    shippingFee: 25000,
    userId: 'user-1'
  };
}

describe('orderingStub.validateCoupon', () => {
  it('WELCOME10 → −10% FLOOR trên VND (1234567 → 123456)', () => {
    expect(validateCoupon('WELCOME10', 1234567)).toEqual({ valid: true, discount: 123456 });
  });

  it('code lạ → invalid shape đúng contract (discount 0 + message)', () => {
    const res = validateCoupon('NOPE', 100000);
    expect(res.valid).toBe(false);
    expect(res.discount).toBe(0);
    expect(res.message).toBeTruthy();
  });

  it('case-insensitive + trim', () => {
    expect(validateCoupon('  welcome10 ', 999)).toEqual({ valid: true, discount: 99 });
  });
});

describe('orderingStub.createOrder', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('payload đúng shape: Idempotency-Key uuid, VND, amount = total; trả clientSecret', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ paymentIntentId: 'pi_1', clientSecret: 'pi_1_secret', status: 'REQUIRES_PAYMENT_METHOD' })
    } as unknown as Response);

    const { order, clientSecret } = await createOrder(baseInput());

    expect(clientSecret).toBe('pi_1_secret');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/payment/intents');
    const body = JSON.parse(String(init.body));
    expect(body.currency).toBe('VND');
    expect(body.amount).toBe(200000 - 0 + 25000); // không coupon
    expect(body.orderId).toBe(order.id);
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

    expect(order.status).toBe('PENDING');
    expect(order.total).toBe(225000);
    expect(order.address).toEqual(ADDRESS);
    expect(order.timeline).toEqual([{ status: 'PENDING', at: expect.any(String) }]);
  });

  it('coupon hợp lệ → discount trừ vào total; couponCode uppercase', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ paymentIntentId: 'pi_2', clientSecret: 's', status: 'X' })
    } as unknown as Response);

    const { order } = await createOrder({ ...baseInput(), couponCode: 'welcome10' });

    expect(order.couponCode).toBe('WELCOME10');
    expect(order.discount).toBe(20000); // 10% của 200.000
    expect(order.total).toBe(200000 - 20000 + 25000);
  });

  it('payment 503 (unconfigured) → PaymentUnavailableError', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ title: 'payment_unconfigured' })
    } as unknown as Response);

    await expect(createOrder(baseInput())).rejects.toBeInstanceOf(PaymentUnavailableError);
  });

  it('items rỗng → chặn trước khi gọi payment (contract minItems 1)', async () => {
    await expect(createOrder({ ...baseInput(), items: [] })).rejects.toThrow(/khả dụng/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('orderingStub.confirmOrderMock', () => {
  it('PENDING→PAID→CONFIRMED đúng thứ tự §3.6', () => {
    const pending = {
      id: 'mock-1',
      userId: 'u',
      status: 'PENDING',
      items: [],
      subtotal: 1,
      discount: 0,
      shippingFee: 0,
      total: 1,
      currency: 'VND',
      paymentMethod: 'stripe',
      shippingMethod: 'standard',
      address: ADDRESS,
      timeline: [{ status: 'PENDING' as const, at: 't0' }],
      createdAt: 't0',
      updatedAt: 't0'
    } as Order;

    const confirmed = confirmOrderMock(pending);
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.timeline.map((entry) => entry.status)).toEqual(['PENDING', 'PAID', 'CONFIRMED']);
  });
});
