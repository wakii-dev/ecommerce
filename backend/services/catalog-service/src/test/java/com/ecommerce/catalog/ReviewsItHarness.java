package com.ecommerce.catalog;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;

/**
 * Harness cho IT slice reviews/wishlist (SF-8) — PHẢI cùng package
 * {@code com.ecommerce.catalog} với base vì {@code JWT_KEY_PAIR} là
 * package-private (không subclass-visible xuyên package — plan-critic P1).
 * IT reviews/wishlist (package con) extends class này để mint token với
 * {@code sub} tùy ý (2 user khác nhau cho verified-purchase test) + đọc port
 * server IT — KHÔNG sửa file SF-4 (b64url/port private hay package-private
 * ở base đều không với tới từ package con).
 */
public abstract class ReviewsItHarness extends AbstractIntegrationTest {

    /** Port server IT RANDOM — package con không đọc được {@code port} trực tiếp. */
    protected int httpPort() {
        return port;
    }

    /** Mint JWT RS256 với sub chỉ định — ký bằng keypair IT của base harness. */
    protected static String mintTokenFor(String subject, String role) {
        try {
            String header = b64url("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
            long now = Instant.now().getEpochSecond();
            String payload = b64url(("{\"sub\":\"" + subject + "\",\"roles\":[\"" + role + "\"],\"iat\":" + now
                + ",\"exp\":" + (now + 3600) + "}").getBytes(StandardCharsets.UTF_8));
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(JWT_KEY_PAIR.getPrivate());
            signer.update((header + "." + payload).getBytes(StandardCharsets.US_ASCII));
            return header + "." + payload + "." + b64url(signer.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("mint token fail", e);
        }
    }

    private static String b64url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
