package com.ecommerce.inventory;

import com.ecommerce.common.event.EventEnvelope;
import com.ecommerce.inventory.service.InventorySweeper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.utility.DockerImageName;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * IT consumers + TTL sweeper (plan T4 — spec §4.5/§4.6, §7 case 2-3):
 * order.paid → COMMITTED + event; order.cancelled → RELEASED + hoàn stock;
 * re-delivery không double; sweep-vs-consumer race; poison message reject.
 * Publish ĐÚNG wire format relay (JSON body + contentType) qua exchange thật.
 */
class InventoryEventsTest extends AbstractIntegrationTest {

    private static final RabbitMQContainer RABBIT = new RabbitMQContainer(
        DockerImageName.parse("rabbitmq:3-management"));

    static {
        RABBIT.start();
    }

    @DynamicPropertySource
    static void rabbitProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBIT::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBIT::getAdminPassword);
    }

    @Autowired
    RabbitTemplate rabbitTemplate;

    @Autowired
    RabbitAdmin rabbitAdmin;

    @Autowired
    ObjectMapper objectMapper;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    InventorySweeper sweeper;

    private static final AtomicInteger SEQ = new AtomicInteger();

    private String seedStock(int quantity) {
        String variantId = "var-t4-" + SEQ.incrementAndGet();
        jdbc.update("INSERT INTO stocks (variant_id, quantity) VALUES (?, ?)", variantId, quantity);
        return variantId;
    }

    private UUID seedReservation(String variantId, int qty, String orderId, boolean expired) {
        UUID id = UUID.randomUUID();
        String expiry = expired ? "now() - interval '1 minute'" : "now() + interval '20 minutes'";
        jdbc.update("""
                INSERT INTO reservations (id, order_id, status, expires_at, items)
                VALUES (?::uuid, ?, 'RESERVED', """ + expiry + ", ?::jsonb)",
            id, orderId, "[{\"variant_id\":\"" + variantId + "\",\"qty\":" + qty + "}]");
        return id;
    }

    /** Publish envelope với wire format như OutboxRelay (JSON body, contentType json). */
    private void publish(String eventType, String eventId, String orderId) throws Exception {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("orderId", orderId);
        payload.put("paymentIntentId", "pi_test");
        payload.put("paidAt", Instant.now().toString());
        EventEnvelope envelope = new EventEnvelope(
            UUID.fromString(eventId), eventType, Instant.now(), "corr-" + orderId,
            "inventory-service", EventEnvelope.CURRENT_SCHEMA_VERSION, payload);
        byte[] body = objectMapper.writeValueAsBytes(envelope);
        MessageProperties props = new MessageProperties();
        props.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        rabbitTemplate.send("ecommerce.events", eventType, new Message(body, props));
    }

    private int stockOf(String variantId) {
        return jdbc.queryForObject("SELECT quantity FROM stocks WHERE variant_id = ?", Integer.class, variantId);
    }

    private long outboxCount(String eventType) {
        return jdbc.queryForObject("SELECT count(*) FROM outbox WHERE event_type = ?", Long.class, eventType);
    }

    @Test
    void orderPaidCommitsReservationAndEmitsCommittedEvent() throws Exception {
        String variant = seedStock(10);
        String orderId = "o-paid-" + SEQ.incrementAndGet();
        UUID reservationId = seedReservation(variant, 4, orderId, false);
        long committedBefore = outboxCount("inventory.committed");

        publish("order.paid", UUID.randomUUID().toString(), orderId);

        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> {
            assertThat(jdbc.queryForObject(
                "SELECT status FROM reservations WHERE id = ?::uuid", String.class, reservationId))
                .isEqualTo("COMMITTED");
        });
        // stock GIỮ NGUYÊN khi commit (đã trừ từ lúc reserve — "trừ vĩnh viễn")
        assertThat(stockOf(variant)).isEqualTo(10);
        // event outbox — payload CAMEL keys (schema), envelope 5-field
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
            assertThat(outboxCount("inventory.committed")).isEqualTo(committedBefore + 1));
        String payloadJson = jdbc.queryForObject(
            "SELECT payload FROM outbox WHERE event_type = 'inventory.committed' ORDER BY created_at DESC LIMIT 1",
            String.class);
        var payload = objectMapper.readTree(payloadJson);
        assertThat(payload.path("eventType").asText()).isEqualTo("inventory.committed");
        assertThat(payload.path("eventId").asText()).as("envelope 5-field: eventId UUID").isNotBlank();
        assertThat(payload.path("correlationId").asText()).isEqualTo("corr-" + orderId);
        assertThat(payload.path("payload").path("items").get(0).has("variantId"))
            .as("items[0].variantId CAMEL (schema freeze)").isTrue();
        assertThat(payload.path("payload").path("items").get(0).has("variant_id"))
            .as("items[0].variant_id SNAKE phải remap hết").isFalse();
    }

    @Test
    void redeliverySameEventIdDoesNotDoubleProcess() throws Exception {
        String variant = seedStock(10);
        String orderId = "o-replay-" + SEQ.incrementAndGet();
        UUID reservationId = seedReservation(variant, 4, orderId, false);
        String eventId = UUID.randomUUID().toString();

        publish("order.paid", eventId, orderId);
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
            assertThat(jdbc.queryForObject(
                "SELECT status FROM reservations WHERE id = ?::uuid", String.class, reservationId))
                .isEqualTo("COMMITTED"));
        long committedAfterFirst = outboxCount("inventory.committed");

        publish("order.paid", eventId, orderId); // re-delivery CÙNG eventId
        Thread.sleep(1000);

        assertThat(outboxCount("inventory.committed"))
            .as("re-delivery không emit event lần 2").isEqualTo(committedAfterFirst);
    }

    @Test
    void orderCancelledReleasesReservationAndRestocks() throws Exception {
        String variant = seedStock(10);
        String orderId = "o-cancel-" + SEQ.incrementAndGet();
        UUID reservationId = seedReservation(variant, 4, orderId, false);

        long releasedBefore = outboxCount("inventory.released");
        publish("order.cancelled", UUID.randomUUID().toString(), orderId);

        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> {
            assertThat(jdbc.queryForObject(
                "SELECT status FROM reservations WHERE id = ?::uuid", String.class, reservationId))
                .isEqualTo("RELEASED");
        });
        assertThat(stockOf(variant)).as("release hoàn 4").isEqualTo(14);
        assertThat(outboxCount("inventory.released")).isEqualTo(releasedBefore + 1);
    }

    @Test
    void sweeperReleasesExpiredReservationRestocksAndEmits() {
        String variant = seedStock(10);
        String orderId = "o-ttl-" + SEQ.incrementAndGet();
        UUID reservationId = seedReservation(variant, 4, orderId, true);
        long releasedBefore = outboxCount("inventory.released");

        sweeper.releaseExpired(); // gọi thẳng — deterministic, không sleep

        assertThat(jdbc.queryForObject(
            "SELECT status FROM reservations WHERE id = ?::uuid", String.class, reservationId))
            .isEqualTo("RELEASED");
        assertThat(stockOf(variant)).as("TTL release hoàn 4").isEqualTo(14);
        assertThat(outboxCount("inventory.released")).isEqualTo(releasedBefore + 1);
    }

    @Test
    void paidAfterSweptReleaseIsNoOpNoPhantomRestock() throws Exception {
        String variant = seedStock(10);
        String orderId = "o-race-" + SEQ.incrementAndGet();
        UUID reservationId = seedReservation(variant, 4, orderId, true);
        long releasedBefore = outboxCount("inventory.released");
        long committedBefore = outboxCount("inventory.committed");

        sweeper.releaseExpired(); // sweep thắng — release + hoàn 4
        assertThat(stockOf(variant)).isEqualTo(14);
        long releasedAfterSweep = outboxCount("inventory.released");
        assertThat(releasedAfterSweep).isEqualTo(releasedBefore + 1);

        publish("order.paid", UUID.randomUUID().toString(), orderId); // consumer tới sau
        Thread.sleep(1500);

        assertThat(jdbc.queryForObject(
            "SELECT status FROM reservations WHERE id = ?::uuid", String.class, reservationId))
            .as("đơn đã release bởi sweep — order.paid không resurrect thành COMMITTED")
            .isEqualTo("RELEASED");
        assertThat(stockOf(variant)).as("KHÔNG hoàn stock lần 2 (phantom restock)").isEqualTo(14);
        assertThat(outboxCount("inventory.committed")).as("không emit committed").isEqualTo(committedBefore);
        assertThat(outboxCount("inventory.released")).isEqualTo(releasedAfterSweep);
    }

    @Test
    void poisonMessageIsRejectedWithoutRequeueStorm() throws Exception {
        Integer queueDepthBefore = queueDepth();
        Message poison = new Message("this-is-not-json".getBytes(StandardCharsets.UTF_8), new MessageProperties());
        rabbitTemplate.send("ecommerce.events", "order.paid", poison);

        await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
            assertThat(queueDepth()).as("poison bị reject, không requeue vô hạn").isLessThanOrEqualTo(queueDepthBefore));
    }

    private int queueDepth() {
        java.util.Properties props = rabbitAdmin.getQueueProperties("inventory.orders");
        if (props == null) {
            return 0;
        }
        Object count = props.get(RabbitAdmin.QUEUE_MESSAGE_COUNT);
        return count instanceof Integer i ? i : 0;
    }
}
