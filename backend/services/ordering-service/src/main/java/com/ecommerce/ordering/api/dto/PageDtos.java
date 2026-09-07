package com.ecommerce.ordering.api.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/** Page response khớp contract OrderPage/OrderSummaryPage {items, page, size, total} — page 1-based. */
public final class PageDtos {

    private PageDtos() {
    }

    public record OrderSummaryPageDto(List<OrderSummaryDto> items, int page, int size, long total) {

        public static OrderSummaryPageDto of(Page<OrderSummaryDto> p) {
            return new OrderSummaryPageDto(p.getContent(), p.getNumber() + 1, p.getSize(), p.getTotalElements());
        }
    }

    public record OrderPageDto(List<OrderDto> items, int page, int size, long total) {

        public static OrderPageDto of(Page<OrderDto> p) {
            return new OrderPageDto(p.getContent(), p.getNumber() + 1, p.getSize(), p.getTotalElements());
        }
    }
}
