package com.ecommerce.ordering.domain;

/**
 * Một dòng trong {@code rma_requests.items} (jsonb) — khớp contract RmaLine:
 * {@code {lineId, qty}}. {@code lineId} là id của OrderLine trong đơn
 * (contract: "client dung de tao RMA (lineId)").
 */
public record RmaLine(String lineId, int qty) {
}
