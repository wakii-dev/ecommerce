package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.CouponDtos.PublicCouponDto;
import com.ecommerce.ordering.service.CouponService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * GET /coupons/public — coupon center (contract listPublicCoupons, public qua
 * gateway-auth). Review SF-9 P1: endpoint có trong contract + allowlist nhưng
 * chưa có controller → 404; listPublic() là dead code.
 */
@RestController
public class CouponController {

    private final CouponService couponService;

    public CouponController(CouponService couponService) {
        this.couponService = couponService;
    }

    @GetMapping("/coupons/public")
    public List<PublicCouponDto> publicCoupons() {
        return couponService.listPublic();
    }
}
