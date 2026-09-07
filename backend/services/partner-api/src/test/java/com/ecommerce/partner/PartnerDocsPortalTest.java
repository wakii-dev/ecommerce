package com.ecommerce.partner;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 6 — docs portal: KHÔNG cần API key (cửa tự phục vụ). Swagger UI path
 * + api-docs JSON có đủ 6 paths + securityScheme + mô tả auth/webhook.
 * (Swagger UI render THẬT bằng mắt = browser-check ở Phase 5 — Rule 0.)
 */
class PartnerDocsPortalTest extends AbstractPartnerApiTest {

    @Test
    void swaggerUiPath_reachableWithoutKey() {
        // /open-api/v1/docs → springdoc redirect (302) hoặc serve trực tiếp (200)
        // — filter exempt + status 2xx/3xx là chấp nhận được
        ResponseEntity<String> response = rest.getForEntity("/open-api/v1/docs", String.class);
        int status = response.getStatusCode().value();
        assertThat(status).as("docs path %s", status).isBetween(200, 399);
    }

    @Test
    void apiDocs_exposesAllSixContractPathsAndSecurityScheme() {
        ResponseEntity<String> response = rest.getForEntity("/open-api/v1/api-docs", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String json = response.getBody();
        assertThat(json).isNotNull();
        // 6 paths của contract partner-api.yaml (frozen)
        assertThat(json).contains("/open-api/v1/products")
            .contains("/open-api/v1/products/{idOrSlug}")
            .contains("/open-api/v1/categories")
            .contains("/open-api/v1/search")
            .contains("/open-api/v1/orders")
            .contains("/open-api/v1/orders/{id}");
        // security scheme X-API-Key
        assertThat(json).contains("X-API-Key").contains("ApiKeyAuth");
        // mô tả auth + webhook verify (docs portal tự phục vụ)
        assertThat(json).contains("HMAC-SHA256").contains("partnerRef").contains("Retry-After");
    }

    @Test
    void docsPaths_exemptFromApiKeyFilter() {
        // filter phải exempt docs — nếu không, mọi request docs sẽ 401
        ResponseEntity<String> docs = rest.getForEntity("/open-api/v1/docs", String.class);
        assertThat(docs.getStatusCode().value()).isBetween(200, 399);
        ResponseEntity<String> apiDocs = rest.getForEntity("/open-api/v1/api-docs", String.class);
        assertThat(apiDocs.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
