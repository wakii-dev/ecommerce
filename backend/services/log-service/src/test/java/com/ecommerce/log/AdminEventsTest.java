package com.ecommerce.log;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.ecommerce.log.domain.EventLogDocument;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * IT audit log viewer (SF-13 A5 — Task 6): filter eventType + from/to (biên
 * inclusive), sort occurredAt DESC, paginate 50/page, guard 401/403/ADMIN,
 * bad from → 400. Docs chèn TRỰC TIẾP MongoTemplate (consumer có IT riêng —
 * EventLogConsumerTest). JWT mint PEM pattern catalog.
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminEventsTest {

    static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7");

    static final KeyPair JWT_KEY_PAIR;
    static final ObjectMapper OM = new ObjectMapper();

    static {
        MONGO.start();
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            JWT_KEY_PAIR = generator.generateKeyPair();
            Path keyDir = Path.of("target", "it-keys");
            Files.createDirectories(keyDir);
            writePem(keyDir.resolve("jwt-public.pem"), "PUBLIC KEY", JWT_KEY_PAIR.getPublic().getEncoded());
        } catch (GeneralSecurityException | IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.data.mongodb.uri", () -> MONGO.getReplicaSetUrl("db_log"));
        registry.add("spring.data.mongodb.database", () -> "db_log");
        registry.add("spring.rabbitmq.host", () -> "localhost");
        registry.add("spring.rabbitmq.port", () -> "1");
        registry.add("management.health.rabbit.enabled", () -> "false");
        registry.add("JWT_PUBLIC_KEY_PATH", () -> "target/it-keys/jwt-public.pem");
    }

    @Autowired
    MongoTemplate mongo;
    @Autowired
    TestRestTemplate http;

    @BeforeEach
    void cleanAndSeed() {
        mongo.remove(new Query(), EventLogDocument.class);
        Instant base = Instant.parse("2026-09-07T00:00:00Z");
        insert(UUID.randomUUID(), "order.confirmed", base);              // cũ nhất
        insert(UUID.randomUUID(), "user.created", base.plusSeconds(30)); // giữa
        insert(UUID.randomUUID(), "order.confirmed", base.plusSeconds(60)); // mới nhất
    }

    private void insert(UUID eventId, String eventType, Instant occurredAt) {
        ObjectNode payload = OM.createObjectNode().put("orderId", UUID.randomUUID().toString());
        mongo.save(EventLogDocument.of(eventId, eventType, eventType, occurredAt,
            "corr-" + eventId, payload));
    }

    @Test
    void filterEventType_sortDesc_total() throws Exception {
        JsonNode json = OM.readTree(call("/api/log/admin/events?eventType=order.confirmed", "ADMIN").getBody());
        assertThat(json.path("total").asLong()).isEqualTo(2);
        assertThat(json.path("items").size()).isEqualTo(2);
        // sort occurredAt DESC — item đầu = event mới nhất
        assertThat(json.path("items").get(0).path("occurredAt").asText())
            .isEqualTo("2026-09-07T00:01:00Z");
        assertThat(json.path("size").asInt()).isEqualTo(50);
        assertThat(json.path("page").asInt()).isEqualTo(1);
        // payload giữ nguyên JSON
        assertThat(json.path("items").get(0).path("payload").path("orderId").asText()).isNotEmpty();
    }

    @Test
    void fromToFilter_inclusiveBounds() throws Exception {
        // from = 00:00:30 (biên INCLUSIVE — bắt đúng user.created 00:00:30)
        JsonNode json = OM.readTree(call(
            "/api/log/admin/events?from=2026-09-07T00:00:30Z&to=2026-09-07T00:00:30Z", "ADMIN").getBody());
        assertThat(json.path("total").asLong()).isEqualTo(1);
        assertThat(json.path("items").get(0).path("eventType").asText()).isEqualTo("user.created");

        JsonNode window = OM.readTree(call(
            "/api/log/admin/events?from=2026-09-07T00:00:30Z&to=2026-09-07T00:01:00Z", "ADMIN").getBody());
        assertThat(window.path("total").asLong()).isEqualTo(2);
    }

    @Test
    void pagination_page2_empty() throws Exception {
        JsonNode page2 = OM.readTree(call("/api/log/admin/events?page=2", "ADMIN").getBody());
        assertThat(page2.path("page").asInt()).isEqualTo(2);
        assertThat(page2.path("items").size()).isEqualTo(0);
        assertThat(page2.path("total").asLong()).isEqualTo(3);
    }

    @Test
    void badFrom_400_problemJson() {
        ResponseEntity<String> res = call("/api/log/admin/events?from=khong-phai-ngay", "ADMIN");
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void anonymous401_customer403_admin200() {
        assertThat(call("/api/log/admin/events", null).getStatusCode().value()).isEqualTo(401);
        assertThat(call("/api/log/admin/events", "CUSTOMER").getStatusCode().value()).isEqualTo(403);
        assertThat(call("/api/log/admin/events", "ADMIN").getStatusCode().value()).isEqualTo(200);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private ResponseEntity<String> call(String path, String role) {
        HttpHeaders headers = new HttpHeaders();
        if (role != null) {
            headers.setBearerAuth(mintToken(role));
        }
        return http.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    protected static String mintToken(String role) {
        try {
            String header = b64url("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            long now = Instant.now().getEpochSecond();
            String payload = b64url(("{\"sub\":\"it-admin\",\"roles\":[\"" + role + "\"],\"iat\":" + now
                + ",\"exp\":" + (now + 3600) + "}").getBytes(StandardCharsets.UTF_8));
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(JWT_KEY_PAIR.getPrivate());
            signer.update((header + "." + payload).getBytes(StandardCharsets.US_ASCII));
            return header + "." + payload + "." + b64url(signer.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("mint token fail", e);
        }
    }

    private static void writePem(Path path, String label, byte[] der) throws IOException {
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(der);
        Files.writeString(path, "-----BEGIN " + label + "-----\n" + base64 + "\n-----END " + label + "-----\n");
    }

    private static String b64url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
