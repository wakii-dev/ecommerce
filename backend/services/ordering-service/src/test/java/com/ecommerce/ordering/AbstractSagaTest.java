package com.ecommerce.ordering;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.HostConfig;
import com.github.dockerjava.api.model.Ports;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.ecommerce.inventory.SagaInventoryTestApp;
import com.ecommerce.payment.SagaPaymentTestApp;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.images.builder.ImageFromDockerfile;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;

/**
 * IT harness SAGA (SF-9) — stack THẬT trong 1 test JVM (pack: "saga IT chạy
 * với inventory + payment services THẬT trong compose test, catalog mock
 * WireMock"):
 *
 * <ul>
 *   <li>1 PG container — 3 DB (db_ordering / db_inventory / db_payment).</li>
 *   <li>1 RabbitMQ container — event loop THẬT: payment.succeeded → PAID →
 *       order.paid → inventory commit → inventory.committed → CONFIRMED đều
 *       đi qua outbox relay + Rabbit listeners thật (không mock MQ).</li>
 *   <li>inventory-service + payment-service: Spring context THẬT boot
 *       programmatic (@BeforeAll — chạy TRƯỚC context ordering), dùng
 *       Saga*TestApp (scan hẹp — jar 3 module chung classpath test).</li>
 *   <li>invoice-service 🐍: Docker container thật build từ
 *       services/invoice-service/Dockerfile (D18 — PDF render thật).</li>
 *   <li>catalog + JWKS: WireMock double (catalog admin-by-id là đường duy nhất
 *       trong contract — REQUIREMENT-GAP FI-310 comment 94b8496e).</li>
 * </ul>
 *
 * <p><strong>Flyway TẮT trong IT</strong> — 3 jar cùng mang classpath:db/migration
 * (V10 mỗi module khác tên file) → Flyway sẽ thấy 2 migration version 10.
 * Migration áp tay qua JDBC: V1__init (3 module GIỐNG NHAU — resource nào cũng
 * đúng) + V10/V11 tên-riêng từng module. {@code spring.flyway.enabled=false}
 * ở cả 3 context.</p>
 *
 * <p>JWT: keypair RS256 + JWKS serve trên EXTERNAL WireMock —
 * {@link #jwt(String, String, String)} mint token sub/role/email như identity.</p>
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(classes = SagaOrderingTestApp.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractSagaTest {

    // ── Product/variant ids cố định cho stub catalog ────────────────────────
    protected static final String PRODUCT_A = "a0000000-0000-4000-8000-000000000001";
    protected static final String VARIANT_A = "a0000000-0000-4000-8000-0000000000a1";
    protected static final String PRODUCT_B = "b0000000-0000-4000-8000-000000000002";
    protected static final String VARIANT_B = "b0000000-0000-4000-8000-0000000000b2";
    protected static final long PRICE_A = 150_000;
    protected static final long PRICE_B = 499_000;
    protected static final int STOCK_A = 50;
    protected static final int STOCK_B = 30;

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(DockerImageName.parse("postgres:16"))
        .withDatabaseName("postgres")
        .withUsername("postgres")
        .withPassword("postgres")
        .withStartupTimeout(Duration.ofMinutes(3));

    static final RabbitMQContainer RABBIT = new RabbitMQContainer(DockerImageName.parse("rabbitmq:3-management"));

    /** Stripe double — POST /v1/payment_intents + /v1/refunds (stripe-java SDK gọi thật). */
    static final WireMockServer STRIPE = new WireMockServer(options().dynamicPort());

    /** Catalog admin-by-id + JWKS (ordering gọi; identity/catalog KHÔNG boot trong IT). */
    static final WireMockServer EXTERNAL = new WireMockServer(options().dynamicPort());

    /** invoice-service 🐍 thật — build image từ Dockerfile của nó (D18).
     * FIXED host port 18090: InvoiceDegradedTest stop/start container, port map
     * giữ nguyên → base-url trong context ordering không stale.
     * Context copy TỪNG path (Dockerfile/pyproject/app/assets) — KHÔNG copy cả
     * thư mục: .venv (hàng nghìn symlink) làm recursiveTar broken pipe. */
    static final Path INVOICE_SVC = Path.of("..", "..", "..", "services", "invoice-service")
        .toAbsolutePath().normalize();

    static final GenericContainer<?> INVOICE = new GenericContainer<>(
        new ImageFromDockerfile("ecommerce/invoice-service-it", false)
            .withFileFromString("Dockerfile", textOf(INVOICE_SVC.resolve("Dockerfile")))
            .withFileFromString("pyproject.toml", textOf(INVOICE_SVC.resolve("pyproject.toml")))
            .withFileFromPath("app", INVOICE_SVC.resolve("app"))
            .withFileFromPath("assets", INVOICE_SVC.resolve("assets")))
        .withExposedPorts(8090)
        .withCreateContainerCmdModifier(cmd -> cmd.withHostConfig(
            new HostConfig().withPortBindings(
                new Ports(new ExposedPort(8090), Ports.Binding.bindPort(18090)))))
        .withStartupTimeout(Duration.ofMinutes(4));

    private static String textOf(Path path) {
        try {
            return java.nio.file.Files.readString(path);
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được " + path, e);
        }
    }

    static KeyPair KEY_PAIR;
    static ConfigurableApplicationContext inventoryCtx;
    static ConfigurableApplicationContext paymentCtx;
    static volatile int inventoryPort = -1;
    static volatile int paymentPort = -1;
    static final int INVOICE_HOST_PORT = 18090;

    static {
        POSTGRES.start();
        createDatabases();
        applyMigrations();
        RABBIT.start();
        STRIPE.start();
        EXTERNAL.start();
        stubCatalog();
        stubJwks();
        INVOICE.start();
    }

    private static void createDatabases() {
        try (Connection conn = DriverManager.getConnection(POSTGRES.getJdbcUrl(), "postgres", "postgres");
             Statement st = conn.createStatement()) {
            st.execute("CREATE DATABASE db_ordering");
            st.execute("CREATE DATABASE db_inventory");
            st.execute("CREATE DATABASE db_payment");
        } catch (Exception e) {
            throw new IllegalStateException("Không tạo được DB cho IT", e);
        }
    }

    /**
     * Áp migration tay (Flyway tắt): V1 identical 3 module (resource đầu tiên
     * trên classpath cũng đúng) + V10/V11 tên-riêng. Execute từng statement
     * (migrations không dùng function/.trigger — split ';' an toàn).
     */
    private static void applyMigrations() {
        apply("db_ordering", List.of("/db/migration/V1__init.sql",
            "/db/migration/V10__orders_domain.sql", "/db/migration/V11__seed_coupons.sql"));
        apply("db_inventory", List.of("/db/migration/V1__init.sql",
            "/db/migration/V10__inventory_domain.sql"));
        apply("db_payment", List.of("/db/migration/V1__init.sql",
            "/db/migration/V10__payment_domain.sql"));
    }

    private static void apply(String db, List<String> resources) {
        try (Connection conn = DriverManager.getConnection(jdbcUrl(db), "postgres", "postgres");
             Statement st = conn.createStatement()) {
            for (String resource : resources) {
                String sql = new String(AbstractSagaTest.class.getResourceAsStream(resource).readAllBytes(),
                    StandardCharsets.UTF_8);
                // Strip MỌI comment `--` (line lẫn inline) TRƯỚC khi split ';':
                // comment inline chứa ';' (vd "DB convention; event payload") sẽ cắt
                // statement giữa chừng → "syntax error at end of input". Migrations
                // không có string literal chứa '--' (chỉ dùng em-dash —) → an toàn.
                String noComments = sql.replaceAll("--[^\\n]*", "");
                for (String statement : noComments.split(";")) {
                    String trimmed = statement.trim();
                    if (!trimmed.isBlank()) {
                        st.execute(trimmed);
                    }
                }
            }
        } catch (Exception e) {
            throw new IllegalStateException("Áp migration lỗi cho " + db + ": " + e.getMessage(), e);
        }
    }

    /** Stub catalog admin-by-id (REQUIREMENT-GAP FI-310 — đường duy nhất hiện có). */
    private static void stubCatalog() {
        // INSTANCE stubFor — static WireMock.stubFor bắn localhost:8080 mặc định
        // (trên máy này là GATEWAY đang chạy → 404 lẫn vào test!)
        EXTERNAL.stubFor(get("/api/catalog/admin/products/" + PRODUCT_A)
            .willReturn(okJson(productJson(PRODUCT_A, "A", PRICE_A, VARIANT_A, 0))));
        EXTERNAL.stubFor(get("/api/catalog/admin/products/" + PRODUCT_B)
            .willReturn(okJson(productJson(PRODUCT_B, "B", PRICE_B, VARIANT_B, 30_000))));
    }

    private static String productJson(String id, String label, long price, String variantId, long priceDelta) {
        return """
            {"id":"%s","slug":"p-%s","name":"Sản phẩm %s","price":%d,
             "variants":[{"id":"%s","name":"Mặc định","options":{},"priceDelta":%d,"stock":0}]}
            """.formatted(id, id.substring(0, 2), label, price, variantId, priceDelta);
    }

    private static void stubJwks() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KEY_PAIR = generator.generateKeyPair();
            RSAKey jwk = new RSAKey.Builder((RSAPublicKey) KEY_PAIR.getPublic())
                .keyID("it-test-key").build();
            EXTERNAL.stubFor(get("/.well-known/jwks.json").willReturn(okJson(
                "{\"keys\":[" + jwk.toJSONString() + "]}")));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ── Boot inventory + payment THẬT (args có precedence cao nhất) ─────────

    /**
     * Boot MỘT LẦN cho CẢ JVM: @AfterAll của leaf class đầu tiên KHÔNG được
     * tắt side contexts — class sau (@SpringBootTest context cache) vẫn cần
     * inventory/payment sống (Connection refused = chết ở POST /orders 502).
     * Contexts + containers sống theo JVM; Ryuk dọn khi JVM thoát.
     */
    @BeforeAll
    static void bootSideServices() {
        if (inventoryCtx != null && inventoryCtx.isActive()) {
            return; // class khác đã boot — dùng chung
        }
        inventoryCtx = new SpringApplicationBuilder(SagaInventoryTestApp.class).run(
            "--server.port=0",
            "--spring.application.name=inventory-service",
            "--spring.datasource.url=" + jdbcUrl("db_inventory"),
            "--spring.rabbitmq.host=" + RABBIT.getHost(),
            "--spring.rabbitmq.port=" + RABBIT.getAmqpPort(),
            "--spring.flyway.enabled=false",
            "--inventory.reservation.sweep-interval-ms=3600000",
            "--outbox.relay.poll-interval-ms=500"
        );
        inventoryPort = ((WebServerApplicationContext) inventoryCtx).getWebServer().getPort();

        paymentCtx = new SpringApplicationBuilder(SagaPaymentTestApp.class).run(
            "--server.port=0",
            "--spring.application.name=payment-service",
            "--spring.datasource.url=" + jdbcUrl("db_payment"),
            "--spring.rabbitmq.host=" + RABBIT.getHost(),
            "--spring.rabbitmq.port=" + RABBIT.getAmqpPort(),
            "--spring.flyway.enabled=false",
            "--stripe.secret-key=sk_test_saga",
            "--stripe.base-url=" + STRIPE.baseUrl(),
            "--stripe.webhook-secret=whsec_saga_it",
            "--outbox.relay.poll-interval-ms=500"
        );
        paymentPort = ((WebServerApplicationContext) paymentCtx).getWebServer().getPort();
    }

    // ── Props cho context ORDERING (boot SAU @BeforeAll → đã có port) ───────

    @DynamicPropertySource
    static void orderingProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> jdbcUrl("db_ordering"));
        registry.add("spring.application.name", () -> "ordering-service");
        registry.add("spring.rabbitmq.host", RABBIT::getHost);
        registry.add("spring.rabbitmq.port", RABBIT::getAmqpPort);
        registry.add("spring.flyway.enabled", () -> "false");
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri",
            () -> EXTERNAL.baseUrl() + "/.well-known/jwks.json");
        registry.add("ordering.pricing.base-url", EXTERNAL::baseUrl);
        registry.add("ordering.pricing.token", () -> "it-test-token");
        registry.add("ordering.inventory.base-url", () -> "http://localhost:" + inventoryPort);
        registry.add("ordering.payment.base-url", () -> "http://localhost:" + paymentPort);
        registry.add("ordering.invoice.base-url", () -> "http://localhost:" + INVOICE_HOST_PORT);
        // TTL sweep GỌI TRỰC TIẾP bean (deterministic — scheduler ngang test = flaky)
        registry.add("ordering.sweep-interval-ms", () -> "3600000");
        registry.add("ordering.ttl-cancel-seconds", () -> "3600");
        registry.add("outbox.relay.poll-interval-ms", () -> "500");
    }

    static String jdbcUrl(String db) {
        return "jdbc:postgresql://" + POSTGRES.getHost() + ":" + POSTGRES.getMappedPort(5432) + "/" + db;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** Mint JWT RS256 (kid khớp JWKS stub) — claims như identity: sub/role/email/fullName. */
    protected static String jwt(String sub, String role, String email) {
        try {
            JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(sub)
                .claim("role", role)
                .claim("roles", List.of(role))
                .claim("email", email)
                .claim("fullName", "Tester " + role)
                .jwtID(UUID.randomUUID().toString())
                .expirationTime(Date.from(Instant.now().plusSeconds(600)))
                .issueTime(new Date())
                .build();
            JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                .keyID("it-test-key").type(JOSEObjectType.JWT).build();
            SignedJWT signed = new SignedJWT(header, claims);
            signed.sign(new RSASSASigner(KEY_PAIR.getPrivate()));
            return signed.serialize();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    protected static String customerJwt(String email) {
        return jwt(UUID.randomUUID().toString(), "CUSTOMER", email);
    }

    protected static String adminJwt() {
        return jwt("00000000-0000-4000-8000-00000000ad01", "ADMIN", "admin@ecommerce.local");
    }

    /** INSERT/UPDATE thẳng DB inventory (variant_id VARCHAR(64)). */
    protected static void execInventory(String sql) {
        execDb("db_inventory", sql);
    }

    /** Seed stock 1 variant (reset đầu mỗi test — tests tự quản isolate qua id riêng). */
    protected static void seedStock(String variantId, int quantity) {
        execInventory("INSERT INTO stocks (variant_id, quantity, threshold_low) VALUES ('" + variantId
            + "', " + quantity + ", 5) ON CONFLICT (variant_id) DO UPDATE SET quantity = " + quantity);
    }

    protected static void execOrdering(String sql) {
        execDb("db_ordering", sql);
    }

    private static void execDb(String db, String sql) {
        try (Connection conn = DriverManager.getConnection(jdbcUrl(db), "postgres", "postgres");
             Statement st = conn.createStatement()) {
            st.execute(sql);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Webhook Stripe SIGNED (t=ts,v1=hmac-sha256) như PaymentWebhookTest — fire tại payment THẬT. */
    protected static HttpEntity<String> signedWebhook(String body) {
        try {
            long t = Instant.now().getEpochSecond();
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(
                "whsec_saga_it".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String sig = java.util.HexFormat.of().formatHex(
                mac.doFinal((t + "." + body).getBytes(StandardCharsets.UTF_8)));
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Stripe-Signature", "t=" + t + ",v1=" + sig);
            return new HttpEntity<>(body, headers);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    protected static String webhookEvent(String type, String piId, long amount) {
        return """
            {"id":"evt_%s","object":"event","created":%d,"type":"%s",
             "data":{"object":{"id":"%s","object":"payment_intent","amount":%d,
                     "currency":"vnd","status":"succeeded","client_secret":"cs_x","livemode":false}}}
            """.formatted(UUID.randomUUID(), Instant.now().getEpochSecond(), type, piId, amount);
    }

    /**
     * Bind tham số dạng UUID-shape thành {@link UUID} thật — PG không cho so
     * sánh cột {@code uuid = character varying} (param String mặc định là
     * varchar). Dùng cho JdbcTemplate helper của test; SQL literal đã tự ép kiểu.
     */
    protected static Object[] uuidArgs(Object... args) {
        return java.util.Arrays.stream(args)
            .map(a -> (a instanceof String s && s.length() == 36 && s.charAt(8) == '-')
                ? UUID.fromString(s) : a)
            .toArray();
    }
}
