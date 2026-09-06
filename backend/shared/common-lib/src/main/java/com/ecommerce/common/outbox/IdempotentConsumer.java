package com.ecommerce.common.outbox;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Idempotent consume cho event at-least-once: {@code tryConsume(eventId)} trả
 * true CHỈ cho consumer đầu tiên ghi được row vào {@code processed_messages}.
 *
 * <p><strong>Implementation notes (2 bug đã sửa — đừng quay lại):</strong></p>
 * <ul>
 *   <li>Native {@code INSERT ... ON CONFLICT DO NOTHING} — thực thi NGAY và
 *       trả rowcount (không như {@code em.persist()} defer INSERT tới commit,
 *       khiến catch DataIntegrityViolation trong method thành dead-code);
 *       conflict KHÔNG abort transaction.</li>
 *   <li>{@code MANDATORY} — marker PHẢI cùng transaction với business logic:
 *       business rollback = marker rollback. (REQUIRES_NEW sẽ tạo "ghost
 *       commit": marker còn sau rollback → event gửi lại bị skip → mất event.)
 *       Nếu không có tx → exception ngay, bắt caller sửa đúng.</li>
 * </ul>
 *
 * <p>Pattern dùng trong {@code @RabbitListener}:</p>
 *
 * <pre>{@code
 * @Transactional
 * @RabbitListener(queues = "...")
 * public void on(EventEnvelope envelope) {
 *     if (!idempotentConsumer.tryConsume(envelope.eventId().toString())) return;
 *     // ... business logic — cùng transaction với marker
 * }
 * }</pre>
 */
@Component
public class IdempotentConsumer {

    private final ProcessedMessageRepository repository;

    public IdempotentConsumer(ProcessedMessageRepository repository) {
        this.repository = repository;
    }

    /**
     * @return true nếu message CHƯA xử lý (consumer chạy business logic trong
     *         CÙNG transaction này); false nếu đã xử lý hoặc consumer khác
     *         đang giữ.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean tryConsume(String messageId) {
        return repository.insertIgnore(messageId) == 1;
    }
}
