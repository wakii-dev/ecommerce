package com.ecommerce.notification.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.notification.config.RabbitMqConfig;
import com.ecommerce.notification.domain.SendLog;
import com.ecommerce.notification.mail.PasswordResetMailer;
import com.ecommerce.notification.repo.SendLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumer password reset (SF-13 A1): queue {@code notification.password_reset}
 * ← user.password_reset_requested {email, token, expiresAt}. Idempotent theo
 * eventId; SMTP lỗi → send_log FAILED + ACK (pattern NotificationOrderConsumer).
 */
@Component
public class PasswordResetConsumer {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final SendLogRepository sendLog;
    private final PasswordResetMailer mailer;

    public PasswordResetConsumer(IdempotentConsumer idempotentConsumer,
                                 SendLogRepository sendLog,
                                 PasswordResetMailer mailer) {
        this.idempotentConsumer = idempotentConsumer;
        this.sendLog = sendLog;
        this.mailer = mailer;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_PASSWORD_RESET)
    @Transactional
    public void on(EventEnvelope envelope) {
        if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
            return; // re-delivery — đã xử lý
        }
        String email = envelope.payload().path("email").asText(null);
        String token = envelope.payload().path("token").asText(null);
        if (email == null || email.isBlank() || token == null || token.isBlank()) {
            log.warn("user.password_reset_requested thiếu email/token — log skip");
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                null, SendLog.STATUS_SKIPPED_NO_EMAIL, false, "payload thiếu email/token"));
            return;
        }
        try {
            mailer.sendResetEmail(email, token);
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
                "Đặt lại mật khẩu — Ecommerce Demo", SendLog.STATUS_SENT, false, null));
        } catch (Exception e) {
            log.error("Gửi email reset mật khẩu lỗi ({}): {}", email, e.toString());
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
