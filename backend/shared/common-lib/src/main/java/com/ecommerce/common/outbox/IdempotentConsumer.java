package com.ecommerce.common.outbox;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Idempotent consume cho event at-least-once: {@code tryConsume(eventId)} trả
 * true CHỈ cho consumer đầu tiên ghi được row vào {@code processed_messages}
 * (PK trùng → false). Pattern dùng trong @RabbitListener:
 *
 * <pre>{@code
 * if (!idempotentConsumer.tryConsume(eventId)) return;
 * // ... business logic trong cùng transaction
 * }</pre>
 */
@Component
public class IdempotentConsumer {

    private final ProcessedMessageRepository repository;

    public IdempotentConsumer(ProcessedMessageRepository repository) {
        this.repository = repository;
    }

    /**
     * @return true nếu message CHƯA xử lý (consumer được phép chạy business
     *         logic); false nếu đã xử lý hoặc đang xử lý ở transaction khác.
     */
    @Transactional
    public boolean tryConsume(String messageId) {
        if (repository.existsById(messageId)) {
            return false;
        }
        try {
            repository.save(new ProcessedMessage(messageId));
            return true;
        } catch (DataIntegrityViolationException e) {
            // race giữa 2 consumer — thua → bỏ qua
            return false;
        }
    }
}
