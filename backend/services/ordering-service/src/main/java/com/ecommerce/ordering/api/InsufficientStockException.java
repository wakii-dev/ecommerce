package com.ecommerce.ordering.api;

import java.util.List;

/**
 * Reserve inventory all-or-nothing fail → 409 với {@code insufficient[]}
 * (mirror ReservationConflictError inventory.yaml / CreateOrderConflictError
 * ordering.yaml). Inventory-service đã trả danh sách thiếu — đóng gói lại.
 */
public class InsufficientStockException extends RuntimeException {

    private final List<InsufficientStockDto> insufficient;

    public InsufficientStockException(List<InsufficientStockDto> insufficient) {
        super("Không đủ tồn kho cho một số variant");
        this.insufficient = List.copyOf(insufficient);
    }

    public List<InsufficientStockDto> getInsufficient() {
        return insufficient;
    }
}
