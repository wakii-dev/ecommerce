package com.ecommerce.ordering.saga;

import com.ecommerce.ordering.api.InvalidShippingMethodException;

import java.util.List;

/**
 * Phí vận chuyển flat (assumption epic: "Shipping: flat-fee demo, không tích
 * hợp carrier") — serve GET /shipping/methods (contract) + lookup fee khi tạo
 * đơn. GHN thực (SF-14) thay bằng integration riêng, shape giữ nguyên.
 */
public final class ShippingMethods {

    public record Method(String id, String name, long fee, int etaDays) {
    }

    public static final List<Method> ALL = List.of(
        new Method("standard", "Giao hàng tiêu chuẩn", 20_000, 3),
        new Method("express", "Giao hàng nhanh", 40_000, 1)
    );

    private ShippingMethods() {
    }

    public static Method byId(String id) {
        return ALL.stream().filter(m -> m.id().equals(id)).findFirst()
            .orElseThrow(() -> new InvalidShippingMethodException("Phương thức vận chuyển không hợp lệ: " + id));
    }
}
