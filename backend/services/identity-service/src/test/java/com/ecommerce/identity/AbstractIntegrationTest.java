package com.ecommerce.identity;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;

/**
 * IT harness identity — PG thật qua Testcontainers + RSA keypair sinh mỗi lần
 * chạy (viết PEM vào temp dir, trỏ identity.jwt.*-path). Tag "integration".
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_identity")
        .withUsername("postgres")
        .withPassword("postgres");

    @LocalServerPort
    int port;

    static Path privateKeyPath;
    static Path publicKeyPath;

    private static void writeKeys() {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair pair = gen.generateKeyPair();
            RSAPrivateCrtKey priv = (RSAPrivateCrtKey) pair.getPrivate();
            RSAPublicKey pubFromCrt = (RSAPublicKey) KeyFactory.getInstance("RSA")
                .generatePublic(new RSAPublicKeySpec(priv.getModulus(), priv.getPublicExponent()));

            Path tempDir = Files.createTempDirectory("identity-it-keys");
            privateKeyPath = tempDir.resolve("jwt-private.pem");
            publicKeyPath = tempDir.resolve("jwt-public.pem");
            Files.writeString(privateKeyPath, pem("PRIVATE KEY", priv.getEncoded()));
            Files.writeString(publicKeyPath, pem("PUBLIC KEY", pubFromCrt.getEncoded()));
        } catch (Exception e) {
            throw new IllegalStateException("Sinh key IT thất bại", e);
        }
    }

    private static String pem(String label, byte[] der) {
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        return "-----BEGIN " + label + "-----\n" + base64 + "\n-----END " + label + "-----\n";
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        writeKeys(); // suppliers resolve LAZY — sinh key ở đây an toàn về ordering (không @TempDir method: JUnit 5.10 chỉ cho FIELD/PARAMETER)
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("management.health.rabbit.enabled", () -> "false");
        registry.add("identity.jwt.private-key-path", () -> privateKeyPath.toString());
        registry.add("identity.jwt.public-key-path", () -> publicKeyPath.toString());
        registry.add("identity.refresh.cookie-path", () -> "/identity"); // IT gọi thẳng service
    }
}
