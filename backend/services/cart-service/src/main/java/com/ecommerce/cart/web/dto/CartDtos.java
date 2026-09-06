package com.ecommerce.cart.web.dto;

import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response/Request DTO khớp {@code contracts/openapi/cart.yaml} (freeze SF-2 +
 * amendment A1 — variantId optional). Field name camelCase ĐÚNG contract, KHÔNG
 * đổi (packages/contracts generated client đọc đúng shape này).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class CartDtos {

    private CartDtos() {
    }

    /** Mirror CartItem —Unavailable bắt buộc có mặt (true/false). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CartItemResponse(
            String id,
            UUID productId,
            UUID variantId,
            String slug,
            String name,
            String image,
            int qty,
            long unitPrice,
            long lineTotal,
            boolean unavailable) {
    }

    /** Mirror Cart — cartToken CHỈ có với giỏ guest (user JWT không cần).
     *  @JsonInclude đặt TỪNG record (annotation outer class KHÔNG áp record lồng). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CartResponse(
            String cartToken,
            List<CartItemResponse> items,
            long subtotal) {
    }

    /** Mirror AddItemRequest — variantId OMIT khi product không variant (A1). */
    public record AddItemRequest(
            UUID productId,
            UUID variantId,
            Integer qty,
            Boolean allowOos) {
    }

    /** Mirror UpdateItemRequest. */
    public record UpdateItemRequest(Integer qty) {
    }

    /** Mirror MergeCartRequest — body required theo contract (cookie là leniency). */
    public record MergeCartRequest(String cartToken) {
    }
}
