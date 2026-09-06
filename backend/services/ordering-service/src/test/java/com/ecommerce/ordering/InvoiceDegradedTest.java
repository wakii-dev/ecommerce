package com.ecommerce.ordering;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D18 ACCEPTANCE: "dừng invoice-service → endpoint trả 503 rõ ràng, không crash
 * ordering". Đơn CONFIRMED insert thẳng DB (không cần đi saga); container
 * invoice-service THẬT stop/start — đảm bảo start lại trong @AfterEach để
 * không phá test class khác (context chung + fixed host port 18090).
 */
class InvoiceDegradedTest extends AbstractSagaTest {

    @Autowired
    TestRestTemplate rest;

    @Autowired
    ObjectMapper om;

    @AfterEach
    void ensureInvoiceUp() {
        if (!INVOICE.isRunning()) {
            INVOICE.start();
        }
    }

    @Test
    void invoiceServiceDown_returnsClear503_withoutCrashing() throws Exception {
        String orderId = UUID.randomUUID().toString();
        String userId = UUID.randomUUID().toString();
        execOrdering("""
            INSERT INTO orders (id, user_id, email, status, subtotal, discount, shipping_fee, total,
                                currency, payment_method, shipping_method, address, timeline,
                                idempotency_key, payload_hash)
            VALUES ('%s', '%s', 'degraded@ecommerce.local', 'CONFIRMED', 100000, 0, 20000, 120000,
                    'VND', 'stripe', 'standard',
                    '{"fullName":"Lê Văn Degraded","phone":"0911222333","line1":"1 Hai Bà Trưng",
                      "ward":"Bến Nghé","district":"Quận 1","city":"TP. Hồ Chí Minh"}',
                    '[{"status":"PENDING","at":"2026-09-06T00:00:00Z"},
                      {"status":"PAID","at":"2026-09-06T00:01:00Z"},
                      {"status":"CONFIRMED","at":"2026-09-06T00:02:00Z"}]',
                    '%s', 'hash')
            """.formatted(orderId, userId, UUID.randomUUID()));

        // Invoice-service sống → 200 PDF
        ResponseEntity<byte[]> up = rest.exchange("/admin/orders/" + orderId + "/invoice",
            HttpMethod.GET, new HttpEntity<>(authAdmin()), byte[].class);
        assertThat(up.getStatusCode().value()).isEqualTo(200);

        // DỪNG invoice-service → 503 problem+json RÕ RÀNG, ordering không crash
        INVOICE.stop();
        ResponseEntity<String> down = rest.exchange("/admin/orders/" + orderId + "/invoice",
            HttpMethod.GET, new HttpEntity<>(authAdmin()), String.class);
        assertThat(down.getStatusCode().value())
            .as("degraded rõ ràng như Stripe (pack D18) — KHÔNG phải 500 mù").isEqualTo(503);
        assertThat(down.getHeaders().getContentType().toString()).startsWith("application/problem+json");
        assertThat(om.readTree(down.getBody()).path("title").asText()).isEqualTo("Service Unavailable");

        // Endpoint vẫn sống sau lỗi upstream (health ordering OK)
        ResponseEntity<String> health = rest.exchange("/actuator/health", HttpMethod.GET,
            new HttpEntity<>(authAdmin()), String.class);
        assertThat(health.getStatusCode().value()).isEqualTo(200);

        // Container sống lại → endpoint hồi phục (cùng số HĐ — đã cấp 1 lần)
        INVOICE.start();
        ResponseEntity<byte[]> recovered = rest.exchange("/admin/orders/" + orderId + "/invoice",
            HttpMethod.GET, new HttpEntity<>(authAdmin()), byte[].class);
        assertThat(recovered.getStatusCode().value()).isEqualTo(200);
    }

    private org.springframework.http.HttpHeaders authAdmin() {
        org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
        headers.setBearerAuth(adminJwt());
        return headers;
    }
}
