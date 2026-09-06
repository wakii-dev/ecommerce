package com.ecommerce.payment.spi;

/** Kết quả refund từ provider (re_..., status mirror `RefundStatus`). */
public record AdapterRefund(
    String refundId,
    String status,
    long amount
) {
}
