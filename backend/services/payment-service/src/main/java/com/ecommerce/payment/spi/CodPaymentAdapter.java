package com.ecommerce.payment.spi;

/**
 * COD adapter (SF-13 A2 — pack: "SPI impl: createIntent → no-op trả cod:true").
 *
 * <p><strong>KHÔNG đăng ký bean</strong> (spec-critic P0): payment-service
 * inject MỘT {@link PaymentProviderAdapter} duy nhất (stripe/unconfigured —
 * {@code PaymentAdapterConfig}); bean thứ 2 kiểu interface này =
 * NoUniqueBeanDefinitionException. COD cũng KHÔNG đi qua createIntent — saga
 * bỏ hẳn bước intent, chỉ capture lúc giao qua {@code CodCaptureService}.
 * Class tồn tại để (1) giữ khái niệm adapter theo pack, (2) void/refund no-op
 * nếu luồng sau này cần (RMA D22), (3) test instantiate trực tiếp.</p>
 */
public class CodPaymentAdapter implements PaymentProviderAdapter {

    /** Id intent quy ước cho COD — capture lúc giao dùng cùng quy ước này. */
    public static String codIntentId(Object orderId) {
        return "cod:" + orderId;
    }

    @Override
    public AdapterIntent createIntent(IntentCommand command) {
        // No-op: không có provider thật — clientSecret null (contract ordering.yaml
        // "clientSecret NULL khi COD"), "REQUIRES_CONFIRMATION" = chờ thu tiền lúc giao.
        return new AdapterIntent(codIntentId(command.orderId()), null, "REQUIRES_CONFIRMATION");
    }

    @Override
    public AdapterIntent voidIntent(String providerIntentId, String idempotencyKey) {
        // Chưa thu tiền — void là no-op thành công (không có gì để hủy bên provider).
        return new AdapterIntent(providerIntentId, null, "VOIDED");
    }

    @Override
    public AdapterRefund refund(String providerIntentId, Long amountVnd, String idempotencyKey) {
        // Tiền mặt đã thu lúc giao — hoàn ngoài hệ thống (D22 RMA sẽ design riêng).
        return new AdapterRefund("cod-refund:" + idempotencyKey, "refunded", amountVnd);
    }

    @Override
    public ProviderWebhookEvent verifyWebhook(String rawBody, String signatureHeader) {
        throw new UnsupportedOperationException("COD không có webhook");
    }
}
