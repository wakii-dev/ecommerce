package com.ecommerce.catalog.domain;

/**
 * Trạng thái xuất bản product — khớp CHECK constraint V10 ('DRAFT','PUBLISHED').
 * DRAFT = admin lưu nháp, không hiện ở public API / không index ES.
 */
public enum ProductStatus {
    DRAFT,
    PUBLISHED
}
