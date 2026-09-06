package com.ecommerce.ordering.api.dto;

import com.ecommerce.ordering.domain.Order;

/** Mapper trung gian saga dùng (tránh import controller-layer rải rác). */
public final class OrderMapper {

    private OrderMapper() {
    }

    public static OrderDto toDto(Order o) {
        return OrderDto.from(o);
    }
}
