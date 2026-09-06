package com.ecommerce.payment.spi;

import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Charge;
import com.stripe.model.PaymentIntent;
import com.stripe.model.Refund;
import com.stripe.model.StripeObject;
import com.stripe.net.RequestOptions;
import com.stripe.net.Webhook;
import com.stripe.param.PaymentIntentCancelParams;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.RefundCreateParams;

import java.util.Locale;

/**
 * Stripe adapter đầu tiên của SPI (D3). Test mode — key từ env, KHÔNG commit.
 *
 * <ul>
 *   <li>VND zero-decimal (D10): amount truyền nguyên, currency lowcase `vnd`.</li>
 *   <li>Stripe-side idempotency: {@code RequestOptions.setIdempotencyKey} (verified
 *       javap 24.16) — local rollback sau khi Stripe chấp nhận không mint `pi_` thứ 2.</li>
 *   <li>base-url per-request cho IT WireMock (prod mặc định api.stripe.com).</li>
 *   <li>Webhook: {@code Webhook.constructEvent} verify HMAC TRƯỚC khi parse —
 *       sai → {@link WebhookVerificationException}.</li>
 * </ul>
 */
public class StripeAdapter implements PaymentProviderAdapter {

    private final String secretKey;
    private final String baseUrl;
    private final String webhookSecret;

    public StripeAdapter(String secretKey, String baseUrl, String webhookSecret) {
        this.secretKey = secretKey;
        this.baseUrl = baseUrl;
        this.webhookSecret = webhookSecret;
    }

    @Override
    public AdapterIntent createIntent(IntentCommand command) {
        PaymentIntentCreateParams params = PaymentIntentCreateParams.builder()
            .setAmount(command.amountVnd())
            .setCurrency(command.currency().toLowerCase(Locale.ROOT))
            .setAutomaticPaymentMethods(
                PaymentIntentCreateParams.AutomaticPaymentMethods.builder().setEnabled(true).build())
            .putMetadata("order_id", command.orderId())
            .build();
        try {
            PaymentIntent intent = PaymentIntent.create(params, requestOptions(command.idempotencyKey()));
            return new AdapterIntent(intent.getId(), intent.getClientSecret(), mirrorStatus(intent.getStatus()));
        } catch (StripeException e) {
            throw wrap("create intent cho order " + command.orderId(), e);
        }
    }

    @Override
    public AdapterIntent voidIntent(String providerIntentId, String idempotencyKey) {
        try {
            PaymentIntent intent = PaymentIntent.retrieve(providerIntentId, requestOptions(null));
            intent = intent.cancel(PaymentIntentCancelParams.builder().build(), requestOptions(idempotencyKey));
            return new AdapterIntent(intent.getId(), intent.getClientSecret(), mirrorStatus(intent.getStatus()));
        } catch (StripeException e) {
            throw wrap("void intent " + providerIntentId, e);
        }
    }

    @Override
    public AdapterRefund refund(String providerIntentId, Long amountVnd, String idempotencyKey) {
        RefundCreateParams.Builder builder = RefundCreateParams.builder()
            .setPaymentIntent(providerIntentId);
        if (amountVnd != null) {
            builder.setAmount(amountVnd);
        }
        try {
            Refund refund = Refund.create(builder.build(), requestOptions(idempotencyKey));
            return new AdapterRefund(refund.getId(), mirrorStatus(refund.getStatus()), refund.getAmount());
        } catch (StripeException e) {
            throw wrap("refund intent " + providerIntentId, e);
        }
    }

    @Override
    public ProviderWebhookEvent verifyWebhook(String rawBody, String signatureHeader) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            throw new PaymentUnconfiguredException(
                "stripe.webhook-secret chưa cấu hình — không verify được webhook Stripe");
        }
        com.stripe.model.Event event;
        try {
            event = Webhook.constructEvent(rawBody, signatureHeader, webhookSecret);
        } catch (SignatureVerificationException e) {
            throw new WebhookVerificationException("Chữ ký Stripe-Signature không hợp lệ", e);
        }
        return toWebhookEvent(event);
    }

    private ProviderWebhookEvent toWebhookEvent(com.stripe.model.Event event) {
        StripeObject dataObject = deserializeDataObject(event);
        if (dataObject instanceof PaymentIntent intent) {
            String failure = intent.getLastPaymentError() != null
                ? intent.getLastPaymentError().getMessage() : null;
            return new ProviderWebhookEvent(event.getId(), event.getType(), intent.getId(),
                intent.getAmount(), intent.getCurrency(), failure);
        }
        if (dataObject instanceof Charge charge) {
            return new ProviderWebhookEvent(event.getId(), event.getType(), charge.getPaymentIntent(),
                charge.getAmountRefunded(), charge.getCurrency(), null);
        }
        // event type không parse được / không liên quan intent — service quyết no-op
        return new ProviderWebhookEvent(event.getId(), event.getType(), null, null, null, null);
    }

    /**
     * getObject() rỗng khi api_version event ≠ SDK pin (Stripe đổi version) —
     * fallback deserializeUnsafe() (parse raw JSON bỏ qua version check, pattern
     * khuyến nghị docs stripe-java).
     */
    private StripeObject deserializeDataObject(com.stripe.model.Event event) {
        if (event.getDataObjectDeserializer().getObject().isPresent()) {
            return event.getDataObjectDeserializer().getObject().get();
        }
        try {
            return event.getDataObjectDeserializer().deserializeUnsafe();
        } catch (Exception e) {
            return null;
        }
    }

    /** Mirror status UPPERCASE — khớp enum contract `PaymentIntentStatus` (Stripe trả lowercase). */
    private String mirrorStatus(String status) {
        return status != null ? status.toUpperCase(Locale.ROOT) : null;
    }

    /** Stripe-side idempotency key + base-url override (IT WireMock). */
    private RequestOptions requestOptions(String idempotencyKey) {
        RequestOptions.RequestOptionsBuilder builder = RequestOptions.builder()
            .setApiKey(secretKey)
            .setBaseUrl(baseUrl);
        if (idempotencyKey != null) {
            builder.setIdempotencyKey(idempotencyKey);
        }
        return builder.build();
    }

    private RuntimeException wrap(String action, StripeException e) {
        // InvalidRequest (refund vượt amount / already refunded / not cancellable) →
        // 409 payment_conflict phía service; lỗi hạ tầng → 502 (service phân loại theo type).
        if (e instanceof com.stripe.exception.InvalidRequestException) {
            return new ProviderConflictException("Stripe từ chối (" + action + "): " + safeMessage(e));
        }
        return new ProviderUnavailableException("Stripe lỗi khi " + action + ": " + safeMessage(e), e);
    }

    private String safeMessage(StripeException e) {
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }
}
