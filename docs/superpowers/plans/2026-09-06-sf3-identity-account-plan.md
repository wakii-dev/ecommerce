# SF-3 identity + account — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng ký/đăng nhập end-to-end — identity-service (JWT RS256 + refresh rotation + RBAC + seed admin), gateway auth wiring (JWKS + admin guard), mfe-account remote (login/register/profile) trên federation harness, shell header auth widget.

**Architecture:** identity-service fork từ template (port 8081, db_identity, servlet stack); gateway verify JWT qua JWKS (WebFlux resource-server) với public-paths tập trung 1 file; FE dùng `packages/auth` singleton (access token in-memory + refresh cookie httpOnly, same-origin qua Vite proxy); mfe-account expose pages + đăng ký header widget từ bootstrap của remote.

**Tech Stack:** Java 21 · Spring Boot 3.3 · Spring Security oauth2-resource-server (Nimbus encode+decode RS256) · Flyway/Postgres · common-lib outbox · Spring Cloud Gateway (WebFlux) · Vite + @module-federation/vite · React 18 · pnpm/Turbo · vitest.

**Linear Issue:** FI-313 · **Spec:** `docs/superpowers/specs/2026-09-06-sf3-identity-account-design.md` (ĐỌC TRƯỚC — mọi quyết định có rationale ở đây)

**Convention pin cho TẤT CẢ task:**
- Commit: `<type>(<scope>): <imperative>` — vd `feat(identity): register/login/refresh APIs`. Stage từ `git status` (KHÔNG `git add -A` — bài học FI-312 mất invoice.yaml).
- KHÔNG đụng: `contracts/**`, `frontend/packages/{contracts,ui-kit,i18n}`, route block của service khác, file SF-4/5 (song song).
- Backend paths service-ngắn (gateway `StripPrefix=2`): controller map `/auth/**`, `/me`, `/admin/**`, `/.well-known/**`.
- pnpm-lock: chỉ regen bằng `pnpm -C frontend install` (không sửa tay).
- **Build serialized (coordinator chịu):** task song song chỉ OVERLAP giai đoạn EDIT; lệnh `mvn ... test` / `pnpm install|build` chạy DUY NHẤT 1 process tại 1 thời điểm (reactor backend/ + node_modules dùng chung — race khi 2 mvn cùng rebuild common-lib). Worker chỉ chạy build trong cửa sổ coordinator cấp.

---

### Task 1: identity-service scaffold — Flyway + JWT keys + security config + IT harness

**Files:**
- Modify: `backend/pom.xml` (append 1 module line)
- Create: `backend/services/identity-service/pom.xml`, `src/main/java/com/ecommerce/identity/IdentityServiceApplication.java`, `config/{JwtProperties,SecurityConfig}.java`, `security/PemKeys.java`, `user/{UserEntity,Role,UserRepository}.java`, `token/{RefreshTokenEntity,RefreshTokenRepository}.java`
- Create: `src/main/resources/application.yml`, `src/main/resources/db/migration/V1__users_roles_refresh.sql`
- Create: `src/test/java/com/ecommerce/identity/AbstractIntegrationTest.java`, `src/test/java/com/ecommerce/identity/IdentityScaffoldIntegrationTest.java`, `src/test/resources/docker-java.properties`

- [ ] **Step 1: Append module vào parent pom** — `backend/pom.xml`, trong `<modules>` thêm dòng (append-only, không đổi dòng khác):

```xml
    <module>services/identity-service</module>
```

- [ ] **Step 2: pom.xml của service** — `backend/services/identity-service/pom.xml` (copy structure template pom, đổi artifactId + thêm security deps):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>com.ecommerce</groupId>
    <artifactId>ecommerce-backend</artifactId>
    <version>0.1.0-SNAPSHOT</version>
    <relativePath>../../pom.xml</relativePath>
  </parent>

  <artifactId>identity-service</artifactId>
  <name>identity-service</name>
  <description>identity — register/login/refresh, JWT RS256, refresh rotation, JWKS, seed admin → db_identity</description>

  <dependencies>
    <dependency>
      <groupId>com.ecommerce</groupId>
      <artifactId>common-lib</artifactId>
    </dependency>

    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <!-- Auth: bcrypt + resource-server (Nimbus JwtEncoder/Decoder RS256 — D7 native) -->
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
    </dependency>

    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-database-postgresql</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>

    <dependency>
      <groupId>org.springdoc</groupId>
      <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    </dependency>

    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework.security</groupId>
      <artifactId>spring-security-test</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>junit-jupiter</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>postgresql</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>rabbitmq</artifactId>
      <scope>test</scope>
    </dependency>
    <!-- WebTestClient cho IT (identity là servlet stack — webflux CHỈ test scope) -->
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-webflux</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 3: Application + Flyway migration** — `V1__users_roles_refresh.sql` ĐÚNG schema spec §4.2:

```sql
-- users + refresh_tokens — SF-3 (pack pin; role single column, API expose roles[])
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(255) NOT NULL UNIQUE,
  password_hash varchar(100) NOT NULL,
  full_name     varchar(255) NOT NULL,
  phone         varchar(32),
  role          varchar(16)  NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER','ADMIN')),
  status        varchar(16)  NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

`IdentityServiceApplication.java`:

```java
package com.ecommerce.identity;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class IdentityServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(IdentityServiceApplication.class, args);
    }
}
```

- [ ] **Step 4: Entities + repositories** — `user/UserEntity.java`:

```java
package com.ecommerce.identity.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role = Role.CUSTOMER;

    @Column(nullable = false)
    private String status = "ACTIVE";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`user/Role.java`: `public enum Role { CUSTOMER, ADMIN }`
`user/UserRepository.java`:

```java
package com.ecommerce.identity.user;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<UserEntity, UUID> {
    Optional<UserEntity> findByEmail(String email);
    boolean existsByEmail(String email);

    @Query("""
           select u from UserEntity u
           where (cast(:q as string) is null
                       or lower(u.email) like lower(concat('%', :q, '%'))
                       or lower(u.fullName) like lower(concat('%', :q, '%')))
           """)
    Page<UserEntity> search(@Param("q") String q, Pageable pageable);
}
```

`token/RefreshTokenEntity.java` + `token/RefreshTokenRepository.java`:

```java
package com.ecommerce.identity.token;

import com.ecommerce.identity.user.UserEntity;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshTokenEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UserEntity getUser() { return user; }
    public void setUser(UserEntity user) { this.user = user; }
    public String getTokenHash() { return tokenHash; }
    public void setTokenHash(String tokenHash) { this.tokenHash = tokenHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
}
```

```java
package com.ecommerce.identity.token;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshTokenEntity, UUID> {
    Optional<RefreshTokenEntity> findByTokenHash(String tokenHash);
}
```

- [ ] **Step 5: PemKeys + JwtProperties + TokenService** — `security/PemKeys.java`:

```java
package com.ecommerce.identity.security;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/** Đọc PEM sinh bởi `make keys` (openssl genpkey = PKCS#8, pubout = SPKI). */
public final class PemKeys {
    private PemKeys() {}

    public static RSAPublicKey readPublicKey(Path path) {
        try {
            String pem = Files.readString(path);
            String body = pem.replaceAll("-----BEGIN PUBLIC KEY-----", "")
                .replaceAll("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được public key " + path, e);
        }
    }

    public static RSAPrivateKey readPrivateKey(Path path) {
        try {
            String pem = Files.readString(path);
            String body = pem.replaceAll("-----BEGIN PRIVATE KEY-----", "")
                .replaceAll("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            return (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được private key " + path, e);
        }
    }
}
```

`config/JwtProperties.java`:

```java
package com.ecommerce.identity.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Key từ `make keys` (infra/keys/ — make dev chạy từ backend/ nên default ../infra/...). */
@ConfigurationProperties(prefix = "identity.jwt")
public record JwtProperties(
    String privateKeyPath,
    String publicKeyPath,
    String kid,
    long accessTtlSeconds
) {}
```

`token/TokenService.java`:

```java
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
        this.publicJwk = new RSAKey.Builder(publicKey).keyID(props.kid()).build();
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
```

- [ ] **Step 6: SecurityConfig (service)** — `config/SecurityConfig.java`:

```java
package com.ecommerce.identity.config;

import com.ecommerce.identity.security.PemKeys;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;

import java.nio.file.Path;

/** Resource-server: verify token của chính mình bằng public key file. */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    JwtDecoder jwtDecoder(JwtProperties props) {
        return NimbusJwtDecoder.withPublicKey(PemKeys.readPublicKey(Path.of(props.publicKeyPath()))).build();
    }

    @Bean
    org.springframework.security.web.SecurityFilterChain filterChain(
        HttpSecurity http, JwtDecoder jwtDecoder) throws Exception {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");   // claim `role` → ROLE_<giá trị>
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);

        http.csrf(csrf -> csrf.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/auth/register", "/auth/login", "/auth/refresh", "/auth/logout",
                    "/.well-known/jwks.json",
                    "/actuator/health/**", "/actuator/info",
                    "/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)));
        return http.build();
    }
}
```

- [ ] **Step 7: application.yml** — `src/main/resources/application.yml` (copy cấu trúc template, đổi port/db + thêm identity.jwt):

