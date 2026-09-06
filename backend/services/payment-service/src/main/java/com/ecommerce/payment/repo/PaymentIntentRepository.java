package com.ecommerce.payment.repo;

import com.ecommerce.payment.domain.PaymentIntent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PaymentIntentRepository extends JpaRepository<PaymentIntent, UUID> {

    /** Idempotency lookup — unique key (ordering sinh 1 lần, retry dùng lại). */
    Optional<PaymentIntent> findByIdempotencyKey(String idempotencyKey);

    /** Webhook/update theo pi_... của Stripe. */
    Optional<PaymentIntent> findByStripeIntentId(String stripeIntentId);
}
