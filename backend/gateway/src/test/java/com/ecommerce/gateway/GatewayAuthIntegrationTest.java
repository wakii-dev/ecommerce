package com.ecommerce.gateway;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.util.Date;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Auth tại gateway: JWKS stub + identity stub (HttpServer JDK — 0 dep mới).
 * admin token → /api/identity/admin/users 200 PASSTHROUGH stub;
 * customer token → 403 TỪ GATEWAY (không chạm stub — đếm request);
 * no token protected → 401; public paths → qua.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayAuthIntegrationTest {

    @LocalServerPort
    int port;

    static HttpServer stub;
    static RSAKey rsaKey;
    static int stubPort;
    static final AtomicInteger ADMIN_HITS = new AtomicInteger();

    // DynamicPropertySource chạy TRƯỚC @BeforeAll → stub PHẢI start trong static
    // initializer để stubPort sẵn sàng trước khi property suppliers resolve.
    static {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair pair = gen.generateKeyPair();
            rsaKey = new RSAKey.Builder((RSAPublicKey) pair.getPublic()).privateKey(pair.getPrivate())
                .keyID("gateway-test-1").build();

            stub = HttpServer.create(new InetSocketAddress(0), 0);
            stub.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                byte[] body;
                if (path.contains("/.well-known/jwks.json")) {
                    body = new JWKSet(rsaKey.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
                } else {
                    ADMIN_HITS.incrementAndGet();
                    body = ("{\"service\":\"identity-stub\",\"path\":\"" + path + "\"}")
                        .getBytes(StandardCharsets.UTF_8);
                }
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream os = exchange.getResponseBody()) { os.write(body); }
            });
            stub.start();
            stubPort = stub.getAddress().getPort();
        } catch (Exception e) {
            throw new IllegalStateException("Start identity stub thất bại", e);
        }
    }

    @AfterAll
    static void stopStub() { stub.stop(0); }

    @DynamicPropertySource
    static void stubUris(DynamicPropertyRegistry registry) {
        registry.add("IDENTITY_URI", () -> "http://localhost:" + stubPort);
        registry.add("IDENTITY_JWKS_URI", () -> "http://localhost:" + stubPort + "/.well-known/jwks.json");
    }

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    static String token(String role) throws JOSEException {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .subject("11111111-1111-1111-1111-111111111111")
            .claim("role", role).claim("roles", List.of(role))
            .claim("email", role.toLowerCase() + "@test.local")
            .expirationTime(new Date(System.currentTimeMillis() + 60_000))
            .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("gateway-test-1").build(), claims);
        jwt.sign(new RSASSASigner(rsaKey.toRSAKey()));
        return jwt.serialize();
    }

    @Test
    void noTokenOnProtectedPath401() {
        client().get().uri("/api/identity/me").exchange().expectStatus().isEqualTo(401);
    }

    @Test
    void customerTokenOnIdentityAdmin403FromGateway() throws Exception {
        int before = ADMIN_HITS.get();
        client().get().uri("/api/identity/admin/users").header("Authorization", "Bearer " + token("CUSTOMER"))
            .exchange().expectStatus().isEqualTo(403);
        assertThat(ADMIN_HITS.get())
            .as("403 phải đến từ gateway — không được chạm identity stub").isEqualTo(before);
    }

    @Test
    void adminTokenPassesGatewayToIdentity() throws Exception {
        client().get().uri("/api/identity/admin/users").header("Authorization", "Bearer " + token("ADMIN"))
            .exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.service").isEqualTo("identity-stub");
    }

    @Test
    void customerTokenOnRoutelessAdminPrefix403() throws Exception {
        client().get().uri("/api/admin/users").header("Authorization", "Bearer " + token("CUSTOMER"))
            .exchange().expectStatus().isEqualTo(403);
    }

    @Test
    void adminTokenOnRoutelessAdminPrefixNot401Or403() throws Exception {
        client().get().uri("/api/admin/users").header("Authorization", "Bearer " + token("ADMIN"))
            .exchange().expectStatus().value(s ->
                assertThat(s).as("qua guard → 404 (không route)").isEqualTo(404));
    }

    @Test
    void publicPathsPassThroughWithoutToken() {
        client().post().uri("/api/identity/auth/login").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.service").isEqualTo("identity-stub");
        client().get().uri("/api/identity/.well-known/jwks.json").exchange().expectStatus().isOk();
        client().get().uri("/api/smoke").exchange().expectStatus().isOk();
    }

    @Test
    void corsPreflightOnProtectedPathNotBlockedByAuth() {
        client().options().uri("/api/identity/me")
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "GET")
            .exchange().expectStatus().isOk()
            .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:5173");
    }

    @Test
    void invalidSignatureToken401() throws Exception {
        // Ký bằng keypair KHÁC (không có trong JWKS stub) → signature fail → 401
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        var stranger = gen.generateKeyPair();
        JWTClaimsSet claims = new JWTClaimsSet.Builder().subject("x").claim("role", "ADMIN")
            .expirationTime(new Date(System.currentTimeMillis() + 60_000)).build();
        SignedJWT forged = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).build(), claims);
        forged.sign(new RSASSASigner((java.security.interfaces.RSAPrivateKey) stranger.getPrivate()));
        client().get().uri("/api/identity/me").header("Authorization", "Bearer " + forged.serialize())
            .exchange().expectStatus().isEqualTo(401);
    }
}
