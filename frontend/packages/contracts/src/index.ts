export * from './client';
export * from './events';

export { createIdentityClient, type IdentityClient } from './clients/identity';
export { createCatalogClient, type CatalogClient } from './clients/catalog';
export { createCartClient, type CartClient } from './clients/cart';
export { createOrderingClient, type OrderingClient } from './clients/ordering';
export { createPaymentClient, type PaymentClient } from './clients/payment';
export { createInventoryClient, type InventoryClient } from './clients/inventory';
export { createNotificationClient, type NotificationClient } from './clients/notification';
export { createInvoiceClient, type InvoiceClient } from './clients/invoice';
export { createPartnerApiClient, type PartnerApiClient } from './clients/partnerApi';
export { createAffiliateClient, type AffiliateClient } from './clients/affiliate';
