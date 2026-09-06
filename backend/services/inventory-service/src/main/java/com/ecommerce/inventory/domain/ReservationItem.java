package com.ecommerce.inventory.domain;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 1 dòng item trong jsonb {@code reservations.items}.
 *
 * <p><strong>PIN casing (plan-critic P0):</strong> DB jsonb lưu SNAKE_CASE
 * {@code {"variant_id": ..., "qty": n}} (khớp convention SQL spec §4.1 + query
 * availability đọc {@code item->>'variant_id'}) — annotation dưới đây dẫn
 * Jackson (Hibernate jsonb serializer). Event payload thì CAMEL {@code variantId}
 * (schema freeze) — consumer/service remap lúc build payload.</p>
 */
public record ReservationItem(
    @JsonProperty("variant_id") String variantId,
    int qty
) {
}
