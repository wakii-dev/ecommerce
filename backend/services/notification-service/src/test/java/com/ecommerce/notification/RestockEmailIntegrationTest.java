package com.ecommerce.notification;

import com.ecommerce.notification.AbstractIntegrationTest;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Duration;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.containing;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.stubFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * IT restock email (SF-15): scheduler poll catalog (WireMock) → claim → Mailpit
 * nhận mail đúng nội dung (fetch body message) → catalog flip (scenario:
 * claim xong candidates rỗng) → KHÔNG email lần 2 = "email 1 lần". Mailpit
 * thật (pattern NotificationConsumerTest).
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class RestockEmailIntegrationTest extends AbstractIntegrationTest {

    static final WireMockServer WIRE = new WireMockServer(WireMockConfiguration.wireMockConfig().dynamicPort());
    static final UUID ALERT = UUID.fromString("11111111-2222-3333-4444-555555555555");
    static final String EMAIL = "restock-user@demo.vn";
    static final String CANDIDATE_JSON = "[{\"alertId\":\"" + ALERT + "\",\"email\":\"" + EMAIL
        + "\",\"productId\":\"99999999-9999-9999-9999-999999999999\",\"slug\":\"tai-nghe"
        + "\",\"productName\":\"Tai Nghe Bluetooth\",\"variantName\":\"Đen M\"}]";

    @Autowired TestRestTemplate http;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void stockAlertProps(DynamicPropertyRegistry registry) {
        WIRE.start();
        // Static stubFor mặc định bắn localhost:8080 (gateway!) — phải trỏ admin
        // client vào port WireMock thật, không thì stub rơi vào 404 của gateway.
        com.github.tomakehurst.wiremock.client.WireMock.configureFor("localhost", WIRE.port());
        registry.add("notify.stock-alert.enabled", () -> "true");
        registry.add("notify.stock-alert.interval-ms", () -> "1000");
        registry.add("notify.stock-alert.initial-delay-ms", () -> "1500");
        registry.add("notify.stock-alert.catalog.base-url", WIRE::baseUrl);
        registry.add("notify.stock-alert.catalog.internal-token", () -> "it-internal-token");
    }

    @BeforeAll
    static void startWire() {
        if (!WIRE.isRunning()) WIRE.start();
    }

    @AfterAll
    static void stopWire() {
        WIRE.stop();
    }

    private String mailpitApi(String path) {
        return "http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + path;
    }

    private int restockMailCount() {
        String body = http.getForEntity(mailpitApi("/api/v1/search?query=to:" + EMAIL), String.class).getBody();
        return body == null ? 0 : body.split("\"Subject\":\"Hàng về rồi").length - 1;
    }

    @Test
    @Order(1)
    void restockEmailSentExactlyOnce() {
        WIRE.resetAll();
        // Scenario "flip": candidates=[c] ở STARTED; claim gọi xong → candidates=[]
        // (mô phỏng catalog flip ACTIVE→NOTIFIED thật).
        stubFor(post(urlEqualTo("/api/catalog/internal/stock-alerts/claim"))
            .withHeader("X-Internal-Token", containing("it-internal-token"))
            .inScenario("flip")
            .whenScenarioStateIs(com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED)
            .willReturn(aResponse().withHeader("Content-Type", "application/json").withBody(CANDIDATE_JSON))
            .willSetStateTo("CLAIMED"));
        stubFor(get(urlEqualTo("/api/catalog/internal/stock-alerts/candidates?limit=50"))
            .withHeader("X-Internal-Token", containing("it-internal-token"))
            .inScenario("flip")
            .whenScenarioStateIs(com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED)
            .willReturn(aResponse().withHeader("Content-Type", "application/json").withBody(CANDIDATE_JSON)));
        // CHỈ claim flip state (candidates GET không đổi state — tick lặp được)
        stubFor(get(urlEqualTo("/api/catalog/internal/stock-alerts/candidates?limit=50"))
            .withHeader("X-Internal-Token", containing("it-internal-token"))
            .inScenario("flip")
            .whenScenarioStateIs("CLAIMED")
            .willReturn(aResponse().withHeader("Content-Type", "application/json").withBody("[]")));

        // Email tới Mailpit + send_log SENT đúng 1 row
        await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            Long sent = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid AND status = 'SENT'",
                Long.class, ALERT);
            assertThat(sent).isEqualTo(1);
        });

        // Nội dung mail: fetch BODY message (list API không trả HTML) — link PDP
        // có locale prefix + tên product + variant.
        String list = http.getForEntity(mailpitApi("/api/v1/search?query=to:" + EMAIL), String.class).getBody();
        java.util.regex.Matcher idm = java.util.regex.Pattern.compile("\"ID\":\"([^\"]+)\"").matcher(list);
        assertThat(idm.find()).isTrue();
        String id = idm.group(1);
        String messageBody = http.getForEntity(mailpitApi("/api/v1/message/" + id), String.class).getBody();
        assertThat(messageBody).contains("Hàng về rồi — Tai Nghe Bluetooth").contains("/vi/p/tai-nghe");

        // Sau claim, catalog trả candidates rỗng → các tick sau KHÔNG gửi thêm
        long afterFirst = restockMailCount();
        assertThat(afterFirst).isEqualTo(1);
        await().during(Duration.ofSeconds(4)).atMost(Duration.ofSeconds(8))
            .until(() -> restockMailCount() == 1);
        Long total = jdbc.queryForObject(
            "SELECT count(*) FROM send_log WHERE event_id = ?::uuid", Long.class, ALERT);
        assertThat(total).isEqualTo(1);
    }

    @Test
    @Order(2)
    void claimLostRace_noEmail() {
        WIRE.resetAll();
        UUID lostAlert = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        String lostJson = "[{\"alertId\":\"" + lostAlert + "\",\"email\":\"lost-race@demo.vn"
            + "\",\"productId\":\"99999999-9999-9999-9999-999999999999\",\"slug\":\"khac"
            + "\",\"productName\":\"Sản Khác\",\"variantName\":\"\"}]";
        // poller khác thắng claim — catalog trả mảng rỗng cho mình
        stubFor(get(urlEqualTo("/api/catalog/internal/stock-alerts/candidates?limit=50"))
            .withHeader("X-Internal-Token", containing("it-internal-token"))
            .willReturn(aResponse().withHeader("Content-Type", "application/json").withBody(lostJson)));
        stubFor(post(urlEqualTo("/api/catalog/internal/stock-alerts/claim"))
            .withHeader("X-Internal-Token", containing("it-internal-token"))
            .willReturn(aResponse().withHeader("Content-Type", "application/json").withBody("[]")));

        await().during(Duration.ofSeconds(4)).atMost(Duration.ofSeconds(8)).untilAsserted(() -> {
            Long rows = jdbc.queryForObject(
                "SELECT count(*) FROM send_log WHERE event_id = ?::uuid", Long.class, lostAlert);
            assertThat(rows).isEqualTo(0);
        });
        assertThat(http.getForEntity(mailpitApi("/api/v1/search?query=to:lost-race@demo.vn"), String.class)
            .getBody()).contains("\"messages_count\":0");
    }
}
