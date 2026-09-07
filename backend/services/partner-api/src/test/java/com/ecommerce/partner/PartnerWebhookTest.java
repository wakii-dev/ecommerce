package com.ecommerce.partner;

import com.ecommerce.partner.domain.DeliveryStatus;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.domain.PartnerOrderRefEntity;
import com.ecommerce.partner.domain.WebhookDeliveryEntity;
import com.ecommerce.partner.repo.PartnerOrderRefRepository;
import com.ecommerce.partner.repo.PartnerRepository;
import com.ecommerce.partner.repo.WebhookDeliveryRepository;
import com.ecommerce.partner.webhook.HmacSigner;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 5 — webhook HMAC delivery END-TO-END trong test JVM: RabbitMQ thật +
 * scheduler thật (200ms) + receiver = WireMock. ACCEPTANCE: "đơn đổi trạng
 * thái → receiver nhận POST với X-Signature HMAC đúng secret".
 */
class PartnerWebhookTest extends AbstractPartnerApiTest {

    static final String RECEIVER_PATH = "/partner-receiver";

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private PartnerRepository partners;

    @Autowired
    private PartnerOrderRefRepository refs;

    @Autowired
    private WebhookDeliveryRepository deliveries;

    private PartnerEntity partner;
    private UUID orderId;
    private String secret;

    @BeforeEach
    void setup() {
        WIRE.resetAll();
        secret = "whsec-" + System.nanoTime();
        partner = new PartnerEntity();
        partner.setName("WH-IT-" + System.nanoTime());
        partner.setWebhookSecret(secret);
        partner.setWebhookUrl(WIRE.baseUrl() + RECEIVER_PATH);
        partner = partners.save(partner);
        orderId = UUID.randomUUID();
        PartnerOrderRefEntity ref = new PartnerOrderRefEntity();
        ref.setPartnerId(partner.getId());
        ref.setPartnerRef("wh-ref-" + System.nanoTime());
        ref.setOrderId(orderId);
        refs.save(ref);

        WIRE.stubFor(post(urlEqualTo(RECEIVER_PATH))
            .willReturn(aResponse().withStatus(200)));
    }

    @AfterEach
    void reset() {
        WIRE.resetAll();
    }

    private void publish(String eventType, UUID eventId) {
        String payload = eventType.equals("order.created")
            ? """
            {"orderId": "%s", "userId": "%s", "status": "PENDING", "total": 100000,
             "createdAt": "2026-09-07T03:00:00Z"}
            """.formatted(orderId, UUID.randomUUID())
            : """
            {"orderId": "%s", "paymentIntentId": "pi_x", "paidAt": "2026-09-07T03:00:00Z"}
            """.formatted(orderId);
        String envelope = """
            {"eventId": "%s", "eventType": "%s", "occurredAt": "2026-09-07T03:00:00.123456Z",
             "correlationId": "req-it", "producer": "ordering-service", "schemaVersion": 1,
             "payload": %s}
            """.formatted(eventId, eventType, payload.strip());
        // Publish RAW bytes (producer thật — OutboxRelay — gửi JSON object bytes;
        // convertAndSend(String) sẽ bị Jackson converter double-encode thành quoted string)
        org.springframework.amqp.core.MessageProperties props = new org.springframework.amqp.core.MessageProperties();
        props.setContentType("application/json");
        rabbitTemplate.send("ecommerce.events", eventType,
            new org.springframework.amqp.core.Message(envelope.getBytes(java.nio.charset.StandardCharsets.UTF_8), props));
    }

    private void awaitReceived(int count) {
        Awaitility.await().atMost(Duration.ofSeconds(10)).pollInterval(Duration.ofMillis(100))
            .untilAsserted(() -> WIRE.verify(count,
                postRequestedFor(urlEqualTo(RECEIVER_PATH))));
    }

