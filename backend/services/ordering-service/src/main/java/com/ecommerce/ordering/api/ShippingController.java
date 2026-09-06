package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.ShippingMethodDto;
import com.ecommerce.ordering.saga.ShippingMethods;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** GET /shipping/methods — public (contract); MVP flat-fee (assumption epic). */
@RestController
public class ShippingController {

    @GetMapping("/shipping/methods")
    public List<ShippingMethodDto> methods() {
        return ShippingMethods.ALL.stream()
            .map(m -> new ShippingMethodDto(m.id(), m.name(), m.fee(), m.etaDays()))
            .toList();
    }
}
