package com.ecommerce.ordering.saga;

import java.util.UUID;

/**
 * SPI authority giá (§6.1.1) — tách saga khỏi nguồn giá để swap khi coordinator
 * duyệt internal pricing endpoint (REQUIREMENT-GAP FI-310, comment 94b8496e):
 * hiện tại {@link HttpCatalogPricingClient} gọi admin-by-id; sau này chỉ đổi
 * implementation/config, saga không sửa.
 */
public interface PricingAuthority {

    /**
     * Resolve giá ĐƠN BIẾN THỂ + tên hiển thị tại thời điểm đặt.
     *
     * @throws ItemUnavailableException product/variant không tồn tại (§6.1.2 —
     *                                  đơn không đặt được)
     * @throws PricingUnavailableException catalog không trả lời (hạ tầng — 502)
     */
    PricedItem price(UUID productId, UUID variantId);

    /**
     * Kết quả re-price 1 dòng — {@code unitPrice} là ĐƠN BIẾN THỂ đã gồm
     * priceDelta (catalog convention: giá variant = price gốc + priceDelta).
     */
    record PricedItem(UUID productId, UUID variantId, String name, long unitPrice) {
    }
}
