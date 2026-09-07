package com.ecommerce.inventory;

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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;

/**
 * IT harness base — MỌI integration test của service kế thừa class này.
 * Pattern: PG thật qua Testcontainers + datasource động; KHÔNG mock repository.
 *
 * <p><strong>Singleton container (static initializer, KHÔNG @Container):</strong>
 * Spring context cache tái sử dụng context giữa các test class — nếu container
 * per-class thì context của class sau trỏ vào container ĐÃ STOP (connection
 * refused, Hikari timeout 30s/test). Start 1 lần trong static block + Ryuk dọn
 * khi JVM exit → mọi class dùng chung container sống.</p>
 *
 * <p><strong>JWT (FI-366 SF-1 T10):</strong> security guard yêu cầu decoder boot
 * được ở MỌI IT — sinh 1 RSA keypair/JVM, ghi PEM {@code target/it-keys/} +
 * {@code JWT_PUBLIC_KEY_PATH}; subclass mint token bằng {@link #mintToken(String)}
 * (pattern copy từ catalog AbstractIntegrationTest).</p>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_inventory")
        .withUsername("postgres")
        .withPassword("postgres")
        .withStartupTimeout(Duration.ofMinutes(3));

    /** Keypair dùng chung cho JWT trong IT — guard tests mint token bằng private key này. */
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
        // Tắt background sweep trong IT (1h) — test gọi sweeper.releaseExpired()
        // TRỰC TIẾP khi cần (deterministic; scheduler ngang test = flaky count).
        registry.add("inventory.reservation.sweep-interval-ms", () -> "3600000");
        // Security guard (T10): decoder đọc PEM IT-generated — CWD surefire = module dir.
        registry.add("JWT_PUBLIC_KEY_PATH", () -> "target/it-keys/jwt-public.pem");
    }

    /** Mint JWT RS256 ({@code roles: [role]}) ký bằng keypair IT — guard tests 401/403/200. */
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
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        Files.writeString(path, "-----BEGIN " + label + "-----\n" + base64 + "\n-----END " + label + "-----\n");
    }

    private static String b64url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
