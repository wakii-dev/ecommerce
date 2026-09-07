package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.ShippingMethodDto;
import com.ecommerce.ordering.service.ShippingMethodsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * GET /shipping/methods — public (contract). SF-14: nhận optional
 * {@code province}/{@code district} (additive — contract shape giữ nguyên);
 * có GHN token + district là mã GHN → methods phí thật, không → flat-fee.
 * Fee hiển thị list tính weight 1 item — saga tính LẠI theo đơn lúc đặt.
 */
@RestController
public class ShippingController {

    private final ShippingMethodsService shipping;

    public ShippingController(ShippingMethodsService shipping) {
        this.shipping = shipping;
    }

    @GetMapping("/shipping/methods")
    public List<ShippingMethodDto> methods(
        @RequestParam(required = false) String province,
        @RequestParam(required = false) String district) {
        return shipping.methods(province, district, 1).stream()
            .map(m -> new ShippingMethodDto(m.id(), m.name(), m.fee(), m.etaDays()))
            .toList();
    }
}
