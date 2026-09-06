import { createServiceClient, type ApiClientOptions, type RouteMap, type ServiceMethod } from '../client';
import type { operations } from '../generated/notificationSchema';

const routes = {
  sendEmail: ['POST', '/api/notification/emails'],
  listEmails: ['GET', '/api/notification/admin/emails'],
} as const satisfies RouteMap;

export type NotificationClient = { [K in keyof typeof routes]: ServiceMethod<operations[K]> };

export function createNotificationClient(opts: ApiClientOptions): NotificationClient {
  return createServiceClient<NotificationClient>(opts, routes);
}