```yaml
# identity :8081 · db_identity (D8). Path service-ngắn — gateway StripPrefix=2.
server:
  port: 8081

spring:
  application:
    name: identity-service
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5433/db_identity}
    username: ${SPRING_DATASOURCE_USERNAME:postgres}
    password: ${SPRING_DATASOURCE_PASSWORD:postgres}
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate
    properties:
      hibernate.jdbc.time_zone: UTC
  flyway:
    enabled: true
    locations: classpath:db/migration
  rabbitmq:
    host: ${RABBITMQ_HOST:localhost}
    port: ${RABBITMQ_PORT:5672}
    username: ${RABBITMQ_USER:guest}
    password: ${RABBITMQ_PASSWORD:guest}

# JWT RS256 — key sinh bằng `make keys` (make dev chạy `cd backend && mvn` nên
# default relative từ backend/ → ../infra/keys). PRODUCTION phải set env thật.
identity:
  jwt:
    private-key-path: ${JWT_PRIVATE_KEY_PATH:../infra/keys/jwt-private.pem}
    public-key-path: ${JWT_PUBLIC_KEY_PATH:../infra/keys/jwt-public.pem}
    kid: ${JWT_KID:identity-1}
    access-ttl-seconds: ${JWT_ACCESS_TTL_SECONDS:900}   # 15'
  refresh:
    ttl-days: ${IDENTITY_REFRESH_TTL_DAYS:30}
    cookie-path: ${IDENTITY_COOKIE_PATH:/api/identity}   # path của BROWSER (qua gateway)
  seed:
    admin-email: ${ADMIN_EMAIL:}        # rỗng = skip seed (dev có thể export từ .env)
    admin-password: ${ADMIN_PASSWORD:}

management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      probes:
        enabled: true
      show-details: always

springdoc:
  swagger-ui:
    path: /swagger-ui.html
  api-docs:
    path: /v3/api-docs

outbox:
  relay:
    exchange: ecommerce.events
    poll-interval-ms: 2000
    max-attempts: 5
    batch-size: 100
    enabled: true

logging:
  pattern:
    console: "%d{HH:mm:ss.SSS} %-5level [%thread] [req=%X{requestId:-}] %logger{36} - %msg%n"
```

LƯU Ý (đổi so với đoạn trên — seed mặc định RỖNG để tránh secret-in-code; chạy dev: `export $(grep -v '^#' ../.env | xargs)` hoặc set tay `ADMIN_EMAIL=admin@ecommerce.local ADMIN_PASSWORD=admin123 make dev svc=identity`. IT không phụ thuộc env này.)

- [ ] **Step 8: IT harness + scaffold IT** — `src/test/resources/docker-java.properties` copy Y NGUYÊN từ template (`api.version=1.44` — Docker 29 máy này bắt buộc). `AbstractIntegrationTest.java` — sinh keypair RSA trong test, viết PEM vào temp dir:

```java
package com.ecommerce.identity;

import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;

/**
 * IT harness identity — PG thật qua Testcontainers + RSA keypair sinh mỗi lần
 * chạy (viết PEM vào temp dir, trỏ identity.jwt.*-path). Tag "integration".
 */
@Tag("integration")
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class AbstractIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("db_identity")
        .withUsername("postgres")
        .withPassword("postgres");

    @LocalServerPort
    int port;

    static Path privateKeyPath;
    static Path publicKeyPath;

    private static void writeKeys() {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            KeyPair pair = gen.generateKeyPair();
            RSAPrivateCrtKey priv = (RSAPrivateCrtKey) pair.getPrivate();
            RSAPublicKey pubFromCrt = (RSAPublicKey) KeyFactory.getInstance("RSA")
                .generatePublic(new RSAPublicKeySpec(priv.getModulus(), priv.getPublicExponent()));

            Path tempDir = Files.createTempDirectory("identity-it-keys");
            privateKeyPath = tempDir.resolve("jwt-private.pem");
            publicKeyPath = tempDir.resolve("jwt-public.pem");
            Files.writeString(privateKeyPath, pem("PRIVATE KEY", priv.getEncoded()));
            Files.writeString(publicKeyPath, pem("PUBLIC KEY", pubFromCrt.getEncoded()));
        } catch (Exception e) {
            throw new IllegalStateException("Sinh key IT thất bại", e);
        }
    }

    private static String pem(String label, byte[] der) {
        String base64 = Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(der);
        return "-----BEGIN " + label + "-----\n" + base64 + "\n-----END " + label + "-----\n";
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        writeKeys(); // suppliers resolve LAZY — sinh key ở đây an toàn về ordering (không @TempDir method: JUnit 5.10 chỉ cho FIELD/PARAMETER)
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("management.health.rabbit.enabled", () -> "false");
        registry.add("identity.jwt.private-key-path", () -> privateKeyPath.toString());
        registry.add("identity.jwt.public-key-path", () -> publicKeyPath.toString());
        registry.add("identity.refresh.cookie-path", () -> "/identity"); // IT gọi thẳng service
    }
}
```

`IdentityScaffoldIntegrationTest.java`:

```java
package com.ecommerce.identity;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** Scaffold: context boot + Flyway tạo đúng 2 bảng + JWKS sẵn sàng. */
class IdentityScaffoldIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void flywayCreatedUsersAndRefreshTokens() {
        Integer users = jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = 'users'", Integer.class);
        Integer tokens = jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = 'refresh_tokens'", Integer.class);
        assertThat(users).isEqualTo(1);
        assertThat(tokens).isEqualTo(1);
    }

    @Test
    void jwksEndpointReturnsRsaKey() {
        org.springframework.test.web.reactive.server.WebTestClient client =
            org.springframework.test.web.reactive.server.WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + port).build();
        client.get().uri("/.well-known/jwks.json")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.keys[0].kty").isEqualTo("RSA")
            .jsonPath("$.keys[0].alg").isEqualTo("RS256")
            .jsonPath("$.keys[0].use").isEqualTo("sig")
            .jsonPath("$.keys[0].n").isNotEmpty()
            .jsonPath("$.keys[0].e").isNotEmpty();
    }
}
```

- [ ] **Step 9: Build + chạy IT** — `cd backend && mvn -pl services/identity-service -am test — LƯU Ý: test class PHẢI đuôi `*Test`/`*IntegrationTest` (surefire default includes, KHÔNG chạy `*IT`). Expected: BUILD SUCCESS, IT PASS (Docker phải chạy — đã healthy).

- [ ] **Step 10: Commit** — stage từ `git status`:

```bash
git add backend/pom.xml backend/services/identity-service
git commit -m "feat(identity): scaffold service — flyway users/refresh_tokens, RSA keys, security config, IT harness"
```

---

### Task 2: identity APIs — register/login/refresh/logout/me/patch-me/admin/seed + outbox

**Files:**
- Create: `user/dto` records (`RegisterRequest, LoginRequest, LoginSuccess, RefreshResponse, UserSummary, MeResponse, UpdateMeRequest, AdminUserDto, AdminUserPage`), `user/MeController.java`, `user/AdminUserController.java`, `token/RefreshTokenService.java`, `token/RefreshCookieProperties.java`, `auth/AuthController.java`, `auth/SeedAdmin.java`, `config/RefreshProperties.java`
- Test: `auth/AuthApiIT.java`, `auth/AdminApiIT.java`, `auth/SeedAdminIT.java`, `auth/OutboxIT.java`

- [ ] **Step 1: DTO records** (pack §4.2 — khớp contract identity.yaml):

```java
// auth/dto — package com.ecommerce.identity.auth (đặt cùng package AuthController)
public record RegisterRequest(
    @NotBlank @Email String email,
    @NotBlank @Size(min = 8, max = 100) String password,
    @NotBlank @Size(min = 1, max = 255) String fullName) {}

public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

public record UserSummary(UUID id, String email, String fullName, List<String> roles) {}

public record LoginSuccess(String accessToken, String tokenType, long expiresIn, UserSummary user) {}

public record RefreshResponse(String accessToken, long expiresIn) {}

public record MeResponse(UUID id, String email, String fullName, String phone, List<String> roles, boolean twoFactorEnabled) {}

public record UpdateMeRequest(@Size(min = 1, max = 255) String fullName, @Size(max = 32) String phone) {}

public record AdminUserDto(UUID id, String email, String fullName, List<String> roles, Instant createdAt) {}

public record AdminUserPage(List<AdminUserDto> items, int page, int size, int total) {}
```

- [ ] **Step 2: RefreshTokenService + cookie props** — `config/RefreshProperties.java`:

```java
@ConfigurationProperties(prefix = "identity.refresh")
public record RefreshProperties(int ttlDays, String cookiePath) {}
```

`token/RefreshTokenService.java`:

```java
package com.ecommerce.identity.token;

import com.ecommerce.identity.config.RefreshProperties;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Refresh token: raw 32 byte random (cookie) — DB chỉ giữ SHA-256 hex.
 * Rotation: refresh hợp lệ → revoke row cũ + cấp row mới (reuse row revoked → 401).
 */
@Service
public class RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final RefreshTokenRepository repository;
    private final UserRepository userRepository;
    private final RefreshProperties props;

    public RefreshTokenService(RefreshTokenRepository repository, UserRepository userRepository,
                               RefreshProperties props) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.props = props;
    }

    public record Rotated(UserEntity user, String newRawToken) {}

    @Transactional
    public String issue(UserEntity user) {
        String raw = newRawToken();
        RefreshTokenEntity entity = new RefreshTokenEntity();
        entity.setUser(user);
        entity.setTokenHash(sha256Hex(raw));
        entity.setExpiresAt(Instant.now().plus(Duration.ofDays(props.ttlDays())));
        repository.save(entity);
        return raw;
    }

    /** Verify + ROTATE: revoke row cũ, cấp token mới. Sai/hết hạn/đã revoke → 401. */
    @Transactional
    public Rotated rotate(String rawToken) {
        RefreshTokenEntity entity = repository.findByTokenHash(sha256Hex(rawToken))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token không hợp lệ"));
        if (entity.getRevokedAt() != null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token đã bị thu hồi");
        }
        if (entity.getExpiresAt().isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token đã hết hạn");
        }
        entity.setRevokedAt(Instant.now());
        UserEntity user = entity.getUser();
        String newRaw = issue(user);
        return new Rotated(user, newRaw);
    }

    /** Logout — idempotent. Trả false nếu token không tồn tại/hết hạn. */
    @Transactional
    public boolean revoke(String rawToken) {
        return repository.findByTokenHash(sha256Hex(rawToken))
            .map(entity -> {
                boolean wasActive = entity.getRevokedAt() == null
                    && entity.getExpiresAt().isAfter(Instant.now());
                if (entity.getRevokedAt() == null) entity.setRevokedAt(Instant.now());
                return wasActive;
            })
            .orElse(false);
    }

    public Duration ttl() {
        return Duration.ofDays(props.ttlDays());
    }

    public String cookiePath() {
        return props.cookiePath();
    }

    private String newRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

