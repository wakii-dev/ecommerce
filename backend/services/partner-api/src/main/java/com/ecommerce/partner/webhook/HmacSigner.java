package com.ecommerce.partner.webhook;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

/**
 * HMAC-SHA256 signer cho webhook — header {@code X-Signature} = hex LOWERCASE
 * của HMAC-SHA256(webhook_secret, rawBody). Raw body giữ nguyên lúc retry
 * (signature không đổi). Partner verify bằng cùng secret (docs portal có code
 * mẫu Java/Node/curl).
 */
public final class HmacSigner {

    private static final String ALGORITHM = "HmacSHA256";

    private HmacSigner() {
    }

    public static String sign(String secret, String body) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            return HexFormat.of().formatHex(
                mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 không khả dụng", e);
        }
    }

    /** So signature client gửi (case-insensitive hex) — MessageDigest.isEqual. */
    public static boolean verify(String secret, String body, String signatureHeader) {
        if (signatureHeader == null || signatureHeader.isBlank()) {
            return false;
        }
        byte[] expected = HexFormat.of().parseHex(sign(secret, body));
        byte[] provided;
        try {
            provided = HexFormat.of().parseHex(signatureHeader.trim().toLowerCase());
        } catch (IllegalArgumentException e) {
            return false;
        }
        return MessageDigest.isEqual(expected, provided);
    }
}
