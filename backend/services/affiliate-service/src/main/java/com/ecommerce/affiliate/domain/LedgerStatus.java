package com.ecommerce.affiliate.domain;

/**
 * Trạng thái entry sổ hoa hồng (contract affiliate.yaml): PENDING khi đơn mới;
 * CONFIRMED khi qua cửa hoàn tiền (7 ngày). SF-12 chỉ tạo PENDING — payout /
 * chuyển CONFIRMED thủ công (boundary pack: KHÔNG payout thật).
 */
public enum LedgerStatus {
    PENDING, CONFIRMED
}
