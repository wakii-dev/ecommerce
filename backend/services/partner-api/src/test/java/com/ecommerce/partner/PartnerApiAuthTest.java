package com.ecommerce.partner;

import com.ecommerce.partner.auth.ApiKeyService;
import com.ecommerce.partner.domain.ApiKeyEntity;
import com.ecommerce.partner.domain.PartnerEntity;
import com.ecommerce.partner.repo.ApiKeyRepository;
import com.ecommerce.partner.repo.PartnerRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 2 — auth matrix (ACCEPTANCE: "key sai → 401; key revoke → 401; vượt
 * rate-limit → 429 + Retry-After") + scope enforcement 403 (GAP-5).
 *
 * <p>Endpoint probe = GET /open-api/v1/products (controller CÓ ở Task 3 —
 * tới lúc đó response của auth-pass sẽ đổi 404 → 200; 404 nghĩa là filter
 * cho qua). Tạo partner/key qua repos cho deterministic (raw key tự biết).</p>
 */
class PartnerApiAuthTest extends AbstractPartnerApiTest {

    private static final String PRODUCTS = "/open-api/v1/products";

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private PartnerRepository partners;

    @Autowired
    private ApiKeyRepository apiKeys;

    record TestKey(String raw, PartnerEntity partner) {
    }

    TestKey createKey(List<String> scopes, int rateLimitPerMin) {
        return createKey(scopes, rateLimitPerMin, null);
    }

    TestKey createKey(List<String> scopes, int rateLimitPerMin, Instant expiresAt) {
        PartnerEntity partner = new PartnerEntity();
        partner.setName("IT-PARTNER-" + System.nanoTime());
        partner.setWebhookSecret(ApiKeyService.generateWebhookSecret());
        partner.setRateLimitPerMin(rateLimitPerMin);
        partner = partners.save(partner);

        String raw = ApiKeyService.generateRawKey();
        ApiKeyEntity key = new ApiKeyEntity();
        key.setPartnerId(partner.getId());
        key.setKeyHash(ApiKeyService.sha256Hex(raw));
        key.setPrefix(ApiKeyService.prefixOf(raw));
        key.setScopes(scopes);
        key.setExpiresAt(expiresAt);
        key = apiKeys.save(key);
        return new TestKey(raw, partner);
    }

    ResponseEntity<Map> get(String rawKey) {
        HttpHeaders headers = new HttpHeaders();
        if (rawKey != null) {
            headers.set("X-API-Key", rawKey);
        }
        return rest.exchange(PRODUCTS, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
    }

    @Test
    void missingKey_is401() {
        assertThat(get(null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void wrongKey_is401() {
        TestKey real = createKey(List.of("catalog:read"), 60);
        assertThat(get("pk_" + "0".repeat(32)).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        // key thật của partner khác bị đổi 1 ký tự cuối → 401 (không lộ candidate nào pass)
        String tampered = real.raw().substring(0, real.raw().length() - 1) + "f";
        assertThat(get(tampered).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void revokedKey_is401() {
        TestKey key = createKey(List.of("catalog:read"), 60);
        ApiKeyEntity entity = apiKeys.findAll().stream()
            .filter(k -> k.getPrefix().equals(ApiKeyService.prefixOf(key.raw()))).findFirst().orElseThrow();
        entity.setRevokedAt(Instant.now());
        apiKeys.save(entity);
        assertThat(get(key.raw()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void expiredKey_is401() {
        TestKey key = createKey(List.of("catalog:read"), 60, Instant.now().minusSeconds(60));
        assertThat(get(key.raw()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void validKeyWithScope_passesFilter_noControllerYet_404() {
        TestKey key = createKey(List.of("catalog:read"), 60);
        // filter cho qua (controller Task 3 mới có) → 404, KHÔNG 401
        ResponseEntity<Map> response = get(key.raw());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void keyWithoutCatalogScope_is403() {
        TestKey key = createKey(List.of("orders:read"), 60);
        ResponseEntity<Map> response = get(key.raw());
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).containsEntry("title", "Forbidden");
        assertThat((String) response.getBody().get("detail")).contains("catalog:read");
    }

    @Test
    void rateLimitExceeded_is429WithRetryAfter() {
        TestKey key = createKey(List.of("catalog:read"), 2); // limit 2/phút
        assertThat(get(key.raw()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND); // 1
        assertThat(get(key.raw()).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND); // 2
        ResponseEntity<Map> third = get(key.raw());
        assertThat(third.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        String retryAfter = third.getHeaders().getFirst("Retry-After");
        assertThat(retryAfter).as("Retry-After header").isNotNull();
        assertThat(Long.parseLong(retryAfter)).isGreaterThanOrEqualTo(1);
        assertThat(Long.parseLong(retryAfter)).isLessThanOrEqualTo(60);
    }

    @Test
    void suspendedPartner_is401() {
        TestKey key = createKey(List.of("catalog:read"), 60);
        PartnerEntity p = partners.findById(key.partner().getId()).orElseThrow();
        p.setStatus(com.ecommerce.partner.domain.PartnerStatus.SUSPENDED);
        partners.save(p);
        assertThat(get(key.raw()).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
