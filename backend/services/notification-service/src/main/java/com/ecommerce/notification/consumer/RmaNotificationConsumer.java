package com.ecommerce.notification.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.notification.config.RabbitMqConfig;
import com.ecommerce.notification.domain.SendLog;
import com.ecommerce.notification.mail.RmaMailer;
import com.ecommerce.notification.repo.SendLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumer RMA (SF-14, D22) — queue {@code notification.rma} ← rma.approved /
 * rejected / received / refunded (ordering outbox, payload FAT có email — D6).
 * Idempotent theo eventId (marker cùng tx send_log, pattern NotificationOrderConsumer).
 * SMTP lỗi → send_log FAILED + ACK (không requeue vô hạn — same policy order).
 */
@Component
public class RmaNotificationConsumer {

    private static final Logger log = LoggerFactory.getLogger(RmaNotificationConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final SendLogRepository sendLog;
    private final RmaMailer mailer;

    public RmaNotificationConsumer(IdempotentConsumer idempotentConsumer,
                                   SendLogRepository sendLog,
                                   RmaMailer mailer) {
        this.idempotentConsumer = idempotentConsumer;
        this.sendLog = sendLog;
        this.mailer = mailer;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_RMA)
    @Transactional
    public void on(EventEnvelope envelope) {
        if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
            return; // re-delivery — đã xử lý
        }
        var payload = envelope.payload();
        String email = payload.path("email").asText(null);
        String orderId = payload.path("orderId").asText("?");
        String rmaId = payload.path("rmaId").asText("?");
        String status = payload.path("status").asText("");
        Long refundAmount = payload.hasNonNull("refundAmount")
            ? payload.path("refundAmount").asLong() : null;
        String reason = payload.path("reason").asText(null);

        if (email == null || email.isBlank()) {
            log.warn("[rma] {} cho đơn {} thiếu email — log skip (fat-payload rule)", rmaId, orderId);
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), null,
                null, SendLog.STATUS_SKIPPED_NO_EMAIL, false, "rma payload không có email"));
            return;
        }

        String subject = mailer.subject(status, orderId);
        try {
            mailer.send(email, subject, mailer.html(status, orderId, reason, refundAmount));
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                subject, SendLog.STATUS_SENT, false, null));
        } catch (Exception e) {
            log.error("[rma] Gửi email lỗi (rma {}, đơn {}): {}", rmaId, orderId, e.toString());
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                null, SendLog.STATUS_FAILED, false, truncate(e.getMessage())));
        }
    }

    private String truncate(String message) {
        if (message == null) {
            return "unknown";
        }
        return message.length() > 500 ? message.substring(0, 500) : message;
    }
}