- [ ] **Step 3: AuthController** — register (tx + outbox), login, refresh, logout; cookie helper:

```java
package com.ecommerce.identity.auth;

import com.ecommerce.common.outbox.OutboxWriter;
import com.ecommerce.identity.config.RefreshProperties;
import com.ecommerce.identity.token.RefreshTokenService;
import com.ecommerce.identity.user.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {

    public static final String REFRESH_COOKIE = "refresh_token";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshProperties refreshProperties;
    private final OutboxWriter outboxWriter;
    private final ObjectMapper objectMapper;

    public AuthController(UserRepository userRepository, PasswordEncoder passwordEncoder,
                          TokenService tokenService, RefreshTokenService refreshTokenService,
                          RefreshProperties refreshProperties, OutboxWriter outboxWriter,
                          ObjectMapper objectMapper) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.refreshTokenService = refreshTokenService;
        this.refreshProperties = refreshProperties;
        this.outboxWriter = outboxWriter;
        this.objectMapper = objectMapper;
    }

    /** Đăng ký — 201 UserSummary (auto-login do FE gọi login sau). user.created qua outbox cùng tx. */
    @PostMapping("/register")
    @Transactional
    public ResponseEntity<UserSummary> register(
        @Valid @RequestBody RegisterRequest request,
        @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email đã tồn tại");
        }
        // RACE duplicate: unique constraint nổ → common-lib GlobalExceptionHandler
        // đã map DataIntegrityViolationException → 409 problem+json (không cần catch tại đây).
        UserEntity user = new UserEntity();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFullName(request.fullName().trim());
        user.setRole(Role.CUSTOMER);
        user = userRepository.save(user);

        JsonNode payload = objectMapper.valueToTree(Map.of(
            "userId", user.getId().toString(),
            "email", user.getEmail(),
            "fullName", user.getFullName(),
            "roles", List.of(user.getRole().name()),
            "createdAt", user.getCreatedAt().toString()));
        outboxWriter.write("user.created", payload, requestId);

        return ResponseEntity.status(HttpStatus.CREATED).body(toSummary(user));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginSuccess> login(@Valid @RequestBody LoginRequest request) {
        UserEntity user = userRepository.findByEmail(request.email().trim().toLowerCase())
            .filter(u -> passwordEncoder.matches(request.password(), u.getPasswordHash()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email hoặc mật khẩu không đúng"));
        String accessToken = tokenService.issue(user);
        String raw = refreshTokenService.issue(user);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(raw, refreshTokenService.ttl()).toString())
            .body(new LoginSuccess(accessToken, "Bearer", tokenService.accessTtlSeconds(), toSummary(user)));
    }

    /** KHÔNG body — đọc cookie. Rotate: revoke cũ + cấp mới (Set-Cookie mới). */
    @PostMapping("/refresh")
    public ResponseEntity<RefreshResponse> refresh(
        @CookieValue(value = REFRESH_COOKIE, required = false) String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thiếu refresh token");
        }
        RefreshTokenService.Rotated rotated = refreshTokenService.rotate(rawToken);
        UserEntity user = rotated.user();
        String accessToken = tokenService.issue(user);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, refreshCookie(rotated.newRawToken(), refreshTokenService.ttl()).toString())
            .body(new RefreshResponse(accessToken, tokenService.accessTtlSeconds()));
    }

    /** 204 + revoke + xóa cookie. Cookie thiếu/không hợp lệ → 401 (không revoked bậy). */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
        @CookieValue(value = REFRESH_COOKIE, required = false) String rawToken) {
        if (rawToken == null || rawToken.isBlank() || !refreshTokenService.revoke(rawToken)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token không hợp lệ");
        }
        ResponseCookie cleared = ResponseCookie.from(REFRESH_COOKIE, "")
            .httpOnly(true).sameSite("Lax").path(refreshProperties.cookiePath()).maxAge(0).build();
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, cleared.toString())
            .build();
    }

    private ResponseCookie refreshCookie(String raw, java.time.Duration ttl) {
        return ResponseCookie.from(REFRESH_COOKIE, raw)
            .httpOnly(true)
            .sameSite("Lax")
            .path(refreshProperties.cookiePath())
            .maxAge(ttl)
            .build();
    }

    static UserSummary toSummary(UserEntity user) {
        return new UserSummary(user.getId(), user.getEmail(), user.getFullName(), List.of(user.getRole().name()));
    }
}
```

- [ ] **Step 4: MeController + JwksController + AdminUserController**:

```java
// MeController.java (package user)
@RestController
public class MeController {

    private final UserRepository userRepository;

    public MeController(UserRepository userRepository) { this.userRepository = userRepository; }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return userRepository.findById(UUID.fromString(jwt.getSubject()))
            .map(MeController::toMe)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }

    /** GAP endpoint (REQUIREMENT-GAP FI-310) — amendment đề xuất PATCH /me + Me.phone. */
    @PatchMapping("/me")
    public MeResponse updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateMeRequest request) {
        UserEntity user = userRepository.findById(UUID.fromString(jwt.getSubject()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (request.fullName() != null) user.setFullName(request.fullName().trim());
        if (request.phone() != null) user.setPhone(request.phone().isBlank() ? null : request.phone().trim());
        return toMe(userRepository.save(user));
    }

    static MeResponse toMe(UserEntity user) {
        return new MeResponse(user.getId(), user.getEmail(), user.getFullName(), user.getPhone(),
            List.of(user.getRole().name()), false);
    }
}
// imports: org.springframework.security.core.annotation.AuthenticationPrincipal,
//          org.springframework.security.oauth2.jwt.Jwt, jakarta.validation.Valid,
//          org.springframework.web.bind.annotation.*, HttpStatus/ResponseStatusException
```

```java
// JwksController.java (package token)
@RestController
public class JwksController {
    private final TokenService tokenService;
    public JwksController(TokenService tokenService) { this.tokenService = tokenService; }

    @GetMapping("/.well-known/jwks.json")
    public Map<String, Object> jwks() { return tokenService.jwks(); }
}
```

```java
// AdminUserController.java (package user)
@RestController
@RequestMapping("/admin/users")
public class AdminUserController {

    private final UserRepository userRepository;
    public AdminUserController(UserRepository userRepository) { this.userRepository = userRepository; }

    /** RBAC 2 lớp: gateway guard /api/identity/admin/** + @PreAuthorize tại service (D7). */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public AdminUserPage list(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String q) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        int safePage = Math.max(page, 1);
        Page<UserEntity> result = userRepository.search(
            (q == null || q.isBlank()) ? null : q.trim(),
            PageRequest.of(safePage - 1, safeSize));
        List<AdminUserDto> items = result.getContent().stream()
            .map(u -> new AdminUserDto(u.getId(), u.getEmail(), u.getFullName(),
                List.of(u.getRole().name()), u.getCreatedAt()))
            .toList();
        return new AdminUserPage(items, safePage, safeSize, result.getTotalElements() >= Integer.MAX_VALUE
            ? Integer.MAX_VALUE : (int) result.getTotalElements());
    }
}
// imports: org.springframework.data.domain.{Page,PageRequest}, PreAuthorize, RequestParam...
```

- [ ] **Step 5: SeedAdmin** — ApplicationRunner idempotent, KHÔNG publish user.created, không log password:

```java
// auth/SeedAdmin.java
package com.ecommerce.identity.auth;

import com.ecommerce.identity.user.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Seed admin idempotent từ ADMIN_EMAIL/ADMIN_PASSWORD (yml default RỖNG = skip). */
@Component
public class SeedAdmin implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedAdmin.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SeedProperties props;

    public SeedAdmin(UserRepository userRepository, PasswordEncoder passwordEncoder, SeedProperties props) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (props.adminEmail() == null || props.adminEmail().isBlank()
            || props.adminPassword() == null || props.adminPassword().isBlank()) {
            log.info("[seed-admin] ADMIN_EMAIL/ADMIN_PASSWORD không set — bỏ qua seed");
            return;
        }
        String email = props.adminEmail().trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            log.info("[seed-admin] {} đã tồn tại — skip (idempotent)", email);
            return;
        }
        UserEntity admin = new UserEntity();
        admin.setEmail(email);
        admin.setPasswordHash(passwordEncoder.encode(props.adminPassword()));
        admin.setFullName("Admin");
        admin.setRole(Role.ADMIN);
        userRepository.save(admin);
        log.info("[seed-admin] đã tạo admin {}", email);
    }
}
// config/SeedProperties.java:
@ConfigurationProperties(prefix = "identity.seed")
public record SeedProperties(String adminEmail, String adminPassword) {}
```

(yml block `identity.seed` như Task 1 Step 7 đã có.)

- [ ] **Step 6: AuthApiIT** — matrix chính (helper: `register(email, name)` helper POST; đọc Set-Cookie bằng `returnResult(Void.class).getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE)`; helper `cookieValue(String setCookie)` tách raw sau `refresh_token=` đến `;` đầu tiên):

