import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/invoiceSchema';

const routes = {
  generateInvoice: ['POST', '/api/invoice/generate'],
} as const satisfies RouteMap;

export type InvoiceClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createInvoiceClient(opts: ApiClientOptions): InvoiceClient {
  return createServiceClient<InvoiceClient>(opts, routes);
}
