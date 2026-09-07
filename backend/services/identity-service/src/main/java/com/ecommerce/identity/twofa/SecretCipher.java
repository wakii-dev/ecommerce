package com.ecommerce.identity.twofa;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * AES-256-GCM cho secret TOTP at-rest (SF-15). Output = IV(12B) || ciphertext;
 * random IV mỗi lần encrypt. Key từ IDENTITY_2FA_KEY: profile dev/test/local
 * (hoặc không profile) thiếu key → fallback dev-key + WARN; mọi profile KHÁC
 * thiếu key → FAIL-FAST boot (code-review P1: không chạy 2FA với key im lặng
 * ở staging/prod).
 */
@Component
public class SecretCipher {

    private static final Logger log = LoggerFactory.getLogger(SecretCipher.class);
    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    public SecretCipher(TwoFactorProperties props, Environment env) {
        String base64 = props.encryptionKey();
        if (base64 == null || base64.isBlank()) {
            String[] profiles = env.getActiveProfiles();
            boolean devLike = profiles.length == 0 || Arrays.stream(profiles)
                .allMatch(p -> p.equals("dev") || p.equals("test") || p.equals("local"));
            if (!devLike) {
                throw new IllegalStateException(
                    "IDENTITY_2FA_KEY bắt buộc set ở profile " + Arrays.toString(profiles) + " — từ chối boot");
            }
            log.warn("[2fa] IDENTITY_2FA_KEY rỗng — dùng DEV-ONLY fallback key (KHÔNG dùng prod)");
            base64 = TwoFactorProperties.DEV_FALLBACK_KEY;
        }
        byte[] bytes = Base64.getDecoder().decode(base64);
        if (bytes.length != 32) {
            throw new IllegalStateException("IDENTITY_2FA_KEY phải là Base64 32 byte (openssl rand -base64 32)");
        }
        this.key = new SecretKeySpec(bytes, "AES");
    }

    public byte[] encrypt(byte[] plain) {
        try {
            byte[] iv = new byte[IV_LEN];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] sealed = cipher.doFinal(plain); // ciphertext + 16B GCM tag
            return ByteBuffer.allocate(iv.length + sealed.length)
                .put(iv).put(sealed).array();
        } catch (Exception e) {
            throw new IllegalStateException("Mã hóa secret 2FA lỗi", e);
        }
    }

    public byte[] decrypt(byte[] blob) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, blob, 0, IV_LEN));
            return cipher.doFinal(blob, IV_LEN, blob.length - IV_LEN);
        } catch (Exception e) {
            throw new IllegalStateException("Giải mã secret 2FA lỗi", e);
        }
    }
}