```java
package com.ecommerce.identity.auth;

import com.ecommerce.identity.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Đầy đủ luồng auth: register → login → refresh (rotate) → logout (revoke) → reuse 401. */
class AuthApiIntegrationTest extends AbstractIntegrationTest {

    static final AtomicInteger SEQ = new AtomicInteger();
    static final Pattern RAW_COOKIE = Pattern.compile("refresh_token=([^;]+)");

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    private String uniqueEmail() {
        return "user-" + SEQ.incrementAndGet() + "-" + System.nanoTime() + "@test.local";
    }

    private void register(String email, String fullName) {
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"%s\"}".formatted(email, fullName))
            .exchange().expectStatus().isCreated();
    }

    /** Login + trả Set-Cookie header (raw). */
    private String loginAndGetSetCookie(String email) {
        return client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email))
            .exchange().expectStatus().isOk()
            .returnResult(Void.class).getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE);
    }

    private static String rawCookie(String setCookie) {
        Matcher matcher = RAW_COOKIE.matcher(setCookie);
        assertThat(matcher.find()).as("Set-Cookie phải chứa refresh_token").isTrue();
        return matcher.group(1);
    }

    @Test
    void registerReturns201UserSummaryCustomer() {
        String email = uniqueEmail();
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"Nguyen Van A\"}".formatted(email))
            .exchange().expectStatus().isCreated()
            .expectBody()
            .jsonPath("$.id").isNotEmpty()
            .jsonPath("$.email").isEqualTo(email)
            .jsonPath("$.fullName").isEqualTo("Nguyen Van A")
            .jsonPath("$.roles[0]").isEqualTo("CUSTOMER");
    }

    @Test
    void registerDuplicateEmail409_andInvalidBody400() {
        String email = uniqueEmail();
        String body = "{\"email\":\"%s\",\"password\":\"password123\",\"fullName\":\"Dup\"}".formatted(email);
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue(body).exchange().expectStatus().isCreated();
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue(body).exchange().expectStatus().isEqualTo(409)
            .expectHeader().contentTypeCompatibleWith("application/problem+json");
        client().post().uri("/auth/register").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"not-an-email\",\"password\":\"short\",\"fullName\":\"\"}")
            .exchange().expectStatus().isBadRequest()
            .expectHeader().contentTypeCompatibleWith("application/problem+json");
    }

    @Test
    void loginReturnsBearerToken_andHttpOnlyRefreshCookie() {
        String email = uniqueEmail();
        register(email, "Nguyen Van B");
        String setCookie = loginAndGetSetCookie(email);
        assertThat(setCookie).contains("HttpOnly").contains("SameSite=Lax").contains("Max-Age=");
        client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email))
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.accessToken").isNotEmpty()
            .jsonPath("$.tokenType").isEqualTo("Bearer")
            .jsonPath("$.expiresIn").isEqualTo(900)
            .jsonPath("$.user.email").isEqualTo(email);
    }

    @Test
    void loginWrongPassword401() {
        String email = uniqueEmail();
        register(email, "Wrong Pass");
        client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"wrongpassword\"}".formatted(email))
            .exchange().expectStatus().isEqualTo(401)
            .expectHeader().contentTypeCompatibleWith("application/problem+json");
    }

    @Test
    void refreshRotates_oldTokenBecomes401() {
        String email = uniqueEmail();
        register(email, "Rotating User");
        String firstSetCookie = loginAndGetSetCookie(email);
        String firstRaw = rawCookie(firstSetCookie);

        var refreshed = client().post().uri("/auth/refresh").cookie("refresh_token", firstRaw)
            .exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.accessToken").isNotEmpty();
        String secondSetCookie = refreshed
            .returnResult(Void.class).getResponseHeaders().getFirst(HttpHeaders.SET_COOKIE);
        String secondRaw = rawCookie(secondSetCookie);
        assertThat(secondRaw).as("rotation cấp token MỚI").isNotEqualTo(firstRaw);

        client().post().uri("/auth/refresh").cookie("refresh_token", firstRaw)
            .exchange().expectStatus().isEqualTo(401);
    }

    @Test
    void logoutRevsokes_andReuseAfterLogout401() {
        String email = uniqueEmail();
        register(email, "Logout User");
        String raw = rawCookie(loginAndGetSetCookie(email));

        client().post().uri("/auth/logout").cookie("refresh_token", raw)
            .exchange().expectStatus().isNoContent();

        client().post().uri("/auth/refresh").cookie("refresh_token", raw)
            .exchange().expectStatus().isEqualTo(401);
        // cookie đã xóa (Max-Age=0)
    }

    @Test
    void refreshWithoutCookie401() {
        client().post().uri("/auth/refresh").exchange().expectStatus().isEqualTo(401);
    }

    @Test
    void meRequiresJwt_updateProfilePersists() {
        String email = uniqueEmail();
        register(email, "Profile User");
        String accessToken = client().post().uri("/auth/login").header("Content-Type", "application/json")
            .bodyValue("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email))
            .exchange().expectStatus().isOk()
            .expectBody().returnResult(Void.class).toString(); // executor: lấy body JSON $.accessToken qua decode

        client().get().uri("/me").exchange().expectStatus().isEqualTo(401);
        client().get().uri("/me").header("Authorization", "Bearer " + accessToken)
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.email").isEqualTo(email)
            .jsonPath("$.twoFactorEnabled").isEqualTo(false);

        client().patch().uri("/me").header("Authorization", "Bearer " + accessToken)
            .header("Content-Type", "application/json")
            .bodyValue("{\"fullName\":\"Ten Moi\",\"phone\":\"0901234567\"}")
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.fullName").isEqualTo("Ten Moi")
            .jsonPath("$.phone").isEqualTo("0901234567");

        client().get().uri("/me").header("Authorization", "Bearer " + accessToken)
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.fullName").isEqualTo("Ten Moi")
            .jsonPath("$.phone").isEqualTo("0901234567");
    }
}
```

**CHỈNH (executor):** test `meRequiresJwt` lấy `accessToken` từ body login — dùng `WebTestClient.BodyContentSpec` + `JsonPath.read` hoặc `expectBody(Map.class).returnResult().getResponseBody()` rồi `((Map<?,?>) body).get("accessToken").toString()`. Đoạn `returnResult(Void.class).toString()` ở trên là SAI — thay bằng cách đọc Map. Email normalize: thêm 1 case register `A@X.com` → login `a@x.com` OK.

- [ ] **Step 7: AdminApiIT + SeedAdminIT + OutboxIT**:

```java
// AdminApiIntegrationTest: tạo customer (register) + admin (save trực tiếp qua UserRepository + passwordEncoder)
// → customer token GET /admin/users → 403; admin token → 200 {items,page,size,total};
// ?q= tìm theo email/fullName; ?page=&size= phân trang (tạo 25 user → size=10 total=26...).
// Admin tạo: UserEntity admin=new UserEntity(); setEmail(unique); setPasswordHash(encoder.encode("admin123"));
//            setFullName("Admin"); setRole(Role.ADMIN); userRepository.save(admin);

// SeedAdminIntegrationTest: @SpringBootTest riêng với properties identity.seed.admin-email=admin@test.local
// admin-password=admin123 → context boot 2 lần (2 ApplicationRunner chạy) → đúng 1 admin trong DB
// (đếm bằng UserRepository.countByEmail("admin@test.local") == 1) → login /auth/login admin@test.local OK.

// OutboxIntegrationTest (đổi tên khỏi *IT — surefire default chỉ chạy *Test): extends AbstractIntegrationTest + RabbitMQContainer (copy pattern template
// OutboxIntegrationTest) → gọi AuthController.register qua WebTestClient → hàng outbox
// status=PENDING có envelope eventType=user.created, payload.userId = id từ response 201;
// outboxRelay.poll() → nhận message trên queue bind "user.created" → envelope nguyên vẹn.
```

- [ ] **Step 8: Chạy full IT** — `cd backend && mvn -pl services/identity-service -am test`. Expected: BUILD SUCCESS tất cả IT. Fail → 3-WHY trước khi fix (debugging discipline).

- [ ] **Step 9: Smoke chạy thật với compose infra** (keys + env):

```bash
make keys                                     # sinh infra/keys (đã có thì skip)
export ADMIN_EMAIL=admin@ecommerce.local ADMIN_PASSWORD=admin123
make dev svc=identity &                       # host JVM :8081
sleep 20
curl -s localhost:8081/actuator/health | grep -o '"status":"UP"'
curl -s -X POST localhost:8081/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"smoke@test.local","password":"password123","fullName":"Smoke"}' -o /dev/null -w '%{http_code}\n'   # 201
curl -s -X POST localhost:8081/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"smoke@test.local","password":"password123"}' | head -c 120
# (kiểm RabbitMQ UI :15672 thấy exchange ecommerce.events + row outbox SENT sau relay poll)
kill %1
```

- [ ] **Step 10: Commit** — `git add backend/services/identity-service && git commit -m "feat(identity): auth APIs — register/login/refresh rotation/logout/me/admin/seed + user.created outbox"`

---

### Task 3: Gateway auth wiring — route + JWKS filter + admin guard (song song được với Task 2)

**Files:**
- Modify: `backend/gateway/pom.xml` (+1 dep), `backend/gateway/src/main/resources/application.yml` (+config.import), `backend/gateway/src/main/java/com/ecommerce/gateway/config/CorsConfig.java` (+@Order)
- Create: `backend/gateway/src/main/resources/routes/identity.yml`, `backend/gateway/src/main/resources/routes/gateway-auth.yml`, `src/main/java/com/ecommerce/gateway/config/{GatewayAuthProperties,GatewaySecurityConfig}.java`
- Test: `backend/gateway/src/test/java/com/ecommerce/gateway/GatewayAuthIT.java`

- [ ] **Step 1: pom + config imports** — gateway pom thêm:

```xml
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
    </dependency>
```

`application.yml` — sửa dòng import (đổi 1 dòng duy nhất):

```yaml
  config:
    import:
      - optional:classpath:gateway-routes.yml
      - optional:classpath:routes/*.yml
      - optional:classpath:routes/gateway-auth.yml
```

