package com.ecommerce.identity.token;

import com.ecommerce.identity.config.JwtProperties;
import com.ecommerce.identity.security.PemKeys;
import com.ecommerce.identity.user.UserEntity;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import org.springframework.stereotype.Service;

import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * Ký access JWT RS256 + JWKS. Claims: sub, role (string cho converter
 * ROLE_*), roles (array — AuthStore FE đọc), email, fullName.
 */
@Service
public class TokenService {

    private final JwtProperties props;
    private final RSASSASigner signer;
    private final RSAKey publicJwk;

    public TokenService(JwtProperties props) {
        this.props = props;
        var privateKey = PemKeys.readPrivateKey(java.nio.file.Path.of(props.privateKeyPath()));
        RSAPublicKey publicKey = PemKeys.readPublicKey(java.nio.file.Path.of(props.publicKeyPath()));
        this.signer = new RSASSASigner(privateKey);
        // use+alg set tường minh — JWKS của gateway cần đủ (test assert `use`=sig, `alg`=RS256)
        this.publicJwk = new RSAKey.Builder(publicKey)
            .keyID(props.kid())
            .keyUse(KeyUse.SIGNATURE)
            .algorithm(JWSAlgorithm.RS256)
            .build();
    }

    public String issue(UserEntity user) {
        Instant now = Instant.now();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .subject(user.getId().toString())
            .claim("role", user.getRole().name())
            .claim("roles", List.of(user.getRole().name()))
            .claim("email", user.getEmail())
            .claim("fullName", user.getFullName())
            .issueTime(Date.from(now))
            .expirationTime(Date.from(now.plusSeconds(props.accessTtlSeconds())))
            .build();
        SignedJWT jwt = new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(props.kid()).build(), claims);
        try {
            jwt.sign(signer);
        } catch (JOSEException e) {
            throw new IllegalStateException("Ký JWT thất bại", e);
        }
        return jwt.serialize();
    }

    /** RFC 7517 JWKS — gateway + services verify qua đây. */
    public Map<String, Object> jwks() {
        return new JWKSet(publicJwk.toPublicJWK()).toJSONObject(true);
    }

    public long accessTtlSeconds() {
        return props.accessTtlSeconds();
    }
}
