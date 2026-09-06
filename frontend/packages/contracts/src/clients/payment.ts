import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/paymentSchema';

const routes = {
  createPaymentIntent: ['POST', '/api/payment/intents'],
  handlePaymentWebhook: ['POST', '/api/payment/webhook', ['Stripe-Signature']],
  createRefund: ['POST', '/api/payment/refunds'],
  voidPayment: ['POST', '/api/payment/void'],
} as const satisfies RouteMap;

export type PaymentClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createPaymentClient(opts: ApiClientOptions): PaymentClient {
  return createServiceClient<PaymentClient>(opts, routes);
}
