import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/cartSchema';

const routes = {
  createCart: ['POST', '/api/cart'],
  getCart: ['GET', '/api/cart'],
  addCartItem: ['POST', '/api/cart/items'],
  updateCartItem: ['PATCH', '/api/cart/items/{itemId}'],
  removeCartItem: ['DELETE', '/api/cart/items/{itemId}'],
  mergeCart: ['POST', '/api/cart/merge'],
} as const satisfies RouteMap;

export type CartClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createCartClient(opts: ApiClientOptions): CartClient {
  return createServiceClient<CartClient>(opts, routes);
}
