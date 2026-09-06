package com.ecommerce.partner;

import com.ecommerce.partner.auth.ApiKeyService;
import com.ecommerce.partner.domain.ApiKeyEntity;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.domain.PartnerOrderRefEntity;
import com.ecommerce.partner.repo.ApiKeyRepository;
import com.ecommerce.partner.repo.PartnerOrderRefRepository;
import com.ecommerce.partner.repo.PartnerRepository;
import com.ecommerce.partner.proxy.IdentityClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.urlMatching;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 4 — tạo/tra cứu đơn partner (ACCEPTANCE: "POST /orders → đơn tạo thật;
 * gửi lại cùng partner_order_ref → không double đơn"). Ordering + identity =
 * WireMock; idempotency + error mapping + partner-scoping là logic CỦA
 * partner-api nên kiểm qua WireMock là đủ và deterministic.
 */
class PartnerOrderTest extends AbstractPartnerApiTest {

    static final ParameterizedTypeReference<Map<String, Object>> MAP =
        new ParameterizedTypeReference<>() {
        };

    @Autowired
    private PartnerRepository partners;

    @Autowired
    private ApiKeyRepository apiKeys;

    @Autowired
    private PartnerOrderRefRepository refs;

    @Autowired
    private IdentityClient identityClient;

    private String rawKey;
    private PartnerEntity partner;

    @BeforeEach
    void setupStubsAndKey() {
        WIRE.resetAll();
        // identity login (token được cache trong app context — stub lại để test
        // đầu tiên và các test khác vẫn có)
        WIRE.stubFor(post(urlEqualTo("/auth/login"))
            .willReturn(okJson(
                "{\"accessToken\":\"svc-token\",\"tokenType\":\"Bearer\",\"expiresIn\":900,"
                    + "\"user\":{\"id\":\"" + UUID.randomUUID() + "\",\"email\":\"svc@x\",\"fullName\":\"svc\"}}")));

        partner = new PartnerEntity();
        partner.setName("ORD-IT-" + System.nanoTime());
        partner.setWebhookSecret("ws-" + System.nanoTime());
        partner = partners.save(partner);
        rawKey = newKeyWithFullScopes();
    }

    @AfterEach
    void reset() {
        WIRE.resetAll();
    }

    private String newKeyWithFullScopes() {
        String raw = ApiKeyService.generateRawKey();
        ApiKeyEntity key = new ApiKeyEntity();
        key.setPartnerId(partner.getId());
        key.setKeyHash(ApiKeyService.sha256Hex(raw));
        key.setPrefix(ApiKeyService.prefixOf(raw));
        key.setScopes(List.of("catalog:read", "orders:read", "orders:write"));
        apiKeys.save(key);
        return raw;
    }

    private String orderJson(UUID orderId, String status) {
        return """
            {"order": {"id": "%s", "userId": "%s", "status": "%s",
              "items": [{"id": "%s", "productId": "%s", "variantId": "%s", "name": "iPhone 15",
                         "qty": 1, "unitPrice": 21990000, "lineTotal": 21990000}],
              "total": 21990000, "updatedAt": "2026-09-07T03:00:00Z"},
             "clientSecret": "cs_secret"}
            """.formatted(orderId, UUID.randomUUID(), status, UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID());
    }

private String directOrderJson(UUID orderId, String status) {
        // ordering GET /me/orders/{id} trả OrderDto TRỰC TIẾP (không bọc {"order":})
        return """
            {"id": "%s", "userId": "%s", "status": "%s",
              "items": [{"id": "%s", "productId": "%s", "variantId": "%s", "name": "iPhone 15",
                         "qty": 1, "unitPrice": 21990000, "lineTotal": 21990000}],
              "total": 21990000, "updatedAt": "2026-09-07T03:00:00Z"}
            """.formatted(orderId, UUID.randomUUID(), status, UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID());
    }

    private ResponseEntity<Map<String, Object>> postOrder(String body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-API-Key", rawKey);
        return rest.exchange("/open-api/v1/orders", HttpMethod.POST,
            new HttpEntity<>(body, headers), MAP);
    }

    private String createBody(String ref) {
        return """
            {"partnerRef": "%s",
             "customer": {"name": "Nguyễn Văn A", "phone": "0901234567",
                          "email": "a@example.com", "address": "123 Lê Lợi, Q1, TP.HCM"},
             "items": [{"productId": "%s", "variantId": "%s", "qty": 1}]}
            """.formatted(ref, UUID.randomUUID(), UUID.randomUUID());
    }

    @Test
    void createOrder_201_mapsAndSendsIdempotencyKey() {
        UUID orderId = UUID.randomUUID();
        WIRE.stubFor(post(urlEqualTo("/orders"))
            .willReturn(okJson(orderJson(orderId, "PENDING"))));

        ResponseEntity<Map<String, Object>> response = postOrder(createBody("ref-001"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        Map<String, Object> body = response.getBody();
        assertThat(body.get("orderId")).isEqualTo(orderId.toString());
        assertThat(body.get("partnerRef")).isEqualTo("ref-001");
        assertThat(body.get("status")).isEqualTo("PENDING");
        // contract PartnerOrderCreated — KHÔNG lộ clientSecret
        assertThat(body.keySet()).doesNotContain("clientSecret", "items");

        // ordering nhận Idempotency-Key + Bearer + body đã map
        WIRE.verify(1, postRequestedFor(urlEqualTo("/orders"))
            .withHeader("Idempotency-Key", equalTo(
                UUID.nameUUIDFromBytes((partner.getId() + ":ref-001")
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString()))
            .withHeader("Authorization", equalTo("Bearer svc-token")));
    }

    @Test
    void replaySamePartnerRef_returnsSameOrder_singleOrderingCall() {
        UUID orderId = UUID.randomUUID();
        WIRE.stubFor(post(urlEqualTo("/orders")).willReturn(okJson(orderJson(orderId, "PENDING"))));
        // replay đọc status từ ordering
        WIRE.stubFor(get(urlEqualTo("/me/orders/" + orderId))
            .willReturn(okJson(orderJson(orderId, "CONFIRMED"))));

        ResponseEntity<Map<String, Object>> first = postOrder(createBody("ref-dup"));
        ResponseEntity<Map<String, Object>> second = postOrder(createBody("ref-dup"));

        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(second.getBody().get("orderId")).isEqualTo(orderId.toString());
        // layer 1: ordering chỉ nhận ĐÚNG 1 lệnh tạo
        WIRE.verify(1, postRequestedFor(urlEqualTo("/orders")));
    }

    @Test
    void orderingConflict_refAlreadyExists_returnsExistingOrder201() {
        // 409 từ ordering nhưng ref đã tồn tại (race payload khác) → 201 đơn cũ.
        // Lưu ý: nhánh catch 409-race thật (2 request qua layer-1 cùng lúc) được
        // phủ bởi concurrentSamePartnerRef test — đây là path ref đã có TRƯỚC.
        UUID orderId = UUID.randomUUID();
        PartnerOrderRefEntity ref = new PartnerOrderRefEntity();
        ref.setPartnerId(partner.getId());
        ref.setPartnerRef("ref-race");
        ref.setOrderId(orderId);
        refs.save(ref);
        WIRE.stubFor(post(urlEqualTo("/orders")).willReturn(aResponse().withStatus(409)));
        WIRE.stubFor(get(urlEqualTo("/me/orders/" + orderId)).willReturn(okJson(directOrderJson(orderId, "PAID"))));

        ResponseEntity<Map<String, Object>> response = postOrder(createBody("ref-race"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().get("orderId")).isEqualTo(orderId.toString());
    }

    @Test
    void concurrentSamePartnerRef_both201_sameOrder() throws Exception {
        // code-review P1: 2 request ĐỒNG THỜI cùng partnerRef — không được 409
        // (UNIQUE race), cả hai 201 cùng 1 đơn (một tạo, một replay-DIVE-catch).
        UUID orderId = UUID.randomUUID();
        WIRE.stubFor(post(urlEqualTo("/orders")).willReturn(okJson(orderJson(orderId, "PENDING"))));
        WIRE.stubFor(get(urlEqualTo("/me/orders/" + orderId)).willReturn(okJson(directOrderJson(orderId, "PENDING"))));

        String body = createBody("ref-thread-race");
        int threads = 2;
        java.util.concurrent.CountDownLatch start = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(threads);
        try {
            var futures = new java.util.ArrayList<java.util.concurrent.Future<ResponseEntity<Map<String, Object>>>>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return postOrder(body);
                }));
            }
            start.countDown();
            var orderIds = new java.util.HashSet<String>();
            for (var f : futures) {
                ResponseEntity<Map<String, Object>> r = f.get(20, java.util.concurrent.TimeUnit.SECONDS);
                // KHÔNG 409 — race UNIQUE phải kết thúc bằng 201 đơn cũ
                assertThat(r.getStatusCode()).as("body=%s", r.getBody()).isEqualTo(HttpStatus.CREATED);
                orderIds.add((String) r.getBody().get("orderId"));
            }
            assertThat(orderIds).hasSize(1); // đúng 1 đơn, không double
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void serviceAccountToken401_selfHealsRegisterAndRetry() throws Exception {
        // code-review P1: identity login 401 lần đầu → register → login lại →
        // đơn tạo thành công (self-healing path — spec §7). Self-heal diễn ra
        // NỘI BỘ trong getAccessToken() → ordering POST đầu tiên đã mang token mới.
        WIRE.resetAll();
        WIRE.stubFor(post(urlEqualTo("/auth/login"))
            .inScenario("relogin")
            .whenScenarioStateIs(com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED)
            .willReturn(aResponse().withStatus(401))
            .willSetStateTo("after-register"));
        WIRE.stubFor(post(urlEqualTo("/auth/login"))
            .inScenario("relogin")
            .whenScenarioStateIs("after-register")
            .willReturn(okJson(
                "{\"accessToken\":\"tok-new\",\"tokenType\":\"Bearer\",\"expiresIn\":900,"
                    + "\"user\":{\"id\":\"" + UUID.randomUUID() + "\",\"email\":\"svc@x\",\"fullName\":\"svc\"}}")));
        WIRE.stubFor(post(urlEqualTo("/auth/register")).willReturn(okJson("{\"id\":\"u1\"}")));
        UUID orderId = UUID.randomUUID();
        WIRE.stubFor(post(urlEqualTo("/orders"))
            .withHeader("Authorization", equalTo("Bearer tok-new"))
            .willReturn(okJson(orderJson(orderId, "PENDING"))));

        expireServiceAccountToken();

        ResponseEntity<Map<String, Object>> response = postOrder(createBody("ref-relogin"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().get("orderId")).isEqualTo(orderId.toString());
        WIRE.verify(1, postRequestedFor(urlEqualTo("/auth/register"))); // đúng 1 register
        WIRE.verify(1, postRequestedFor(urlEqualTo("/orders"))
            .withHeader("Authorization", equalTo("Bearer tok-new"))); // token mới ngay từ call đầu
    }

    @Test
    void ordering401_retriesOnceWithCachedToken() throws Exception {
        // code-review P1: path OrderingClient.callWithTokenRetry — ordering chối
        // token 401 LẦN ĐẦU → refresh (cache còn valid → cùng token) → retry đúng
        // 1 lần → thành công. Scenario theo LẦN GỌI POST /orders.
        UUID orderId = UUID.randomUUID();
        WIRE.stubFor(post(urlEqualTo("/orders"))
            .inScenario("ordering-retry")
            .whenScenarioStateIs(com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED)
            .willReturn(aResponse().withStatus(401))
            .willSetStateTo("retried"));
        WIRE.stubFor(post(urlEqualTo("/orders"))
            .inScenario("ordering-retry")
            .whenScenarioStateIs("retried")
            .willReturn(okJson(orderJson(orderId, "PENDING"))));

        ResponseEntity<Map<String, Object>> response = postOrder(createBody("ref-retry-401"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().get("orderId")).isEqualTo(orderId.toString());
        WIRE.verify(2, postRequestedFor(urlEqualTo("/orders"))); // 401 → đúng 1 retry
    }

    /** Ép token service-account hết hạn — bật path login-401 cho test self-healing. */
    @SuppressWarnings("unchecked")
    private void expireServiceAccountToken() throws Exception {
        var field = Class.forName("com.ecommerce.partner.proxy.IdentityClient")
            .getDeclaredField("cache");
        field.setAccessible(true);
        ((java.util.concurrent.atomic.AtomicReference<Object>) field.get(identityClient)).set(null);
    }

    @Test
    void orderingConflictWithoutRef_is409() {
        WIRE.stubFor(post(urlEqualTo("/orders")).willReturn(aResponse().withStatus(409)));
        assertThat(postOrder(createBody("ref-409")).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void orderingUnprocessableItem_is409() {
        // 422 = sản phẩm ngừng bán → contract "hết hàng hoặc ngừng bán" → 409
        WIRE.stubFor(post(urlEqualTo("/orders")).willReturn(aResponse().withStatus(422)));
        assertThat(postOrder(createBody("ref-422")).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void orderingBadRequest_passesThrough400() {
        WIRE.stubFor(post(urlEqualTo("/orders")).willReturn(aResponse().withStatus(400)));
        assertThat(postOrder(createBody("ref-400")).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void orderingDown_is502() {
        WIRE.stubFor(post(urlEqualTo("/orders")).willReturn(aResponse().withStatus(500)));
        assertThat(postOrder(createBody("ref-500")).getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }

    @Test
    void getOrder_ofOwnOrder_mapsPartnerShape() {
        UUID orderId = UUID.randomUUID();
        PartnerOrderRefEntity ref = new PartnerOrderRefEntity();
        ref.setPartnerId(partner.getId());
        ref.setPartnerRef("ref-get");
        ref.setOrderId(orderId);
        refs.save(ref);
        WIRE.stubFor(get(urlEqualTo("/me/orders/" + orderId)).willReturn(okJson(directOrderJson(orderId, "CONFIRMED"))));

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-Key", rawKey);
        ResponseEntity<Map<String, Object>> response = rest.exchange(
            "/open-api/v1/orders/" + orderId, HttpMethod.GET, new HttpEntity<>(headers), MAP);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = response.getBody();
        assertThat(body.get("orderId")).isEqualTo(orderId.toString());
        assertThat(body.get("partnerRef")).isEqualTo("ref-get");
        assertThat(body.get("status")).isEqualTo("CONFIRMED");
        assertThat((List<?>) body.get("items")).hasSize(1);
    }

    @Test
    void getOrder_ofOtherPartner_is404WithoutOrderingCall() {
        UUID orderId = UUID.randomUUID();
        PartnerEntity other = new PartnerEntity();
        other.setName("ORD-IT-OTHER-" + System.nanoTime());
        other.setWebhookSecret("ws-other");
        other = partners.save(other);
        PartnerOrderRefEntity ref = new PartnerOrderRefEntity();
        ref.setPartnerId(other.getId());
        ref.setPartnerRef("ref-other");
        ref.setOrderId(orderId);
        refs.save(ref);

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-API-Key", rawKey);
        ResponseEntity<Map<String, Object>> response = rest.exchange(
            "/open-api/v1/orders/" + orderId, HttpMethod.GET, new HttpEntity<>(headers), MAP);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        // KHÔNG gọi ordering — chặn ở ref table (không lộ tồn tại)
        WIRE.verify(0, getRequestedFor(urlMatching("/me/orders/.*")));
    }

}
