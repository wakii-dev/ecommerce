package com.ecommerce.catalog.domain;

/**
 * Trạng thái moderation review (SF-8): mọi review tạo vào {@link #PENDING};
 * admin duyệt qua {@code POST /admin/reviews/{id}/approve|reject}. Chỉ
 * PENDING → APPROVED/REJECTED được phép (transition khác → 409 — spec Q7).
 */
public enum ReviewStatus {
    PENDING,
    APPROVED,
    REJECTED
}
