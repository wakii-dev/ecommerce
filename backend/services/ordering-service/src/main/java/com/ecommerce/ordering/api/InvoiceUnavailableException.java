package com.ecommerce.ordering.api;

/** invoice-service down/render lỗi → 503 problem+json rõ ràng (D18 — degraded như Stripe, KHÔNG crash). */
public class InvoiceUnavailableException extends RuntimeException {

    public InvoiceUnavailableException(String message) {
        super(message);
    }
}
