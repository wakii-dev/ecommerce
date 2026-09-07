package com.ecommerce.notification.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.common.outbox.IdempotentConsumer;
import com.ecommerce.notification.config.RabbitMqConfig;
import com.ecommerce.notification.domain.SendLog;
import com.ecommerce.notification.repo.SendLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumer nhóm review (SF-10): queue {@code notification.reviews} ←
 * review.moderated — email kết quả duyệt CHỈ khi payload có email (pack:
 * "nếu payload có email; thiếu → skip log"). Schema hiện KHÔNG có field email
 * (reviewId/productId/userId/status/rating/moderatedAt) → mọi event hiện tại
 * ghi send-log SKIPPED_NO_EMAIL; khi contracts amendment thêm email thì
 * consumer tự gửi (code check sẵn).
 */
@Component
public class NotificationReviewConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationReviewConsumer.class);

    private final IdempotentConsumer idempotentConsumer;
    private final SendLogRepository sendLog;

    public NotificationReviewConsumer(IdempotentConsumer idempotentConsumer, SendLogRepository sendLog) {
        this.idempotentConsumer = idempotentConsumer;
        this.sendLog = sendLog;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_REVIEWS)
    @Transactional
    public void on(EventEnvelope envelope) {
        if (!"review.moderated".equals(envelope.eventType())) {
            log.warn("Queue notification.reviews nhận eventType lạ {} — bỏ qua", envelope.eventType());
            return;
        }
        if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) {
            return;
        }
        var payload = envelope.payload();
        String email = payload.path("email").asText(null);
        String reviewId = payload.path("reviewId").asText("?");
        if (email == null || email.isBlank()) {
            log.info("review.moderated {} không có email trong payload — skip email, log thôi", reviewId);
            sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), null,
                null, SendLog.STATUS_SKIPPED_NO_EMAIL, false, "payload không có email"));
            return;
        }
        // Forward-compatible: contracts thêm email → CẦN template + flow gửi
        // THẬT trước khi ghi SENT (ghi SENT khi chưa send = log sai — review P2)
        log.warn("review.moderated {} có email {} nhưng flow gửi chưa implement "
            + "(cần amendment contracts + template)", reviewId, email);
        sendLog.save(new SendLog(envelope.eventId(), envelope.eventType(), email,
            null, SendLog.STATUS_SKIPPED_NO_EMAIL, false,
            "email có trong payload nhưng flow gửi chưa implement"));
    }
}
