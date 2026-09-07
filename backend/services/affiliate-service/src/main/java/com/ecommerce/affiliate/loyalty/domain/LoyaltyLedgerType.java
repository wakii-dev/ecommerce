package com.ecommerce.affiliate.loyalty.domain;

/**
 * Loại entry sổ điểm (D22) — {@code points} là DELTA có dấu:
 * EARN (+, từ order.confirmed) · REDEEM (−, checkout dùng điểm) ·
 * ADJUST (±, admin chỉnh tay).
 */
public enum LoyaltyLedgerType {
    EARN,
    REDEEM,
    ADJUST
}
