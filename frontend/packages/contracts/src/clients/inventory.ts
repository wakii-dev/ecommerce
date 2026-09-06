import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/inventorySchema';

const routes = {
  createReservation: ['POST', '/api/inventory/reservations'],
  getAvailability: ['GET', '/api/inventory/availability'],
  listLowStock: ['GET', '/api/inventory/admin/low-stock'],
} as const satisfies RouteMap;

export type InventoryClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createInventoryClient(opts: ApiClientOptions): InventoryClient {
  return createServiceClient<InventoryClient>(opts, routes);
}
