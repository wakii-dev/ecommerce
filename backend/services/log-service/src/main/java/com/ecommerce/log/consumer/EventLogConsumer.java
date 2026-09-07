package com.ecommerce.log.consumer;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.log.config.RabbitMqConfig;
import com.ecommerce.log.domain.EventLogDocument;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

/**
 * Fan-in consumer (D14): MỌI event qua queue {@code log.events} → insert
 * document Mongo. Idempotent: unique index eventId — DuplicateKeyException
 * = re-delivery đã ghi → ack bỏ qua (KHÔNG ném ra: ConditionalRejectingErrorHandler
 * sẽ reject event hợp lệ chỉ vì ghi trùng).
 *
 * <p>Poison envelope → conversion fail trước khi vào method → reject không
 * requeue (RabbitMqConfig) — 1 event hỏng không chặn audit trail.</p>
 */
@Component
public class EventLogConsumer {

    private static final Logger log = LoggerFactory.getLogger(EventLogConsumer.class);

    private final MongoTemplate mongo;

    public EventLogConsumer(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @RabbitListener(queues = RabbitMqConfig.QUEUE_EVENTS)
    public void on(EventEnvelope envelope) {
        try {
            mongo.insert(EventLogDocument.of(
                envelope.eventId(),
                envelope.eventType(),
                envelope.eventType(), // routingKey = eventType (OutboxRelay convention)
                envelope.occurredAt(),
                envelope.correlationId(),
                envelope.payload()));
            log.debug("event_log ← {} (eventId={})", envelope.eventType(), envelope.eventId());
        } catch (DuplicateKeyException e) {
            log.debug("event_log re-delivery bỏ qua (eventId={})", envelope.eventId());
        }
    }
}
