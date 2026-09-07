package com.ecommerce.notification.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.notification.config.RabbitMqConfig;
import com.ecommerce.notification.domain.SendLog;
import com.ecommerce.notification.mail.AbandonedCartMailer;
import com.ecommerce.notification.repo.SendLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumer abandoned cart (SF-13 A4): queue {@code notification.carts} ←
 * cart.abandoned {userId, email, itemCount, updatedAt}. Idempotent theo
 * eventId; thiếu email → SKIPPED (fat-payload rule); SMTP lỗi → FAILED + ACK.
 */
@Component
public class AbandonedCartConsumer {

    private static final Logger log = LoggerFactory.getLogger(AbandonedCartConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final SendLogRepository sendLog;
    private final AbandonedCartMailer mailer;

    public AbandonedCartConsumer(IdempotentConsumer idempotentConsumer,
                                 SendLogRepository sendLog,
                                 AbandonedCartMailer mailer) {
        this.idempotentConsumer = idempotentConsumer;
        this.sendLog = sendLog;
        this.mailer = mailer;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_CARTS)
    @Transactional
    public void on(EventEnvelope envelope) {
        if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
            return; // re-delivery — đã xử lý
        }
        String email = envelope.payload().path("email").asText(null);
        int itemCount = envelope.payload().path("itemCount").asInt(0);
        if (email == null || email.isBlank()) {
            log.warn("cart.abandoned {} thiếu email — log skip", envelope.eventId());
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), null,
                null, SendLog.STATUS_SKIPPED_NO_EMAIL, false, "payload không có email"));
            return;
        }
        try {
            mailer.sendAbandonedCartEmail(email, itemCount);
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                "Giỏ hàng đang chờ bạn", SendLog.STATUS_SENT, false, null));
        } catch (Exception e) {
            log.error("Gửi email bỏ quên giỏ lỗi ({}): {}", email, e.toString());
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
