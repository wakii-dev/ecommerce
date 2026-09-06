package com.ecommerce.inventory.api;

import com.ecommerce.inventory.api.dto.InsufficientStockDto;

import java.util.List;

/**
 * Ném ra khi reservation thiếu stock (spec §4.2 bước 5 — check-all rồi mới trừ,
 * exception để rollback mọi thứ trong tx) → `InventoryExceptionHandler` map 409
 * `ReservationConflictError` (ApiError + insufficient[]).
 */
public class InsufficientStockException extends RuntimeException {

    private final List<InsufficientStockDto> insufficient;

    public InsufficientStockException(List<InsufficientStockDto> insufficient) {
        super("Một hoặc nhiều variant không đủ tồn kho");
        this.insufficient = List.copyOf(insufficient);
    }

    public List<InsufficientStockDto> getInsufficient() {
        return insufficient;
    }
}
