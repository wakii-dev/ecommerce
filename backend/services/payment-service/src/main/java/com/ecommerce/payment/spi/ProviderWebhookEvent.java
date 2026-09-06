package com.ecommerce.payment.spi;

/**
 * Webhook event đã verify + parse. {@code intentId} null với event type không
 * liên quan intent (service no-op ack 200). amount = VND nguyên.
 */
public record ProviderWebhookEvent(
    String eventId,        // evt_... — dedupe key phía service
    String type,           // payment_intent.succeeded | payment_intent.payment_failed | charge.refunded | ...
    String intentId,       // pi_...
    Long amount,
    String currency,
    String failureMessage  // null khi succeeded
) {
}
