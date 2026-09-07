package com.ecommerce.notification.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.notification.config.RabbitMqConfig;
import com.ecommerce.notification.domain.SendLog;
import com.ecommerce.notification.mail.InvoiceClient;
import com.ecommerce.notification.mail.ThankYouMailer;
import com.ecommerce.notification.repo.SendLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Consumer nhóm order (SF-10): queue {@code notification.orders} ←
 * order.confirmed + order.cancelled.
 *
 * <ul>
 *   <li><strong>order.confirmed</strong> — email cảm ơn tiếng Việt (fat payload
 *       §6.1.5: email + items + totals đủ, KHÔNG call-back) + attach PDF hóa
 *       đơn (InvoiceClient — lỗi PDF không chặn email). Idempotent theo eventId
 *       (marker trong cùng tx với send_log).</li>
 *   <li><strong>order.cancelled</strong> — payload schema KHÔNG có email
 *       (orderId/reason/cancelledBy/refunded) và fat-payload rule cấm call-back
 *       → KHÔNG gửi được email hủy; ghi send-log SKIPPED_NO_EMAIL. Deviation
 *       pack slice item 2 đã note ở FI-320 (cần amendment contracts thêm email
 *       vào order.cancelled nếu muốn email hủy thật).</li>
 * </ul>
 *
 * <p>SMTP/mail lỗi → send_log FAILED + ACK (không rethrow — requeue vô hạn với
 * lỗi permanent; at-least-once email duplicate chấp nhận được ở demo).</p>
 */
@Component
public class NotificationOrderConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationOrderConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final SendLogRepository sendLog;
    private final ThankYouMailer mailer;
    private final InvoiceClient invoiceClient;

    public NotificationOrderConsumer(IdempotentConsumer idempotentConsumer,
                                     SendLogRepository sendLog,
                                     ThankYouMailer mailer,
                                     InvoiceClient invoiceClient) {
        this.idempotentConsumer = idempotentConsumer;
        this.sendLog = sendLog;
        this.mailer = mailer;
        this.invoiceClient = invoiceClient;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_ORDERS)
    @Transactional
    public void on(EventEnvelope envelope) {
        if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
            return; // re-delivery — đã xử lý (marker cùng tx send_log)
        }
        switch (envelope.eventType()) {
            case "order.confirmed" -> onConfirmed(envelope);
            case "order.cancelled" -> onCancelled(envelope);
            default -> log.warn("Queue notification.orders nhận eventType lạ {} — bỏ qua",
                envelope.eventType());
        }
    }

    private void onConfirmed(EventEnvelope envelope) {
        var payload = envelope.payload();
        String orderId = payload.path("orderId").asText(null);
        String email = payload.path("email").asText(null);
        if (email == null || email.isBlank()) {
            log.warn("order.confirmed {} thiếu email — log skip", orderId);
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), null,
                null, SendLog.STATUS_SKIPPED_NO_EMAIL, false, "payload không có email"));
            return;
        }

        List<ThankYouMailer.Item> items = new ArrayList<>();
        for (var item : payload.path("items")) {
            items.add(new ThankYouMailer.Item(
                item.path("name").asText("Sản phẩm"),
                item.path("qty").asInt(1),
                item.path("qty").asInt(1) * item.path("price").asLong(0)));
        }
        long subtotal = payload.path("subtotal").asLong(0);
        long discount = payload.path("discount").asLong(0);
        long shippingFee = payload.path("shippingFee").asLong(0);
        long total = payload.path("total").asLong(0);

        InvoiceClient.Attachment invoice = invoiceClient.fetchInvoicePdf(orderId).orElse(null);
        String html = mailer.thankYouHtml(items, subtotal, discount, shippingFee, total, orderId);
        try {
            mailer.sendThankYou(email, orderId, html, invoice);
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                "Cảm ơn bạn đã mua hàng — đơn " + orderId, SendLog.STATUS_SENT,
                invoice != null, null));
        } catch (Exception e) {
            log.error("Gửi email cảm ơn lỗi (đơn {}): {}", orderId, e.toString());
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                null, SendLog.STATUS_FAILED, false, truncate(e.getMessage())));
        }
    }

    private void onCancelled(EventEnvelope envelope) {
        String orderId = envelope.payload().path("orderId").asText("?");
        // Payload order.cancelled không có email (schema frozen) — KHÔNG call-back
        log.info("order.cancelled {} — không gửi email (payload không có email; "
            + "fat-payload rule §6.1.5)", orderId);
        sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), null,
            null, SendLog.STATUS_SKIPPED_NO_EMAIL, false,
            "order.cancelled payload không có email (schema frozen)"));
    }

    private String truncate(String message) {
        if (message == null) {
            return "unknown";
        }
        return message.length() > 500 ? message.substring(0, 500) : message;
    }
}
