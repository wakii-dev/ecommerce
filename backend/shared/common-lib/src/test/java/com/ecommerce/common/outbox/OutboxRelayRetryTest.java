package com.ecommerce.common.outbox;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpConnectException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Retry semantics của relay (unit, mock): lỗi HẠ TẦNG (connect) giữ PENDING
 * không đốt attempts; lỗi THEO-MESSAGE đốt attempts → FAILED tại cap.
 */
class OutboxRelayRetryTest {

    private OutboxMessageRepository repository;
    private RabbitTemplate rabbitTemplate;
    private OutboxRelay relay;

    @BeforeEach
    void setUp() {
        repository = mock(OutboxMessageRepository.class);
        rabbitTemplate = mock(RabbitTemplate.class);
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        relay = new OutboxRelay(repository, rabbitTemplate, "ecommerce.events",
            3, 10, 60_000L, true);
    }

    private OutboxMessage pendingMessage() {
        return OutboxMessage.pending("order.confirmed", "{\"eventId\":\"e1\"}", "req-1");
    }

    @Test
    void connectFailureKeepsPendingAndDoesNotBurnAttempts() {
        OutboxMessage message = pendingMessage();
        doThrow(new AmqpConnectException(new java.net.ConnectException("refused")))
            .when(rabbitTemplate).send(anyString(), anyString(), any());

        relay.relayOne(message);

        assertThat(message.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(message.getAttempts()).isZero();
        assertThat(message.getSentAt()).isNull();
    }

    @Test
    void connectFailurePausesSubsequentPolls() {
        doThrow(new AmqpConnectException(new java.net.ConnectException("refused")))
            .when(rabbitTemplate).send(anyString(), anyString(), any());
        relay.relayOne(pendingMessage());

        relay.poll(); // đang trong cửa sổ backoff (60s) — không được query DB

        verify(repository, never()).findByStatusOrderByIdAsc(any(), any());
    }

    @Test
    void messageSpecificFailureRetriesThenMarksFailedAtCap() {
        OutboxMessage message = pendingMessage();
        doThrow(new RuntimeException("message rejected: quota"))
            .when(rabbitTemplate).send(anyString(), anyString(), any());

        relay.relayOne(message);
        assertThat(message.getStatus()).isEqualTo(OutboxStatus.PENDING);
        assertThat(message.getAttempts()).isEqualTo(1);

        relay.relayOne(message);
        relay.relayOne(message); // attempts = 3 = cap

        assertThat(message.getStatus()).isEqualTo(OutboxStatus.FAILED);
        assertThat(message.getAttempts()).isEqualTo(3);
        assertThat(message.getLastError()).contains("quota");
        verify(repository, times(3)).save(message);
    }

    @Test
    void successMarksSentWithEnvelopeBodyPreserved() {
        OutboxMessage message = OutboxMessage.pending(
            "order.confirmed", "{\"eventId\":\"e1\",\"payload\":{\"total\":1}}", "req-9");

        relay.relayOne(message);

        assertThat(message.getStatus()).isEqualTo(OutboxStatus.SENT);
        assertThat(message.getSentAt()).isNotNull();
        verify(rabbitTemplate).send(anyString(), anyString(), any());
    }
}