- [ ] **Step 2: routes/identity.yml** (file MỚI — comment là hand-off cho SF-4/5):

```yaml
# ─────────────────────────────────────────────────────────────────────────────
# identity route — SF-3 (FI-313). File riêng PER-SERVICE (append-only: SF sau
# tự tạo routes/<svc>.yml, KHÔNG đụng file người khác).
# CONVENTION (ghi đè placeholder cũ trong gateway-routes.yml — giữ StripPrefix=2
# để service nhận path SAU /api/<svc> — springdoc/actuator của service sống ở
# root): uri=${<SVC>_URI:...} · predicate Path=/api/<svc>/** · StripPrefix=2.
# ─────────────────────────────────────────────────────────────────────────────
spring:
  cloud:
    gateway:
      routes:
        - id: identity
          uri: ${IDENTITY_URI:http://localhost:8081}
          predicates: [ "Path=/api/identity/**" ]
          filters: [ "StripPrefix=2" ]
```

- [ ] **Step 3: routes/gateway-auth.yml** (public-paths TẬP TRUNG 1 FILE — pack pin):

```yaml
# ─────────────────────────────────────────────────────────────────────────────
# GATEWAY AUTH POLICY — SF-3 (FI-313). Public paths + admin prefixes TẬP TRUNG
# ở ĐÂY. SF sau cần path public (vd webhook) → THÊM 1 DÒNG vào public-paths.
# JWT: verify RS256 qua JWKS identity (spec §3.4). Unauthenticated → 401;
# authenticated thiếu role trên admin-prefixes → 403 (authorization chạy
# TRƯỚC route dispatch — /api/admin/** chưa route vẫn 403, không 404).
# ─────────────────────────────────────────────────────────────────────────────
ecom:
  gateway:
    auth:
      # Mặc định đi QUA chính gateway (path public) — không phụ thuộc strip nội bộ.
      jwks-uri: ${IDENTITY_JWKS_URI:http://localhost:8080/api/identity/.well-known/jwks.json}
      public-paths:
        - /api/smoke
        - /actuator/**
        - /api/*/actuator/**
        - /api/identity/auth/register
        - /api/identity/auth/login
        - /api/identity/auth/refresh
        - /api/identity/auth/logout          # contract: cookie-only, không bearerAuth
        - /api/identity/.well-known/**
        - /api/catalog/**                    # guest browse — public từ SF-4
      admin-prefixes:
        - /api/admin/**                      # chữ ACCEPTANCE (path chưa route → 403 trước 404)
        - /api/identity/admin/**             # endpoint admin THẬT — D7 2 lớp (gateway + @PreAuthorize)
        # Convention SF sau: thêm prefix admin của service mình (vd /api/ordering/admin/**)
```

- [ ] **Step 4: GatewayAuthProperties + GatewaySecurityConfig**:

```java
// GatewayAuthProperties.java
package com.ecommerce.gateway.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@ConfigurationProperties(prefix = "ecom.gateway.auth")
public record GatewayAuthProperties(String jwksUri, List<String> publicPaths, List<String> adminPrefixes) {}
```

```java
// GatewaySecurityConfig.java
package com.ecommerce.gateway.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.server.SecurityWebFilterChain;
import reactor.core.publisher.Flux;

/** JWT RS256 qua JWKS identity + public-paths + admin guard (401/403 server-side). */
@Configuration
@EnableWebFluxSecurity
@EnableConfigurationProperties(GatewayAuthProperties.class)
public class GatewaySecurityConfig {

    @Bean
    SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http,
                                                     GatewayAuthProperties props,
                                                     ReactiveJwtDecoder jwtDecoder) {
        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName("role");
        authorities.setAuthorityPrefix("ROLE_");
        ReactiveJwtAuthenticationConverter converter = new ReactiveJwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt ->
            Flux.fromIterable(authorities.convert(jwt)));

        http.csrf(ServerHttpSecurity.CsrfSpec::disable)
            .authorizeExchange(exchange -> {
                props.publicPaths().forEach(path -> exchange.pathMatchers(path).permitAll());
                props.adminPrefixes().forEach(path -> exchange.pathMatchers(path).hasRole("ADMIN"));
                exchange.pathMatchers("/api/**").authenticated();
                exchange.anyExchange().permitAll();
            })
            .oauth2ResourceServer(o -> o.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)));
        return http.build();
    }

    @Bean
    ReactiveJwtDecoder jwtDecoder(GatewayAuthProperties props) {
        return NimbusReactiveJwtDecoder.withJwkSetUri(props.jwksUri()).build();
    }
}
```

- [ ] **Step 5: CorsConfig @Order** — sửa file SF-1 THÊM ĐÚNG 2 dòng (import + annotation trên bean). Lý do: security chain order -100, WebFilter không order chạy sau → preflight OPTIONS của API cần auth bị 401 TRƯỚC KHI CORS trả header. **Phần JWT/auth là của SF-3 — edit này thuộc wiring auth, các dòng khác KHÔNG đụng:**

```java
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public CorsWebFilter corsWebFilter() {
```

- [ ] **Step 6: GatewayAuthIT** — stub JWKS + identity bằng `com.sun.net.httpserver.HttpServer` (0 dep mới):

```java
package com.ecommerce.gateway;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * Auth tại gateway: JWKS stub + identity stub (HttpServer JDK).
 * admin token → /api/identity/admin/users 200 PASSTHROUGH stub;
 * customer token → 403 TỪ GATEWAY (không chạm stub — đếm request);
 * no token protected → 401; public paths → qua.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewayAuthIntegrationTest {

    @LocalServerPort int port;

    static HttpServer stub;
    static RSAKey rsaKey;
    static int stubPort;
    static final java.util.concurrent.atomic.AtomicInteger ADMIN_HITS = new java.util.concurrent.atomic.AtomicInteger();

    @BeforeAll
    static void startStub() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair pair = gen.generateKeyPair();
        rsaKey = new RSAKey.Builder((RSAPublicKey) pair.getPublic()).privateKey(pair.getPrivate())
            .keyID("gateway-test-1").build();

        stub = HttpServer.create(new InetSocketAddress(0), 0);
        stub.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            byte[] body;
            if (path.contains("/.well-known/jwks.json")) {
                body = new com.nimbusds.jose.jwk.JWKSet(rsaKey.toPublicJWK()).toString()
                    .getBytes(StandardCharsets.UTF_8);
            } else {
                ADMIN_HITS.incrementAndGet();
                body = "{\"service\":\"identity-stub\",\"path\":\"" + path + "\"}"
                    .getBytes(StandardCharsets.UTF_8);
            }
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(body); }
        });
        stub.start();
        stubPort = stub.getAddress().getPort();
    }

    @AfterAll
    static void stopStub() { stub.stop(0); }

    @DynamicPropertySource
    static void stubUris(DynamicPropertyRegistry registry) {
        // đăng ký SAU khi stub start — DynamicPropertySource chạy trước @BeforeAll,
        // nên stub phải start trong static init: dùng holder khởi tạo trong
        // static block (executor: chuyển startStub() vào static initializer để
        // stubPort sẵn sàng trước DynamicPropertySource).
        registry.add("IDENTITY_URI", () -> "http://localhost:" + stubPort);
        registry.add("IDENTITY_JWKS_URI", () -> "http://localhost:" + stubPort + "/.well-known/jwks.json");
    }

    WebTestClient client() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    static String token(String role) throws JOSEException {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
            .subject("11111111-1111-1111-1111-111111111111")
            .claim("role", role).claim("roles", List.of(role))
            .claim("email", role.toLowerCase() + "@test.local")
            .expirationTime(new java.util.Date(System.currentTimeMillis() + 60_000))
            .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("gateway-test-1").build(), claims);
        jwt.sign(new RSASSASigner(rsaKey.toRSAKey()));
        return jwt.serialize();
    }

    @Test
    void noTokenOnProtectedPath401() {
        client().get().uri("/api/identity/me").exchange().expectStatus().isEqualTo(401);
    }

    @Test
    void customerTokenOnIdentityAdmin403FromGateway() throws Exception {
        int before = ADMIN_HITS.get();
        client().get().uri("/api/identity/admin/users").header("Authorization", "Bearer " + token("CUSTOMER"))
            .exchange().expectStatus().isEqualTo(403);
        org.assertj.core.api.Assertions.assertThat(ADMIN_HITS.get())
            .as("403 phải đến từ gateway — không được chạm identity stub").isEqualTo(before);
    }

    @Test
    void adminTokenPassesGatewayToIdentity() throws Exception {
        client().get().uri("/api/identity/admin/users").header("Authorization", "Bearer " + token("ADMIN"))
            .exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.service").isEqualTo("identity-stub");
    }

    @Test
    void customerTokenOnRoutelessAdminPrefix403() throws Exception {
        client().get().uri("/api/admin/users").header("Authorization", "Bearer " + token("CUSTOMER"))
            .exchange().expectStatus().isEqualTo(403);
    }

    @Test
    void adminTokenOnRoutelessAdminPrefixNot401Or403() throws Exception {
        client().get().uri("/api/admin/users").header("Authorization", "Bearer " + token("ADMIN"))
            .exchange().expectStatus().value(s ->
                org.assertj.core.api.Assertions.assertThat(s).as("qua guard → 404 (không route)").isEqualTo(404));
    }

    @Test
    void publicPathsPassThroughWithoutToken() {
        client().post().uri("/api/identity/auth/login").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.service").isEqualTo("identity-stub");
        client().get().uri("/api/identity/.well-known/jwks.json").exchange().expectStatus().isOk();
        client().get().uri("/api/smoke").exchange().expectStatus().isOk();
    }

    @Test
    void corsPreflightOnProtectedPathNotBlockedByAuth() {
        client().options().uri("/api/identity/me")
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "GET")
            .exchange().expectStatus().isOk()
            .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:5173");
    }

    @Test
    void invalidSignatureToken401() throws Exception {
        // Ký bằng keypair KHÁC (không có trong JWKS stub) → signature fail → 401
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        var stranger = gen.generateKeyPair();
        JWTClaimsSet claims = new JWTClaimsSet.Builder().subject("x").claim("role", "ADMIN")
            .expirationTime(new java.util.Date(System.currentTimeMillis() + 60_000)).build();
        SignedJWT forged = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).build(), claims);
        forged.sign(new RSASSASigner((java.security.interfaces.RSAPrivateKey) stranger.getPrivate()));
        client().get().uri("/api/identity/me").header("Authorization", "Bearer " + forged.serialize())
            .exchange().expectStatus().isEqualTo(401);
    }
}
```

