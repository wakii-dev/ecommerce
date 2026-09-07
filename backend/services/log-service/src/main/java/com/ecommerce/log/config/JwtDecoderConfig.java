package com.ecommerce.log.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;

/**
 * JWT decoder (spec Q4) — identity SF-3 chưa merge nên decode local:
 * env {@code SECURITY_JWKS_URI} set → JWKS remote (SF-3+); else RS256 từ PEM
 * {@code JWT_PUBLIC_KEY_PATH} (default {@code ../infra/keys/jwt-public.pem} —
 * {@code make dev} chạy CWD {@code backend/}).
 *
 * <p>Role claim đọc linh hoạt: {@code roles[]} array / {@code role} string /
 * {@code scope|scp} chứa {@code ADMIN} → authority {@code ROLE_ADMIN}
 * (khớp token identity sau này; dev mint bằng {@code mint-admin-token.sh}).</p>
 */
@Configuration
public class JwtDecoderConfig {

    private static final Logger log = LoggerFactory.getLogger(JwtDecoderConfig.class);

    @Value("${SECURITY_JWKS_URI:}")
    private String jwksUri;

    @Value("${JWT_PUBLIC_KEY_PATH:../infra/keys/jwt-public.pem}")
    private String publicKeyPath;

    @Bean
    JwtDecoder jwtDecoder() throws GeneralSecurityException, IOException {
        if (jwksUri != null && !jwksUri.isBlank()) {
            log.info("JwtDecoder: JWKS remote {}", jwksUri);
            return NimbusJwtDecoder.withJwkSetUri(jwksUri).build();
        }
        RSAPublicKey key = readPublicKey(publicKeyPath);
        log.info("JwtDecoder: RS256 từ PEM ({} bits)", key.getModulus().bitLength());
        return NimbusJwtDecoder.withPublicKey(key).build();
    }

    /** roles[] / role / scope|scp chứa ADMIN → ROLE_ADMIN; token khác → không authority (403 admin). */
    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(this::extractAuthorities);
        return converter;
    }

    private Collection<GrantedAuthority> extractAuthorities(Jwt jwt) {
        if (hasAdminClaim(jwt.getClaims())) {
            return List.of(new SimpleGrantedAuthority("ROLE_ADMIN"));
        }
        return List.of();
    }

    static boolean hasAdminClaim(Map<String, Object> claims) {
        if (collectionContains(claims.get("roles"))) {
            return true;
        }
        Object role = claims.get("role");
        if (role != null && "ADMIN".equalsIgnoreCase(String.valueOf(role))) {
            return true;
        }
        for (String key : List.of("scope", "scp")) {
            if (collectionContains(claims.get(key))) {
                return true;
            }
            Object scope = claims.get(key);
            // Exact-token match (security-audit P1): substring match trước đây cho
            // "catalog-admin:read" → ROLE_ADMIN toàn quyền. Split theo whitespace/":"/","
            // rồi so từng token — least-privilege khi SF-3 phát scope granular.
            if (scope instanceof String s && scopeTokens(s).anyMatch("ADMIN"::equalsIgnoreCase)) {
                return true;
            }
        }
        return false;
    }

    private static java.util.stream.Stream<String> scopeTokens(String scope) {
        return java.util.Arrays.stream(scope.split("[\\s:,]+"))
            .filter(token -> !token.isBlank());
    }

    private static boolean collectionContains(Object value) {
        return value instanceof Collection<?> collection
            && collection.stream().anyMatch(item -> "ADMIN".equalsIgnoreCase(String.valueOf(item)));
    }

    /**
     * Đọc PEM public key: thử path as-given, rồi as-given so với TỪNG ancestor
     * của user.dir (spring-boot:run chạy CWD = module dir, make dev = backend/,
     * jar = tùy — walk tối đa 5 cấp tới repo root), không thấy → fail rõ ràng.
     */
    static RSAPublicKey readPublicKey(String configured) throws GeneralSecurityException, IOException {
        List<Path> candidates = new ArrayList<>();
        candidates.add(Path.of(configured));
        Path dir = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        for (int i = 0; i < 5 && dir != null; i++) {
            candidates.add(dir.resolve(configured));
            dir = dir.getParent();
        }
        Path found = candidates.stream().filter(Files::isRegularFile).findFirst().orElse(null);
        if (found == null) {
            throw new IllegalStateException("Không đọc được JWT public key JWT_PUBLIC_KEY_PATH=" + configured
                + " (đã thử: " + candidates.stream().map(p -> p.toAbsolutePath().toString())
                    .distinct().collect(java.util.stream.Collectors.joining(", "))
                + ") — chạy 'make keys' ở repo root hoặc set env đúng đường dẫn.");
        }
        if (!found.equals(candidates.get(0))) {
            log.warn("JWT public key không có ở '{}' — dùng fallback '{}'",
                candidates.get(0).toAbsolutePath(), found.toAbsolutePath());
        }
        return parsePublicKey(Files.readString(found));
    }

    /** Parse PEM: nhận cả X.509 "BEGIN PUBLIC KEY" lẫn PKCS#1 "BEGIN RSA PUBLIC KEY" (wrap thành X.509). */
    static RSAPublicKey parsePublicKey(String pem) throws GeneralSecurityException {
        String base64 = pem
            .replaceAll("-----BEGIN [A-Z ]+-----", "")
            .replaceAll("-----END [A-Z ]+-----", "")
            .replaceAll("\\s", "");
        byte[] der = Base64.getDecoder().decode(base64);
        if (pem.contains("BEGIN RSA PUBLIC KEY")) { // PKCS#1 → bọc ASN.1 X.509 SubjectPublicKeyInfo
            der = wrapPkcs1InX509(der);
        }
        return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
    }

    private static byte[] wrapPkcs1InX509(byte[] pkcs1) {
        byte[] algorithmId = {0x06, 0x09, 0x2a, (byte) 0x86, 0x48, (byte) 0x86, (byte) 0xf7, 0x0d,
            0x01, 0x01, 0x01, 0x05, 0x00}; // SEQUENCE { OID rsaEncryption, NULL }
        byte[] subjectPublicKey = asn1(0x03, concat(new byte[] {0x00}, pkcs1)); // BIT STRING (unused-bits = 0)
        return asn1(0x30, concat(asn1(0x30, algorithmId), subjectPublicKey));
    }

    private static byte[] asn1(int tag, byte[] content) {
        if (content == null) {
            throw new IllegalArgumentException("content null");
        }
        byte[] length = derLength(content.length);
        byte[] out = new byte[1 + length.length + content.length];
        out[0] = (byte) tag;
        System.arraycopy(length, 0, out, 1, length.length);
        System.arraycopy(content, 0, out, 1 + length.length, content.length);
        return out;
    }

    private static byte[] derLength(int size) {
        if (size < 0x80) {
            return new byte[] {(byte) size};
        }
        if (size < 0x100) {
            return new byte[] {(byte) 0x81, (byte) size};
        }
        return new byte[] {(byte) 0x82, (byte) (size >> 8), (byte) size};
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }
}
