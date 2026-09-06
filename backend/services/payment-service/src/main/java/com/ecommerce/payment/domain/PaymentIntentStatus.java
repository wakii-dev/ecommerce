package com.ecommerce.payment.domain;

/**
 * LIFECYCLE nội bộ DB (pack pin: CREATED|REQUIRES_CONFIRMATION|SUCCEEDED|FAILED|
 * VOIDED|REFUNDED) — KHÔNG phải mirror Stripe. Mirror status Stripe lưu riêng
 * cột `stripe_status` (response contract enum). 2 hệ status tách bạch (spec §5.3).
 */
public enum PaymentIntentStatus {
    CREATED, REQUIRES_CONFIRMATION, SUCCEEDED, FAILED, VOIDED, REFUNDED
}