**CHỈNH (executor thực hiện):** `DynamicPropertySource` chạy TRƯỚC `@BeforeAll` — chuyển logic start-stub vào **static initializer** của class (sinh key + start server + set stubPort), để registry đọc đúng `stubPort`. Nhớ khai báo `GatewayApplication` thêm `@ConfigurationPropertiesScan` (hoặc `@EnableConfigurationProperties(GatewayAuthProperties.class)` đã có ở config — đủ).

- [ ] **Step 7: Chạy** — `cd backend && mvn -pl gateway -am test`. Expected: GatewaySmokeTest CŨ vẫn xanh (public /api/smoke) + GatewayAuthIntegrationTest 8 test xanh.

- [ ] **Step 8: Commit** — `git add backend/gateway && git commit -m "feat(gateway): JWT auth qua JWKS identity — public-paths tập trung, admin guard 403, route identity"`

---

### Task 4: packages/auth — login/register/logout/updateProfile (song song được với Task 1-3)

**Files:**
- Modify: `frontend/packages/auth/src/AuthStore.ts` (+identityBaseUrl field + getConfig()), `src/index.ts`, `package.json` (+dep contracts)
- Create: `frontend/packages/auth/src/api.ts`, `src/__tests__/api.test.ts`

- [ ] **Step 1: AuthStore.ts — 2 chỉnh additive** (không đổi logic cũ):

```ts
export interface AuthConfig {
  refreshUrl: string;
  loginPath?: string;
  /** Origin của API gateway — rỗng/không set = same-origin (Vite proxy). */
  identityBaseUrl?: string;
  fetchImpl?: typeof fetch;
}
```

và trong class AuthStore thêm getter (cạnh getLoginPath):

```ts
  /** Đọc config (api.ts dựng client từ đây) — readonly để caller không mutate. */
  getConfig(): Readonly<AuthConfig> {
    return this.config;
  }
```

- [ ] **Step 2: api.ts**:

```ts
// api.ts — API auth user-facing: login/register(auto-login)/logout/updateProfile.
// Client dựng TỪ authStore config; fetchImpl = authStore.fetch để 401 →
// single-flight refresh → retry (ACCEPTANCE 2 — executeRequest không tự refresh).

import { authStore, type AuthUser } from './AuthStore';
import {
  createIdentityClient,
  executeRequest,
  type ApiClientOptions,
  type IdentityClient
} from '@ecommerce/contracts';

export interface CredentialsInput {
  email: string;
  password: string;
}

export interface RegisterInput extends CredentialsInput {
  fullName: string;
}

export interface ProfileInput {
  fullName?: string;
  phone?: string | null;
}

export interface MeProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  roles: string[];
  twoFactorEnabled: boolean;
}

function clientOptions(): ApiClientOptions {
  const config = authStore.getConfig();
  return {
    baseURL: config.identityBaseUrl ?? '',
    getToken: () => authStore.getToken(),
    fetchImpl: (input, init) => authStore.fetch(input, init)
  };
}

// KHÔNG cache client: config (fetchImpl stub trong test) đổi qua configureAuth —
// dựng per-call (object rẻ). Cache sẽ bám stale fetchImpl của test đầu tiên.
function identity(): IdentityClient {
  return createIdentityClient(clientOptions());
}

function toAuthUser(): AuthUser {
  const user = authStore.getUser();
  if (!user) throw new Error('[auth] setToken xong nhưng không decode được user từ token');
  return user;
}

/** POST login → accessToken vào store. twoFactorRequired → throw (2FA là SF-15). */
export async function login({ email, password }: CredentialsInput): Promise<AuthUser> {
  const res = await identity().login({ email: email.trim().toLowerCase(), password });
  if ('twoFactorRequired' in res && (res as { twoFactorRequired?: boolean }).twoFactorRequired) {
    throw new Error('Đăng nhập hai lớp (2FA) chưa được hỗ trợ trong phiên bản này');
  }
  const success = res as { accessToken: string; user: { id: string; email: string; fullName: string; roles: string[] } };
  authStore.setToken(success.accessToken);
  return toAuthUser();
}

/** Đăng ký 201 → auto-login (gọi login với cùng credentials). */
export async function register({ email, password, fullName }: RegisterInput): Promise<AuthUser> {
  await identity().register({ email: email.trim().toLowerCase(), password, fullName: fullName.trim() });
  return login({ email, password });
}

/** POST logout (xóa refresh cookie server-side) + xóa state cục bộ. */
export async function logout(): Promise<void> {
  try {
    await identity().logout();
  } finally {
    authStore.logout();
  }
}

/** PATCH /api/identity/me — GAP endpoint (REQUIREMENT-GAP FI-310, chưa có trong generated client). */
export async function updateProfile(input: ProfileInput): Promise<MeProfile> {
  // PATCH chưa có trong generated client (GAP FI-310) → executeRequest với RouteDef local.
  return executeRequest(clientOptions(), ['PATCH', '/api/identity/me'], input) as Promise<MeProfile>;
}

/** GET /api/identity/me — prefill trang /account (dùng getMe của generated client). */
export async function fetchProfile(): Promise<MeProfile> {
  return identity().getMe({}) as Promise<MeProfile>;
}
```

- [ ] **Step 3: index.ts + package.json** — index thêm `export * from './api';` (đặt sau các export hiện có). package.json dependencies thêm `"@ecommerce/contracts": "workspace:*"`.

- [ ] **Step 4: api.test.ts** (pattern vitest hiện có của package — fetchImpl inject qua configureAuth):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore, configureAuth } from '../AuthStore';
import { login, register, logout, updateProfile } from '../api';

// Stub fetch: queue responses theo thứ tự gọi.
function stubFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('stubFetch hết response');
    return new Response(next.status === 204 ? null : JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  return { calls, impl };
}

const okJwt = `header.${btoa(JSON.stringify({ sub: 'u-1', role: 'CUSTOMER', roles: ['CUSTOMER'], email: 'a@x.com', fullName: 'A' })).replace(/=+$/, '')}.sig`;

describe('auth api', () => {
  beforeEach(() => configureAuth({ refreshUrl: '/api/identity/auth/refresh', identityBaseUrl: '' }));
  afterEach(() => authStore.logout());

  it('login set token + user từ claim', async () => {
    const { impl } = stubFetch([{ status: 200, body: { accessToken: okJwt, tokenType: 'Bearer', expiresIn: 900, user: {} } }]);
    configureAuth({ fetchImpl: impl });
    const user = await login({ email: 'a@x.com', password: 'password123' });
    expect(user.id).toBe('u-1');
    expect(user.roles).toEqual(['CUSTOMER']);
    expect(authStore.isAuthenticated()).toBe(true);
  });

  it('register auto-login (register 201 rồi login)', async () => {
    const { impl, calls } = stubFetch([
      { status: 201, body: { id: 'u-1', email: 'a@x.com', fullName: 'A', roles: ['CUSTOMER'] } },
      { status: 200, body: { accessToken: okJwt, tokenType: 'Bearer', expiresIn: 900, user: {} } }
    ]);
    configureAuth({ fetchImpl: impl });
    await register({ email: 'a@x.com', password: 'password123', fullName: 'A' });
    expect(calls[0].url).toContain('/api/identity/auth/register');
    expect(calls[1].url).toContain('/api/identity/auth/login');
    expect(authStore.isAuthenticated()).toBe(true);
  });

  it('401 → refresh đúng 1 lần → retry request', async () => {
    const { impl, calls } = stubFetch([
      { status: 401, body: { title: 'Unauthorized' } },          // PATCH /me lần đầu
      { status: 200, body: { accessToken: okJwt, expiresIn: 900 } }, // refresh
      { status: 200, body: { id: 'u-1', email: 'a@x.com', fullName: 'A2', roles: [], twoFactorEnabled: false } } // retry
    ]);
    configureAuth({ fetchImpl: impl });
    const me = await updateProfile({ fullName: 'A2' });
    expect(me.fullName).toBe('A2');
    const urls = calls.map((c) => c.url);
    expect(urls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith('/api/identity/me'))).toHaveLength(2);
  });

  it('logout clear state kể cả API fail', async () => {
    const { impl } = stubFetch([{ status: 401, body: { title: 'Unauthorized' } }]);
    configureAuth({ fetchImpl: impl });
    authStore.setToken(okJwt);
    await logout();
    expect(authStore.isAuthenticated()).toBe(false);
  });

  it('ApiErrorClient mang field errors', async () => {
    const { impl } = stubFetch([{ status: 409, body: { title: 'Conflict', detail: 'Email đã tồn tại', status: 409 } }]);
    configureAuth({ fetchImpl: impl });
    await expect(login({ email: 'dup@x.com', password: 'password123' })).rejects.toMatchObject({
      name: 'ApiErrorClient',
      status: 409
    });
  });
});
```

- [ ] **Step 5: Chạy** — `pnpm -C frontend install` (regen lockfile cho dep contracts mới của package) rồi `pnpm -C frontend --filter @ecommerce/auth test && pnpm -C frontend --filter @ecommerce/auth build`. Expected: PASS + tsc sạch.

- [ ] **Step 6: Commit** — `git add frontend/packages/auth && git commit -m "feat(auth): login/register/logout/updateProfile/fetchProfile API + identityBaseUrl config + 401-refresh-retry"`

---

### Task 5: mfe-account remote — scaffold + bootstrap + AuthWidget + 3 pages (dep Task 4)

**Files:**
- Create: `frontend/apps/mfe-account/{package.json,vite.config.ts,tsconfig.json,index.html}`, `src/{api.ts,main.tsx,bootstrap.tsx,AuthWidget.tsx,styles.css}`, `src/pages/{LoginPage,RegisterPage,AccountPage}.tsx`

- [ ] **Step 1: Scaffold** — copy structure `_skeleton-remote` (package.json đổi name `@ecommerce/mfe-account`, THÊM dep `"@ecommerce/contracts": "workspace:*"`). vite.config.ts:

```ts
// mfe-account — remote đăng nhập/đăng ký/profile (SF-3). Port 5176 (.env.example
// REMOTE_ACCOUNT_URL). Proxy /api → gateway: standalone dev cùng same-origin
// cookie (khi chạy dưới shell thì proxy của shell lo).
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

