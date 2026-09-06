package com.ecommerce.catalog;

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
 * IT harness base — MỌI integration test của catalog-service kế thừa class này.
 * Pattern copy từ template-service: PG thật qua Testcontainers + datasource
 * động; KHÔNG mock repository layer. Tag "integration" để lọc chạy.
 * (ES + Redis containers thêm ở IT cụ thể cần chúng — Task 5/6/7.)
 *
 * <p><strong>Container SINGLETON per JVM</strong> (không {@code @Container}):
 * Spring TestContext cache key KHÔNG tính giá trị {@code @DynamicPropertySource}
 * — các IT class cùng config sẽ DÙNG CHUNG 1 context với JDBC URL của container
 * class ĐẦU TIÊN; khi class đó stop container (@Container per-class), các class
 * sau chọc vào DB chết → Hikari timeout 30s/test. Start 1 lần trong static init
 * → mọi class chia sẻ container + context sống sót hết JVM (Ryuk dọn lúc exit).</p>
 *
 * <p><strong>JWT (Task 8b):</strong> sinh 1 RSA keypair/JVM, ghi PEM vào
 * {@code target/it-keys/} và trỏ {@code JWT_PUBLIC_KEY_PATH} — decoder security
 * boot được ở MỌI IT (surefire chạy CWD = module dir nên path đó deterministic);
 * subclass mint token bằng {@link #mintToken(String)} ký bằng đúng keypair.</p>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
// MỌI IT tự seed qua repository + đếm CHÍNH XÁC → tắt SeedDataRunner mặc định
// (subclass @TestPropertySource thay thế inlined properties — SeedDataRunnerTest bật = true).
// relay + listener AMQP tắt mặc định qua ĐÂY (static) — KHÔNG đặt trong
// @DynamicPropertySource: cùng key thì giá trị dynamic của subclass BỊ BASE GHI ĐÈ
// (đã gặp thật với EsIndexerSearchTest); @DynamicPropertySource thắng
// @TestPropertySource nên subclass chỉ cần registry.add là override được.
@TestPropertySource(properties = {
    "catalog.seed.enabled=false",
    "outbox.relay.enabled=false",
    "spring.rabbitmq.listener.simple.auto-startup=false"
})
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_catalog")
        .withUsername("postgres")
        .withPassword("postgres");

    /** Keypair dùng chung cho JWT trong IT — AdminCatalogIT mint token bằng private key này. */
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
        // IT chỉ dựng PG — rabbit + redis health indicators (starter-amqp /
        // starter-data-redis) sẽ kéo health DOWN nếu không tắt; service thật
        // chạy cùng compose RabbitMQ/Redis nên không cần.
        registry.add("management.health.rabbit.enabled", () -> "false");
        registry.add("management.health.redis.enabled", () -> "false");
        // Security (Task 8b): decoder đọc PEM IT-generated — CWD surefire = module dir.
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
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(der);
        Files.writeString(path, "-----BEGIN " + label + "-----\n" + base64 + "\n-----END " + label + "-----\n");
    }

    private static String b64url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
