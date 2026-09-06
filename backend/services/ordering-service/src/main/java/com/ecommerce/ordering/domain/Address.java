package com.ecommerce.ordering.domain;

/**
 * Địa chỉ giao hàng — jsonb trên {@code orders.address}, khớp contract
 * {@code Address} (fullName/phone/line1/ward/district/city bắt buộc).
 * Record + Jackson (Hibernate {@code @JdbcTypeCode(SqlTypes.JSON)}) — casing giữ nguyên.
 */
public record Address(
    String fullName,
    String phone,
    String line1,
    String ward,
    String district,
    String city,
    String postalCode
) {
}
