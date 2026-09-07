package com.ecommerce.identity.oauth;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Date;

/**
 * State OAuth (chống login CSRF): JWT HS256, claim `prv` = provider, TTL 5'.
 * Key SecureRandom PER-BOOT — state chỉ cần sống 1 round-trip authorize→callback
 * (30-60s), không thêm env; restart giữa chừng = flow đang dở phải thử lại (ok).
 * Callback BẮT BUỘC validate (chữ ký + exp + khớp provider) TRƯỚC khi đổi code
 * — state thiếu/sai → redirect FE ?error=state_mismatch, không bao giờ exchange.
 */
@Service
public class OAuthStateService {

    private static final long TTL_SECONDS = 300;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final MACSigner signer;
    private final MACVerifier verifier;

    public OAuthStateService() {
        byte[] key = new byte[32];
        RANDOM.nextBytes(key);
        try {
            this.signer = new MACSigner(key);
            this.verifier = new MACVerifier(key);
        } catch (JOSEException e) {
            throw new IllegalStateException("Khởi tạo state key lỗi", e);
        }
    }

    public String issue(String provider) {
        Instant now = Instant.now();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .subject("oauth-state")
            .claim("prv", provider)
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plusSeconds(TTL_SECONDS)))
            .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        try {
            jwt.sign(signer);
            return jwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Ký state OAuth lỗi", e);
        }
    }

    /** false nếu: parse lỗi / chữ ký sai / hết hạn / provider không khớp. */
    public boolean valid(String state, String provider) {
        if (state == null || state.isBlank()) return false;
        try {
            SignedJWT jwt = SignedJWT.parse(state);
            if (!jwt.verify(verifier)) return false;
            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            if (claims.getExpirationTime() == null
                || claims.getExpirationTime().toInstant().isBefore(Instant.now())) return false;
            return provider.equals(claims.getStringClaim("prv"));
        } catch (Exception parseOrVerify) {
            return false;
        }
    }
}
