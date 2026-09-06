package com.ecommerce.affiliate.domain;

/**
 * Trạng thái hồ sơ affiliate — PENDING/APPROVED/REJECTED theo contract freeze
 * {@code affiliate.yaml}; SUSPENDED là superset additive (acceptance pack:
 * "suspend → link không track" — reject của contract chỉ từ PENDING nên
 * không chặn được affiliate đã APPROVED; requiremen-gap đã note FI-310).
 * Track click CHỈ nhận code của affiliate APPROVED.
 */
public enum AffiliateStatus {
    PENDING, APPROVED, REJECTED, SUSPENDED
}
