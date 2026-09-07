package com.ecommerce.affiliate.loyalty;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Config slice loyalty (SF-14) — tách khỏi {@code AffiliateProperties} của
 * SF-12 (file-slice, không đụng file người khác). {@code @Component} +
 * {@code @ConfigurationProperties} để không phải sửa {@code @EnableConfigurationProperties}
 * trên app class chung.
 */
@Component
@ConfigurationProperties(prefix = "affiliate.loyalty")
public record LoyaltyProperties(
    /** % điểm earn trên total đơn (1 = 1%) — env LOYALTY_EARN_RATE. */
    double earnRate,
    /** 1 điểm quy đổi bao nhiêu VND khi burn (quyết định spec D3). */
    long pointVnd,
    /** Shared-secret header X-Internal-Token cho /internal/loyalty/redeem. */
    String internalToken
) {

    public LoyaltyProperties {
        if (earnRate <= 0) {
            earnRate = 1.0;
        }
        if (pointVnd <= 0) {
            pointVnd = 100;
        }
        if (internalToken == null) {
            internalToken = "dev-internal-token";
        }
    }
}
