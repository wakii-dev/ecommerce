package com.ecommerce.payment.repo;

import com.ecommerce.payment.domain.PaymentIntent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface PaymentIntentRepository extends JpaRepository<PaymentIntent, UUID> {

    /** Idempotency lookup — unique key (ordering sinh 1 lần, retry dùng lại). */
    Optional<PaymentIntent> findByIdempotencyKey(String idempotencyKey);

    /** Webhook/update theo pi_... của Stripe. */
    Optional<PaymentIntent> findByStripeIntentId(String stripeIntentId);

    /** Contract 409: "order đã có intent active" — chống double-charge surface. */
    boolean existsByOrderIdAndStatusIn(String orderId, Collection<com.ecommerce.payment.domain.PaymentIntentStatus> statuses);
}
