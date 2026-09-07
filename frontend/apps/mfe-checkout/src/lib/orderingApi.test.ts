import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiErrorClient, createOrder, fetchMyOrder, validateCoupon } from './orderingApi';

/**
 * Test orderingApi (SF-10) — mock global fetch, assert ĐÚNG wire format
 * contracts/openapi/ordering.yaml: path, method, Idempotency-Key header,
 * body shape (items chỉ productId/variantId/qty), uppercase coupon,
 * 502 saga-compensated → ApiErrorClient (UI hiện lý do).
 */

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

const SERVER_ORDER = {
  id: '0b9e6c1e-1111-4aaa-9ccc-000000000001',
  userId: 'user-1',
  status: 'PENDING',
  items: [
    {
      id: 'l1',
      productId: 'p1',
      variantId: '',
      name: 'Sản phẩm demo',
      qty: 2,
      unitPrice: 100000,
      lineTotal: 200000
    }
  ],
  subtotal: 200000,
  discount: 0,
  shippingFee: 25000,
  total: 225000,
  currency: 'VND',
  affiliateCode: null,
  paymentMethod: 'stripe',
  shippingMethod: 'standard',
  address: ADDRESS,
  timeline: [{ status: 'PENDING', at: '2026-09-07T00:00:00Z' }],
  createdAt: '2026-09-07T00:00:00Z',
  updatedAt: '2026-09-07T00:00:00Z'
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'X',
    headers: new Headers({ 'content-type': 'application/json' }),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer as ArrayBuffer
  } as unknown as Response;
}

function baseInput() {
  return {
    items: [
      {
        id: 'l1',
        productId: 'p1',
        variantId: '', // pin spec-critic: non-variant → ""
        qty: 2,
        unitPrice: 100000,
        lineTotal: 200000
      }
    ],
    address: ADDRESS,
    shippingMethod: 'standard'
  };
}

describe('orderingApi.createOrder', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('POST /api/ordering/orders + Idempotency-Key uuid + body shape contract (201)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { order: SERVER_ORDER, clientSecret: 'pi_secret_1' }));

    const { order, clientSecret } = await createOrder(baseInput());

    expect(clientSecret).toBe('pi_secret_1');
    expect(order.id).toBe(SERVER_ORDER.id);
    expect(order.status).toBe('PENDING');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ordering/orders');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$|^idem-/);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      items: [{ productId: 'p1', variantId: '', qty: 2 }],
      paymentMethod: 'stripe',
      shippingMethod: 'standard',
      address: ADDRESS
    });
  });

  it('couponCode → uppercase trong body; affiliateCode giữ nguyên', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { order: SERVER_ORDER, clientSecret: null }));

    await createOrder({ ...baseInput(), couponCode: ' welcome10 ', affiliateCode: 'HOIVU' });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.couponCode).toBe('WELCOME10');
    expect(body.affiliateCode).toBe('HOIVU');
  });

  it('items rỗng → chặn trước khi fetch', async () => {
    await expect(createOrder({ ...baseInput(), items: [] })).rejects.toThrow(/khả dụng/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('502 saga đã compensation → ApiErrorClient (status + detail server)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, { status: 502, title: 'Bad Gateway', detail: 'Thanh toán tạm bận — đơn đã hủy, thử lại sau' })
    );

    const err = await createOrder(baseInput()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiErrorClient);
    expect((err as ApiErrorClient).status).toBe(502);
    expect((err as ApiErrorClient).detail).toMatch(/Thanh toán tạm bận/);
  });
});

describe('orderingApi.validateCoupon', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('POST validate-coupon với code uppercase + subtotal; map response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: true, discount: 123456 }));

    const res = await validateCoupon('  welcome10 ', 1234567);

    expect(res).toEqual({ valid: true, discount: 123456 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ordering/orders/validate-coupon');
    expect(JSON.parse(String(init.body))).toEqual({ code: 'WELCOME10', subtotal: 1234567 });
  });

  it('coupon sai → valid false (không throw)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { valid: false, discount: 0, message: 'Mã không tồn tại' }));
    const res = await validateCoupon('NOPE', 100000);
    expect(res.valid).toBe(false);
  });
});

describe('orderingApi.fetchMyOrder', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('GET /api/ordering/me/orders/{id}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...SERVER_ORDER, status: 'CONFIRMED' }));

    const order = await fetchMyOrder(SERVER_ORDER.id);

    expect(order.status).toBe('CONFIRMED');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/ordering/me/orders/${SERVER_ORDER.id}`);
  });
});
