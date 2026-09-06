package com.ecommerce.affiliate.api.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * DTOs theo contract freeze {@code contracts/openapi/affiliate.yaml} —
 * response KHÔNG thêm/bớt field (conformance).
 */
public final class AffiliateDtos {

    private AffiliateDtos() {
    }

    // ── requests ────────────────────────────────────────────────────────────

    public record RegisterRequest(
        String portfolioUrl,
        @Size(max = 1000, message = "note tối đa 1000 ký tự") String note
    ) {
    }

    public record TrackClickRequest(
        @NotBlank(message = "refCode bắt buộc") String refCode
    ) {
    }

    public record UpdateRateRequest(
        @NotNull(message = "rate bắt buộc")
        @DecimalMin(value = "0.0", inclusive = false, message = "rate phải > 0")
        @DecimalMax(value = "50.0", message = "rate phải ≤ 50")
        BigDecimal rate
    ) {
    }

    // ── responses ───────────────────────────────────────────────────────────

    public record AffiliatePendingResponse(String id, String status) {
    }

    /** Stats tổng của 1 affiliate (contract AffiliateStats). */
    public record StatsResponse(int clicks, int conversions, long earnings) {
    }

    /** Hồ sơ (contract AffiliateProfile) — code null tới khi APPROVED. */
    public record AffiliateProfileResponse(
        String id,
        String code,
        String status,
        BigDecimal rate,
        StatsResponse stats
    ) {
    }

    public record LedgerEntryResponse(
        String id,
        String orderId,
        long orderTotal,
        BigDecimal rate,
        long commission,
        String status,
        Instant createdAt
    ) {
    }

    /** Page chuẩn {items, page, size, total} (1-based). */
    public record PageResponse<T>(List<T> items, int page, int size, long total) {
    }

    /** Stats admin (contract AffiliateAdminStats). */
    public record AdminStatsResponse(
        long totalAffiliates,
        long activeClicks,
        long conversions,
        long totalCommission
    ) {
    }
}
