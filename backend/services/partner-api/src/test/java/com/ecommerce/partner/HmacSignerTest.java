package com.ecommerce.partner;

import com.ecommerce.partner.webhook.HmacSigner;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Task 5 unit — HMAC-SHA256 hex lowercase: vector chuẩn RFC-4231-style
 * (key "key" × "The quick brown fox...") + verify path (đúng header, sai,
 * thiếu, hex hoa).
 */
class HmacSignerTest {

    private static final String BODY = "The quick brown fox jumps over the lazy dog";
    private static final String EXPECTED =
        "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

    @Test
    void sign_matchesKnownVector_lowercaseHex() {
        assertThat(HmacSigner.sign("key", BODY)).isEqualTo(EXPECTED);
    }

    @Test
    void verify_acceptsCorrectSignature_caseInsensitive() {
        assertThat(HmacSigner.verify("key", BODY, EXPECTED)).isTrue();
        assertThat(HmacSigner.verify("key", BODY, EXPECTED.toUpperCase())).isTrue();
    }

    @Test
    void verify_rejectsWrongSecretBodyOrHeader() {
        assertThat(HmacSigner.verify("khác", BODY, EXPECTED)).isFalse();
        assertThat(HmacSigner.verify("key", BODY + " ", EXPECTED)).isFalse();
        assertThat(HmacSigner.verify("key", BODY, "zzzz")).isFalse();
        assertThat(HmacSigner.verify("key", BODY, null)).isFalse();
        assertThat(HmacSigner.verify("key", BODY, "")).isFalse();
    }
}