const mfeConfig = defineMfeConfig({
  name: 'mfe_account',
  exposes: {
    './bootstrap': './src/bootstrap.tsx',
    './AuthWidget': './src/AuthWidget.tsx',
    './LoginPage': './src/pages/LoginPage.tsx',
    './RegisterPage': './src/pages/RegisterPage.tsx',
    './AccountPage': './src/pages/AccountPage.tsx'
  }
});

export default defineConfig({
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: 5176,
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true }
    }
  }
});
```

- [ ] **Step 2: bootstrap.tsx** — đăng ký widget TỪ remote (ctx nhận registry từ host):

```tsx
import type { ComponentType } from 'react';
import { authStore, configureAuth } from '@ecommerce/auth';
import AuthWidget from './AuthWidget';

export type SlotKey = 'left' | 'center' | 'right';

/** Cắt INTERFACE tối thiểu của shell — remote không import code host (MF 1 chiều). */
export interface ShellContext {
  HeaderSlots: {
    register(slot: SlotKey, id: string, component: ComponentType): void;
    unregister(slot: SlotKey, id: string): void;
  };
  navigate: (to: string) => void;
  onRegistryChange?: () => void;
}

let navigateRef: ((to: string) => void) | null = null;
let readyResolve: ((authenticated: boolean) => void) | undefined;

/** Promise settle khi boot-refresh xong — AccountPage guard CHỜ promise này. */
export const authReady: Promise<boolean> = new Promise<boolean>((resolve) => {
  readyResolve = resolve;
});

/** Navigate qua router của shell (remote không mang router riêng vào host). */
export function appNavigate(to: string): void {
  navigateRef?.(to);
}

/** Shell gọi ĐÚNG 1 lần lúc boot (eager) — đăng ký auth widget + khôi phục phiên. */
export function initAccountShell(ctx: ShellContext): void {
  navigateRef = ctx.navigate;
  configureAuth({
    refreshUrl: '/api/identity/auth/refresh',
    identityBaseUrl: '',
    loginPath: '/login'
  });
  ctx.HeaderSlots.register('right', 'account-auth', AuthWidget);
  ctx.onRegistryChange?.();
  void authStore.refresh().then((ok) => readyResolve?.(ok));
}
```

- [ ] **Step 2b: src/api.ts** — re-export (pages/AuthWidget import `./api` / `../api`):

```ts
// mfe-account/src/api.ts — mỏng, chuyển tiếp từ packages/auth (singleton federation).
// Giữ 1 điểm import để sau này SF-8/9/12 thêm slice riêng (orders/wishlist/affiliate).
export {
  login,
  register,
  logout,
  updateProfile,
  fetchProfile
} from '@ecommerce/auth';
export type { RegisterInput, CredentialsInput, ProfileInput, MeProfile } from '@ecommerce/auth';
```

- [ ] **Step 3: AuthWidget.tsx** — guest links / user dropdown (ui-kit + tokens; `useAuth` reactive nhờ AuthProvider ở shell):

```tsx
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useAuth } from '@ecommerce/auth';
import { logout } from './api';
import { appNavigate } from './bootstrap';

function GuestLinks(): ReactElement {
  const go = (to: string) => (event: { preventDefault(): void }) => {
    event.preventDefault();
    appNavigate(to);
  };
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--space-3, 12px)', alignItems: 'center' }} data-testid="auth-guest">
      <a href="/login" onClick={go('/login')} style={{ color: 'var(--c-text, #212121)', fontSize: 'var(--text-md, 14px)', textDecoration: 'none' }}>
        Đăng nhập
      </a>
      <a href="/register" onClick={go('/register')}
        style={{ color: 'var(--c-primary, #F53D2D)', border: '1px solid var(--c-primary, #F53D2D)', borderRadius: 'var(--radius-sm, 2px)', padding: '5px 12px', fontSize: 'var(--text-md, 14px)', textDecoration: 'none', fontWeight: 600 }}>
        Đăng ký
      </a>
    </span>
  );
}

function UserMenu(): ReactElement {
  const { user, logout: clearLocal } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const displayName = user?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || 'Tài khoản';
  const item = (label: string, to?: string, action?: () => void): ReactElement => (
    <a
      href={to ?? '#'}
      onClick={(event) => {
        event.preventDefault();
        setOpen(false);
        action ? action() : to && appNavigate(to);
      }}
      style={{ display: 'block', padding: '9px 16px', fontSize: 'var(--text-md, 14px)', color: 'var(--c-text, #212121)', textDecoration: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#FAFAFA')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </a>
  );

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }} data-testid="auth-user">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text, #212121)', fontSize: 'var(--text-md, 14px)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        {displayName} <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <span
          role="menu"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--c-surface, #fff)', border: '1px solid var(--c-border, #eee)', borderRadius: 'var(--radius-md, 4px)', boxShadow: 'var(--shadow-2, 0 2px 8px rgba(0,0,0,.12))', minWidth: 180, zIndex: 1000, display: 'block', overflow: 'hidden' }}
        >
          {item('Tài khoản', '/account')}
          {item('Đơn hàng của tôi', '/account/orders')}
          {item('Đăng xuất', undefined, () => { void logout().then(() => clearLocal()).then(() => appNavigate('/login')); })}
        </span>
      ) : null}
    </span>
  );
}

export default function AuthWidget(): ReactElement {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <UserMenu /> : <GuestLinks />;
}
```

- [ ] **Step 4: pages** — theo direction A (ui-kit classes `uk-*` + tokens). `LoginPage.tsx`:

```tsx
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button, Input } from '@ecommerce/ui-kit';
import { login } from '../api';
import { appNavigate } from '../bootstrap';
import './page.css';
```
(Thân trang: card uk-card max-width 400, title "Đăng nhập" 24px/800, Input label Email/Mật khẩu (type password), Button primary fullWidth loading state, error banner (nền #FDEBEC chữ #C0151F radius-md) từ `err instanceof ApiErrorClient ? err.detail : 'Có lỗi xảy ra'`, client validation email format + password ≥8 hiện lỗi dưới field TRƯỚC submit (không gọi API), link "Chưa có tài khoản? Đăng ký" → appNavigate('/register'). Submit OK → `appNavigate('/account')`.)

`RegisterPage.tsx`: tương tự + field Họ tên; validation: email format, password ≥8, fullName ≥1; lỗi 409 → "Email đã tồn tại"; OK → auto-login → `/account`.

`AccountPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useAuth } from '@ecommerce/auth';
import { fetchProfile, updateProfile } from '../api';
import { appNavigate, authReady } from '../bootstrap';
```
(Guard: `useEffect(() => { let alive = true; authReady.then(ok => { if (alive && !ok) appNavigate('/login'); }); return () => { alive = false; }; }, [])`. Prefill: sau authReady OK → GET profile bằng `updateProfile({})`? KHÔNG — PATCH rỗng đụng data; thêm `fetchProfile()` vào packages/auth api.ts: `executeRequest(clientOptions(), ['GET', '/api/identity/me'], {})` (route GET /me — export `fetchProfile()` từ api.ts, thêm 5 dòng + 1 test). Form: fullName + phone (prefill), email + role badge (chỉ đọc — badge primary tint), Button Lưu loading, thành công → inline "Đã lưu" + authStore.setToken giữ nguyên (profile claim mới áp ở refresh sau — header tên vẫn đọc từ user hiện tại, gọi `authStore.setToken` KHÔNG đổi được claims → UI cập nhật tên qua state cục bộ dùng cho dropdown; đơn giản: hiện toast "Đã lưu" và update state fullName cục bộ).)

- [ ] **Step 5: main.tsx standalone** (debug khi chạy riêng :5176 — pattern skeleton, render LoginPage trong div center) + `page.css` (class `.auth-page` center, `.auth-card` max-width 400 — dùng tokens var, KHÔNG hex ngoài tokens).

- [ ] **Step 6: pnpm install + build + test**:

```bash
pnpm -C frontend install                      # regen lockfile (importer mfe-account)
pnpm -C frontend --filter @ecommerce/mfe-account build
pnpm -C frontend --filter @ecommerce/mfe-account exec tsc --noEmit
pnpm -C frontend --filter @ecommerce/auth test
```

- [ ] **Step 7: Smoke remote standalone + trong shell** (cần Task 6 xong cho shell — chạy lại ở Task 7):

```bash
make dev svc=identity &                        # nếu chưa
pnpm -C frontend --filter @ecommerce/shell dev &
pnpm -C frontend --filter @ecommerce/mfe-account dev &
sleep 6
# Mở http://localhost:5173/login — trang login render từ remote (kiem tab console sạch)
```

- [ ] **Step 8: Commit** — `git add frontend/apps/mfe-account frontend/pnpm-lock.yaml && git commit -m "feat(mfe-account): remote login/register/account + bootstrap đăng ký auth widget + pages theo direction A"`

---

### Task 6: Shell integration — manifest + routes + AuthProvider + proxy (dep Task 4, song song Task 5 được — names đã pin)

**Files:**
- Modify: `frontend/apps/shell/vite.config.ts`, `src/remotes.d.ts`, `src/App.tsx`, `src/main.tsx`

- [ ] **Step 1: vite.config.ts** — remotes thêm account + server proxy (giữ nguyên skeleton block):

```ts
import react from '@vitejs/plugin-react';
import { defineConfig, defineMfeConfig } from '@ecommerce/config/vite';

