package com.ecommerce.partner.web.dto;

import java.time.Instant;
import java.util.List;

/**
 * Shape trả partner — MIRROR contracts/openapi/partner-api.yaml (frozen SF-2),
 * KHÔNG lộ field nội bộ (brand/tags/image/comparePrice... của catalog).
 * {@code updatedAt} = thời điểm proxy (GAP-2: catalog public DTO chưa có
 * updated_at — flag FI-310).
 */
public final class PartnerDtos {

    private PartnerDtos() {
    }

    public record PartnerProduct(
        String id,
        String slug,
        String name,
        long price,
        Instant updatedAt
    ) {
    }

    public record PartnerVariant(
        String id,
        String name,
        long price
    ) {
    }

    public record PartnerProductDetail(
        String id,
        String slug,
        String name,
        long price,
        Instant updatedAt,
        String description,
        List<PartnerVariant> variants
    ) {
    }

    public record PartnerCategory(
        String id,
        String slug,
        String name,
        String parentId
    ) {
    }

    /** Page chuẩn {items, page, size, total} — contract PartnerProductPage. */
    public record PartnerProductPage(
        List<PartnerProduct> items,
        int page,
        int size,
        long total
    ) {
    }
}
