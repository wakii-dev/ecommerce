package com.ecommerce.ordering.api.dto;

import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.domain.OrderStatus;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Khớp contract Order — đầy đủ items + timeline + address. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OrderDto(
    UUID id,
    UUID userId,
    OrderStatus status,
    List<OrderLineDto> items,
    long subtotal,
    long discount,
    long shippingFee,
    Long pointsDiscount,
    long total,
    String currency,
    String couponCode,
    String affiliateCode,
    String paymentMethod,
    String shippingMethod,
    String trackingCode,
    AddressDto address,
    List<TimelineEntryDto> timeline,
    Instant createdAt,
    Instant updatedAt
) {

    public static OrderDto from(Order o) {
        return new OrderDto(
            o.getId(), o.getUserId(), o.getStatus(),
            o.getItems().stream().map(OrderLineDto::from).toList(),
            o.getSubtotal(), o.getDiscount(), o.getShippingFee(), null,
            o.getTotal(), o.getCurrency(), o.getCouponCode(), o.getAffiliateCode(),
            o.getPaymentMethod(), o.getShippingMethod(), o.getTrackingCode(),
            new AddressDto(o.getAddress().fullName(), o.getAddress().phone(), o.getAddress().line1(),
                o.getAddress().ward(), o.getAddress().district(), o.getAddress().city(),
                o.getAddress().postalCode()),
            o.getTimeline().stream().map(TimelineEntryDto::from).toList(),
            o.getCreatedAt(), o.getUpdatedAt()
        );
    }
}