    @Test
    void orderEvent_deliversHmacSignedPost() {
        publish("order.paid", UUID.randomUUID());
        awaitReceived(1);

        // signature KHỚP HMAC(secret, raw body thật đã gửi)
        List<com.github.tomakehurst.wiremock.verification.LoggedRequest> received =
            WIRE.findRequestsMatching(com.github.tomakehurst.wiremock.matching.RequestPattern.everything())
                .getRequests();
        String rawBody = received.get(0).getBodyAsString();
        String signature = received.get(0).getHeader("X-Signature");
        assertThat(signature).isNotNull();
        assertThat(HmacSigner.verify(secret, rawBody, signature)).isTrue();

        // body theo contract PartnerOrderChangedEvent
        assertThat(rawBody).contains("\"status\":\"PAID\"").contains("\"orderId\":\"" + orderId);
        // delivery DELIVERED trong DB
        Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
            assertThat(deliveries.findAll()).anySatisfy(d -> {
                assertThat(d.getDeliveryStatus()).isEqualTo(DeliveryStatus.DELIVERED);
                assertThat(d.getOrderStatus()).isEqualTo("PAID");
            }));
    }

    @Test
    void orderNotFromPartner_noDelivery() {
        // đơn KHÔNG trong partner_order_refs (đơn customer thường) → bỏ qua.
        //
        // FI-366 SF-1 (BUG-06): helper publish() đặt payload.orderId = field
        // `orderId` CỦA TEST NÀY (đã ref ở @BeforeEach) — tham số thứ 2 là
        // eventId, KHÔNG phải orderId → bản cũ publish đơn ĐÃ ref rồi expect 0
        // delivery = mâu thuẫn thiết kế (deliver là ĐÚNG; fail theo method
        // order kèm retry bleed của test 500). Publish thẳng envelope với
        // payload.orderId = UUID lạ (chưa ref) → consumer bỏ qua thật.
        UUID unknownOrder = UUID.randomUUID();
        String envelope = """
            {"eventId": "%s", "eventType": "order.paid", "occurredAt": "2026-09-07T03:00:00.123456Z",
             "correlationId": "req-it", "producer": "ordering-service", "schemaVersion": 1,
             "payload": {"orderId": "%s", "paymentIntentId": "pi_x", "paidAt": "2026-09-07T03:00:00Z"}}
            """.formatted(UUID.randomUUID(), unknownOrder);
        org.springframework.amqp.core.MessageProperties props = new org.springframework.amqp.core.MessageProperties();
        props.setContentType("application/json");
        rabbitTemplate.send("ecommerce.events", "order.paid",
            new org.springframework.amqp.core.Message(envelope.getBytes(java.nio.charset.StandardCharsets.UTF_8), props));

        // scope theo unknownOrder (chống bleed retry test 500 chạy trước)
        Awaitility.await().during(Duration.ofSeconds(2)).atMost(Duration.ofSeconds(5))
            .untilAsserted(() -> WIRE.verify(0, postRequestedFor(urlEqualTo(RECEIVER_PATH))
                .withRequestBody(com.github.tomakehurst.wiremock.client.WireMock.containing(unknownOrder.toString()))));
    }

    @Test
    void receiverAlwaysFails_deliveryGoesDeadAfterMaxAttempts() {
        WIRE.resetAll(); // bỏ stub 200
        WIRE.stubFor(post(urlEqualTo(RECEIVER_PATH))
            .willReturn(aResponse().withStatus(500)));

        publish("order.created", UUID.randomUUID());
        Awaitility.await().atMost(Duration.ofSeconds(15)).pollInterval(Duration.ofMillis(200))
            .untilAsserted(() -> assertThat(deliveries.findAll())
                .anySatisfy(d -> assertThat(d.getDeliveryStatus()).isEqualTo(DeliveryStatus.DEAD)));

        // đúng max attempts (3) + đã ghi last_error
        assertThat(deliveries.findAll()).anySatisfy(d -> {
            assertThat(d.getAttempts()).isEqualTo(3);
            assertThat(d.getLastError()).isNotBlank();
        });
    }

    @Test
    void suspendedPartner_noDelivery() {
        partner.setStatus(com.ecommerce.partner.domain.PartnerStatus.SUSPENDED);
        partners.save(partner);
        UUID suspendedOrder = UUID.randomUUID();
        publish("order.confirmed", suspendedOrder);

        // BUG-06: scope theo orderId (đồng lí do orderNotFromPartner_noDelivery)
        Awaitility.await().during(Duration.ofSeconds(2)).atMost(Duration.ofSeconds(5))
            .untilAsserted(() -> WIRE.verify(0, postRequestedFor(urlEqualTo(RECEIVER_PATH))
                .withRequestBody(com.github.tomakehurst.wiremock.client.WireMock.containing(suspendedOrder.toString()))));
    }

    @Test
    void unknownOrderEventType_skippedWithoutMarker() {
        // order.* lạ (GAP-4 amendment tương lai) — consumer WARN + skip, không POST
        String envelope = """
            {"eventId": "%s", "eventType": "order.shipped", "occurredAt": "2026-09-07T03:00:00Z",
             "correlationId": "r", "producer": "ordering-service", "schemaVersion": 1,
             "payload": {"orderId": "%s"}}
            """.formatted(UUID.randomUUID(), orderId);
        org.springframework.amqp.core.MessageProperties props = new org.springframework.amqp.core.MessageProperties();
        props.setContentType("application/json");
        rabbitTemplate.send("ecommerce.events", "order.shipped",
            new org.springframework.amqp.core.Message(envelope.getBytes(java.nio.charset.StandardCharsets.UTF_8), props));

        Awaitility.await().during(Duration.ofSeconds(2)).atMost(Duration.ofSeconds(5))
            .untilAsserted(() -> WIRE.verify(0, postRequestedFor(urlEqualTo(RECEIVER_PATH))
                .withRequestBody(com.github.tomakehurst.wiremock.client.WireMock.containing(orderId.toString()))));
        // KHÔNG tạo delivery cho orderId của test này (bảng chung — filter theo orderId)
        assertThat(deliveries.findAll().stream()
            .filter(d -> d.getOrderId().equals(orderId)).count()).isZero();
    }

    @Test
    void duplicateEvent_deliveredOnce() {
        UUID eventId = UUID.randomUUID();
        publish("order.paid", eventId);
        publish("order.paid", eventId); // same eventId — marker chặn
        awaitReceived(1);
        Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
            assertThat(deliveries.findAll().stream()
                .filter(d -> d.getEventId().equals(eventId)).count()).isEqualTo(1));
    }
}
