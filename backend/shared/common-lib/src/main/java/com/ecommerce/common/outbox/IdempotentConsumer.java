package com.ecommerce.common.outbox;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
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
 *
 * <p>{@code REQUIRES_NEW}: INSERT trùng làm Postgres ABORT transaction hiện tại
 * — nếu chạy trong tx của caller, mọi business-write trước đó sẽ rollback câm.
 * Tách tx riêng để race chỉ hủy đúng lệnh bookkeeping này. Cần bảng
 * {@code processed_messages} (migration V1, PG) — service Redis-only tự dedupe
 * bằng operation tự nhiên idempotent thay vì class này.</p>
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
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean tryConsume(String messageId) {
        if (repository.existsById(messageId)) {
            return false;
        }
        try {
            repository.save(new ProcessedMessage(messageId));
            return true;
        } catch (DataIntegrityViolationException e) {
            // race giữa 2 consumer — thua → bỏ qua (tx riêng, không hại caller)
            return false;
        }
    }
}
