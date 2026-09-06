package com.ecommerce.cart;

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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;

/**
 * IT harness cart-service (SF-6) — pattern catalog AbstractIntegrationTest:
 * <ul>
 *   <li>Redis Testcontainers SINGLETON static (KHÔNG @Container per-class —
 *       context cache dùng chung resource của class đầu, container chết = class
 *       sau rơi vào bean chết).</li>
 *   <li>WireMock catalog + inventory SINGLETON — enrichment test stub theo
 *       từng case; base-url inject qua @DynamicPropertySource (context chung).</li>
 *   <li>JWT: keypair/JVM sinh PEM target/it-keys — mintToken(sub) ký đúng key.</li>
 * </ul>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
    // relay/listener không tồn tại ở cart (không amqp) — đặt thôi cho nhất quán
    "outbox.relay.enabled=false"
})
public abstract class AbstractCartIntegrationTest {

    @SuppressWarnings("resource")
    static final GenericContainer<?> REDIS =
        new GenericContainer<>(DockerImageName.parse("redis:7")).withExposedPorts(6379);

    static final WireMockServer CATALOG_WIREMOCK =
        new WireMockServer(WireMockConfiguration.options().dynamicPort());
    static final WireMockServer INVENTORY_WIREMOCK =
        new WireMockServer(WireMockConfiguration.options().dynamicPort());

    /** Keypair dùng chung JWT IT — mintToken(sub) ký bằng private key này. */
    static final KeyPair JWT_KEY_PAIR;

    static {
        REDIS.start();
        CATALOG_WIREMOCK.start();
        INVENTORY_WIREMOCK.start();
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

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        registry.add("cart.catalog-base-url",
            () -> "http://localhost:" + CATALOG_WIREMOCK.port());
        registry.add("cart.inventory-base-url",
            () -> "http://localhost:" + INVENTORY_WIREMOCK.port());
        registry.add("JWT_PUBLIC_KEY_PATH", () -> "target/it-keys/jwt-public.pem");
        registry.add("management.health.redis.enabled", () -> "false");
    }

    /** Mint JWT RS256 sub tùy ý ký bằng keypair IT. */
    protected static String mintToken(String sub) {
        try {
            String header = b64url("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            long now = Instant.now().getEpochSecond();
            String payload = b64url(("{\"sub\":\"" + sub + "\",\"roles\":[\"CUSTOMER\"],\"iat\":" + now
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