const mfeConfig = defineMfeConfig({
  name: 'shell_host',
  remotes: {
    skeleton: {
      type: 'module',
      name: 'mfe_skeleton',
      entry: `${process.env.REMOTE_SKELETON_URL ?? 'http://localhost:5178'}/remoteEntry.js`
    },
    account: {
      type: 'module',
      name: 'mfe_account',
      entry: `${process.env.REMOTE_ACCOUNT_URL ?? 'http://localhost:5176'}/remoteEntry.js`
    }
  }
});

export default defineConfig({
  ...mfeConfig,
  plugins: [react(), ...(mfeConfig.plugins ?? [])],
  server: {
    port: 5173,
    // Same-origin cho /api → cookie refresh_token hoạt động (SameSite=Lax).
    // Cross-origin fetch thẳng :8080 sẽ KHÔNG mang cookie → bắt buộc đi proxy.
    proxy: {
      '/api': { target: process.env.GATEWAY_URL ?? 'http://localhost:8080', changeOrigin: true }
    }
  }
});
```

- [ ] **Step 2: remotes.d.ts** — append declarations (đọc file hiện có trước, giữ nguyên phần skeleton):

```ts
declare module 'account/bootstrap' {
  export type SlotKey = 'left' | 'center' | 'right';
  export interface ShellContext {
    HeaderSlots: {
      register(slot: SlotKey, id: string, component: ComponentType): void;
      unregister(slot: SlotKey, id: string): void;
    };
    navigate: (to: string) => void;
    onRegistryChange?: () => void;
  }
  export const authReady: Promise<boolean>;
  export function initAccountShell(ctx: ShellContext): void;
  export function appNavigate(to: string): void;
}
declare module 'account/AuthWidget' { const c: import('react').ComponentType; export default c; }
declare module 'account/LoginPage' { const c: ComponentType; export default c; }
declare module 'account/RegisterPage' { const c: ComponentType; export default c; }
declare module 'account/AccountPage' { const c: ComponentType; export default c; }
```

- [ ] **Step 3: App.tsx** — AuthProvider + 3 routes lazy (ErrorBoundary cho từng remote page — fallback chung "mfe-account không chạy — `pnpm -C frontend --filter @ecommerce/mfe-account dev`"):

```tsx
// imports thêm: AuthProvider từ '@ecommerce/auth'; lazy pages từ 'account/LoginPage' v.v.
const AccountLoginPage = lazy(() => import('account/LoginPage'));
const AccountRegisterPage = lazy(() => import('account/RegisterPage'));
const AccountPage = lazy(() => import('account/AccountPage'));

// Trong App():
//   path '/login'    → ErrorBoundary + Suspense → AccountLoginPage
//   path '/register' → ... AccountRegisterPage
//   path '/account'  → ... AccountPage
//   return (<AuthProvider><Header /><main ...>{page}</main></AuthProvider>)
// Listener slot-registry từ bootstrap remote (App giữ bump useReducer hiện có):
useEffect(() => {
  const bump = () => bumpRegistry();
  window.addEventListener('ecommerce:header-slots-changed', bump);
  return () => window.removeEventListener('ecommerce:header-slots-changed', bump);
}, [bumpRegistry]);
```

- [ ] **Step 4: main.tsx** — eager bootstrap sau ShellNav register (KHÔNG chặn render nếu remote down):

```tsx
// Sau HeaderSlots.register('left', 'shell-nav', ShellNav):
const onHeaderSlotsChanged = (): void => {
  window.dispatchEvent(new CustomEvent('ecommerce:header-slots-changed'));
};
import('account/bootstrap')
  .then((m) => m.initAccountShell({ HeaderSlots, navigate, onRegistryChange: onHeaderSlotsChanged }))
  .catch((error) => console.warn('[shell] mfe-account chưa chạy — auth widget tạm vắng:', error.message));
// navigate import từ './router' (shell dùng chính router của mình truyền vào remote)
```

- [ ] **Step 5: tsc + build** — `pnpm -C frontend --filter @ecommerce/shell build`. Expected: sạch.

- [ ] **Step 6: Commit** — `git add frontend/apps/shell && git commit -m "feat(shell): account remote manifest + auth routes + AuthProvider + /api proxy + eager bootstrap"`

---

### Task 7: Full build + integration xanh + stack chạy thật (dep T2, T3, T5, T6)

- [ ] **Step 1:** `cd backend && mvn -am -pl services/identity-service,gateway test` — BUILD SUCCESS (IntegrationTests + smoke).
- [ ] **Step 2:** `pnpm -C frontend exec turbo build test` — sạch (tất cả workspace).
- [ ] **Step 3:** fix mọi fail phát hiện (3-WHY mỗi lỗi; attempt-log qua `~/.claude/bin/story-attempt log`).
- [ ] **Step 4: Bật stack thật cho Task 8** (tất cả process chạy nền, log ra /tmp):

```bash
make keys                                   # infra/keys (đã có thì skip)
export ADMIN_EMAIL=admin@ecommerce.local ADMIN_PASSWORD=admin123
# ⚠ KHÔNG `source .env` nguyên khối: .env ghi JWT_PRIVATE_KEY_PATH=infra/keys/...
# (repo root) — make dev chạy từ backend/ nên default yml `../infra/keys/...` MỚI đúng.
# Chỉ export ADMIN_* (seed admin cho flow 5).
make dev svc=identity > /tmp/identity.log 2>&1 &
make dev svc=gateway  > /tmp/gateway.log 2>&1 &
pnpm -C frontend --filter @ecommerce/mfe-account dev > /tmp/mfe-account.log 2>&1 &
pnpm -C frontend --filter @ecommerce/shell dev       > /tmp/shell.log 2>&1 &
sleep 20
curl -s localhost:8081/actuator/health | grep -o '"status":"UP"'
curl -s localhost:8080/actuator/health | grep -o '"status":"UP"'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/login     # 200 (vite serve)
curl -s -X POST localhost:8080/api/identity/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"smoke2@test.local","password":"password123","fullName":"Smoke"}' -o /dev/null -w '%{http_code}\n'  # 201 QUA GATEWAY
```

- [ ] **Step 5:** commit nếu có fix — `fix(sf-3): ...`. Giữ stack chạy cho Task 8.

### Task 8: BROWSER VERIFY Rule 0 (3 tầng) + verify ACCEPTANCE pack (dep Task 7)

- [ ] **Step 0: Cửa sổ browser** — `orca tab create --url http://localhost:5173` (app shell), identity + gateway + shell + mfe-account đang chạy (Task 7 smoke).
- [ ] **Step 1 (DOM):** snapshot `/login` — đủ Input email/password + Button; `/register` đủ 3 field; header có `data-testid="auth-guest"`.
- [ ] **Step 2 (VISUAL):** screenshot login + register + account + header guest vs logged-in → so direction A (card center, primary #F53D2D, error tint) — lưu PNG evidence.
- [ ] **Step 3 (FLOW — đi trọn, KHÔNG curl thay UI):**
  1. Register user mới qua UI → tự vào `/account`, header hiện tên
  2. F5 tại `/account` → vẫn đăng nhập (boot refresh), KHÔNG ném về /login (guard chờ authReady)
  3. Sửa fullName + phone → Lưu → thấy "Đã lưu" → F5 → vẫn mới (prefill từ GET /me có phone)
  4. Đăng xuất → header về guest → `/account` truy cập lại → về /login
  5. Login `admin@ecommerce.local`/`admin123` (seed) → header tên Admin
  6. **403 server-side:** console fetch `/api/admin/users` và `/api/identity/admin/users` với token customer → cả hai **403 từ gateway**; với token admin → `/api/identity/admin/users` 200
  7. Logout admin → reuse cookie cũ (curl POST /api/identity/auth/refresh với cookie cũ thu trước đó) → **401**
  8. Auto-refresh (cơ chế): IT chứng minh 401→refresh→retry; browser chỉ chứng minh refresh-on-boot (cùng code path — TTL 15' không chờ thật, nói rõ trong report)
- [ ] **Step 4:** FAIL gì → fix → đi lại flow → PASS hết → `touch .browser-test-passed` (nếu script yêu cầu).
- [ ] **Step 5:** commit evidence/docs nếu có — sau đó KHÔNG commit nữa trước story-verify (bài học SF-2: commit muộn làm B4 FAIL).

---

## Verification (pack ACCEPTANCE → bằng chứng)

| # | ACCEPTANCE | Bằng chứng |
|---|---|---|
| 1 | Register → login, header tên; F5 giữ phiên | Task 8 flow 1-2 + AuthApiIT + vitest register auto-login |
| 2 | Token hết hạn tự refresh, user không thấy lỗi | vitest 401→refresh→retry + IT refresh rotate; browser refresh-on-boot |
| 3 | Customer → /api/admin/** 403 TỪ GATEWAY | GatewayAuthIT (customer 403 không chạm stub) + browser console fetch 403 |
| 4 | Admin seed login; logout reuse 401 | SeedAdminIT + Task 8 flow 5-7 |
| 5 | /account sửa được fullName/phone | Task 8 flow 3 + IT PATCH /me + prefill phone |
