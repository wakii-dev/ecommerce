package com.ecommerce.ordering.api.dto;

/**
 * DTO stats admin — khớp contract RevenueByDay / OrdersSummary / TopProduct
 * (§6.1.8, freeze SF-2 — mfe-admin dashboard đọc直接, không BFF).
 */
public final class StatsDtos {

    private StatsDtos() {
    }

    public record RevenueByDayDto(String date, long revenue, long orders) {
    }

    public record OrdersSummaryDto(
        long pending,
        long paid,
        long confirmed,
        long shipped,
        long delivered,
        long cancelled,
        long failed,
        long totalRevenue,
        long todayRevenue,
        long todayOrders
    ) {
    }

    public record TopProductDto(String productId, String name, long qty, long revenue) {
    }
}
