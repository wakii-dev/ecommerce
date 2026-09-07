package com.ecommerce.notification.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.notification.config.RabbitMqConfig;
import com.ecommerce.notification.domain.SendLog;
import com.ecommerce.notification.mail.WelcomeNewsletterMailer;
import com.ecommerce.notification.repo.SendLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumer newsletter (SF-13 A8): queue {@code notification.newsletter} ←
 * user.newsletter_subscribed {email, subscribedAt}. Idempotent theo eventId;
 * thiếu email → SKIPPED; SMTP lỗi → FAILED + ACK.
 */
@Component
public class NewsletterConsumer {

    private static final Logger log = LoggerFactory.getLogger(NewsletterConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final SendLogRepository sendLog;
    private final WelcomeNewsletterMailer mailer;

    public NewsletterConsumer(IdempotentConsumer idempotentConsumer,
                              SendLogRepository sendLog,
                              WelcomeNewsletterMailer mailer) {
        this.idempotentConsumer = idempotentConsumer;
        this.sendLog = sendLog;
        this.mailer = mailer;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_NEWSLETTER)
    @Transactional
    public void on(EventEnvelope envelope) {
        if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
            return; // re-delivery — đã xử lý
        }
        String email = envelope.payload().path("email").asText(null);
        if (email == null || email.isBlank()) {
            log.warn("user.newsletter_subscribed {} thiếu email — log skip", envelope.eventId());
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                null, SendLog.STATUS_SKIPPED_NO_EMAIL, false, "payload không có email"));
            return;
        }
        try {
            mailer.sendWelcomeEmail(email);
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                "Chào mừng bạn đến với Ecommerce Demo 🎉", SendLog.STATUS_SENT, false, null));
        } catch (Exception e) {
            log.error("Gửi email welcome lỗi ({}): {}", email, e.toString());
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
