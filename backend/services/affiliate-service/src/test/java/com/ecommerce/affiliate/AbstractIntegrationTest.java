package com.ecommerce.affiliate;

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

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * IT harness base — MỌI integration test của affiliate-service kế thừa class
 * này (pattern copy từ catalog-service SF-4): PG thật qua Testcontainers
 * singleton static-init + JWT keypair IT-generated (decoder đọc PEM — KHÔNG
 * cần identity chạy); subclass mint token {@link #mintToken(String, String)}
 * với sub/role tùy ý.
 *
 * <p><strong>Container SINGLETON per JVM</strong> (không {@code @Container}):
 * Spring TestContext cache key KHÔNG tính {@code @DynamicPropertySource} —
 * container per-class chết làm context cache dùng chung JDBC URL chết (bài
 * học đã ghi trong catalog/AbstractIntegrationTest). Relay + listener AMQP
 * tắt mặc định qua @TestPropertySource — IT consumer (RabbitMQ container)
 * override qua @DynamicPropertySource (dynamic THẮNG base).</p>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    "outbox.relay.enabled=false",
    "spring.rabbitmq.listener.simple.auto-startup=false"
})
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_affiliate")
        .withUsername("postgres")
        .withPassword("postgres");

    /** Keypair dùng chung cho JWT trong IT — subclass mint token bằng private key này. */
    static final KeyPair JWT_KEY_PAIR;

    static {
        POSTGRES.start();
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            JWT_KEY_PAIR = generator.generateKeyPair();
            Path keyDir = Path.of("target", "it-keys");
            Files.createDirectories(keyDir);
            writePem(keyDir.resolve("jwt-public.pem"), "PUBLIC KEY", JWT_KEY_PAIR.getPublic().getEncoded());
            writePem(keyDir.resolve("jwt-private.pem"), "PRIVATE KEY", JWT_KEY_PAIR.getPrivate().getEncoded());
        } catch (GeneralSecurityException | IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @LocalServerPort
    int port;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // IT chỉ dựng PG — rabbit health indicator (starter-amqp) sẽ kéo health
        // DOWN nếu không tắt; service thật chạy cùng compose RabbitMQ nên không cần.
        registry.add("management.health.rabbit.enabled", () -> "false");
        // Decoder đọc PEM IT-generated — CWD surefire = module dir (deterministic).
        registry.add("JWT_PUBLIC_KEY_PATH", () -> "target/it-keys/jwt-public.pem");
    }

    /**
     * Mint JWT RS256 với sub + roles[] chỉ định (khớp token identity SF-3 —
     * claim {@code roles[]} array) ký bằng keypair IT.
     */
    protected static String mintToken(String subject, String role) {
        try {
            String header = b64url("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            long now = Instant.now().getEpochSecond();
            String payload = b64url(("{\"sub\":\"" + subject + "\",\"roles\":[\"" + role + "\"],\"iat\":" + now
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
