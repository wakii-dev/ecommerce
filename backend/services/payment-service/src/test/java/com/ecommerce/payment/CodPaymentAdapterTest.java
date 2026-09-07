package com.ecommerce.payment;

import com.ecommerce.payment.spi.AdapterIntent;
import com.ecommerce.payment.spi.CodPaymentAdapter;
import com.ecommerce.payment.spi.IntentCommand;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit CodPaymentAdapter (SF-13 A2) — KHÔNG bean (payment inject 1 adapter
 * duy nhất; spec-critic P0). createIntent no-op clientSecret null, id
 * quy ước cod:&lt;orderId&gt;; void/refund no-op; verifyWebhook ném.
 */
class CodPaymentAdapterTest {

    private final CodPaymentAdapter adapter = new CodPaymentAdapter();

    @Test
    void createIntent_noOp_codIntentIdNullClientSecret() {
        String orderId = UUID.randomUUID().toString();
        AdapterIntent intent = adapter.createIntent(
            new IntentCommand(orderId, 250_000L, "VND", "idem-1"));
        assertThat(intent.providerIntentId()).isEqualTo("cod:" + orderId);
        assertThat(intent.clientSecret()).isNull();
        assertThat(intent.status()).isEqualTo("REQUIRES_CONFIRMATION");
    }

    @Test
    void voidAndRefund_noOpSuccess_verifyWebhookThrows() {
        AdapterIntent voided = adapter.voidIntent("cod:abc", "idem-1");
        assertThat(voided.status()).isEqualTo("VOIDED");

        var refund = adapter.refund("cod:abc", 250_000L, "idem-2");
        assertThat(refund.refundId()).isEqualTo("cod-refund:idem-2");
        assertThat(refund.amount()).isEqualTo(250_000L);

        assertThatThrownBy(() -> adapter.verifyWebhook("{}", "sig"))
            .isInstanceOf(UnsupportedOperationException.class);
    }
}
