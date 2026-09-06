package com.ecommerce.payment.config;

import com.ecommerce.payment.spi.PaymentProviderAdapter;
import com.ecommerce.payment.spi.StripeAdapter;
import com.ecommerce.payment.spi.UnconfiguredAdapter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * Wire adapter: có STRIPE_SECRET_KEY (non-blank) → StripeAdapter; KHÔNG →
 * {@link UnconfiguredAdapter} (degraded — 503 payment_unconfigured, boot OK).
 *
 * <p>KHÔNG dùng {@code @ConditionalOnProperty} — empty string vẫn match
 * (present ≠ non-blank) → StripeAdapter với key rỗng = mọi call Stripe fail.
 * Custom Condition check non-blank (plan-critic P1).</p>
 */
@Configuration
public class PaymentAdapterConfig {

    @Bean
    @Conditional(StripeSecretKeyPresentCondition.class)
    PaymentProviderAdapter stripeAdapter(
        @Value("${stripe.secret-key}") String secretKey,
        @Value("${stripe.base-url}") String baseUrl,
        @Value("${stripe.webhook-secret:}") String webhookSecret
    ) {
        return new StripeAdapter(secretKey, baseUrl, webhookSecret);
    }

    @Bean
    @ConditionalOnMissingBean(PaymentProviderAdapter.class)
    PaymentProviderAdapter unconfiguredAdapter() {
        return new UnconfiguredAdapter();
    }

    static class StripeSecretKeyPresentCondition implements Condition {

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            String key = context.getEnvironment().getProperty("stripe.secret-key", "");
            return key != null && !key.isBlank();
        }
    }
}
