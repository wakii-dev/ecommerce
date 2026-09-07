package com.ecommerce.inventory.config;

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
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;

/**
 * JWT decoder cho inventory guard (FI-366 SF-1 T10) — pattern copy từ catalog
 * {@code catalog.config.JwtDecoderConfig} (bản lean: bỏ PKCS#1 wrap — `make keys`
 * sinh X.509; giữ dual-mode + ancestor search).
 *
 * <ul>
 *   <li>env {@code SECURITY_JWKS_URI} set → JWKS remote identity; else RS256
 *       từ PEM {@code JWT_PUBLIC_KEY_PATH} (default {@code ../infra/keys/jwt-public.pem}).</li>
 *   <li>Role claim: {@code roles[]} / {@code role} / {@code scope|scp} chứa ADMIN →
 *       {@code ROLE_ADMIN}; token khác → không authority (403 admin).</li>
 * </ul>
 */
@Configuration
public class InventoryJwtDecoderConfig {

    private static final Logger log = LoggerFactory.getLogger(InventoryJwtDecoderConfig.class);

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
            // Token-exact match (catalog security-audit P1): không substring —
            // split whitespace/:/, rồi so từng token (least-privilege).
            if (scope instanceof String s
                && java.util.Arrays.stream(s.split("[\\s:,]+")).anyMatch("ADMIN"::equalsIgnoreCase)) {
                return true;
            }
        }
        return false;
    }

    private static boolean collectionContains(Object value) {
        return value instanceof Collection<?> collection
            && collection.stream().anyMatch(item -> "ADMIN".equalsIgnoreCase(String.valueOf(item)));
    }

    /**
     * Đọc PEM: path as-given, rồi so với TỪNG ancestor của user.dir (tối đa 5
     * cấp tới repo root) — spring-boot:run CWD = module dir, java -jar = repo
     * root, IT = target/it-keys/ absolute → đều tìm được.
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
                + " — chạy 'make keys' ở repo root hoặc set env đúng đường dẫn.");
        }
        return parsePublicKey(Files.readString(found));
    }

    static RSAPublicKey parsePublicKey(String pem) throws GeneralSecurityException {
        String base64 = pem
            .replaceAll("-----BEGIN [A-Z ]+-----", "")
            .replaceAll("-----END [A-Z ]+-----", "")
            .replaceAll("\\s", "");
        byte[] der = Base64.getDecoder().decode(base64);
        return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
    }
}
