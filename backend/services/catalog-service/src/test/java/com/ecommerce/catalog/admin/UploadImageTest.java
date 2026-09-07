package com.ecommerce.catalog.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.testcontainers.containers.GenericContainer;

import com.ecommerce.catalog.AbstractIntegrationTest;

/**
 * IT upload ảnh MinIO (SF-13 A3 — Task 1). MinIO Testcontainer singleton
 * (pattern ES container); endpoint trỏ qua {@code catalog.minio.*}.
 * Khẳng định contract catalog.yaml: multipart field {@code image},
 * 201 {@code {url}} dạng {@code /media/products/<uuid>.<ext>}, object
 * đọc public được (bucket policy anonymous download), guard 401/403.
 */
class UploadImageTest extends AbstractIntegrationTest {

    static final GenericContainer<?> MINIO = new GenericContainer<>("minio/minio:RELEASE.2024-09-13T20-26-02Z")
        .withCommand("server /data")
        .withEnv("MINIO_ROOT_USER", "minioadmin")
        .withEnv("MINIO_ROOT_PASSWORD", "minioadmin")
        .withExposedPorts(9000);

    static {
        MINIO.start();
    }

    @DynamicPropertySource
    static void minio(DynamicPropertyRegistry registry) {
        registry.add("catalog.minio.enabled", () -> "true");
        registry.add("catalog.minio.endpoint", () -> "http://" + MINIO.getHost() + ":" + MINIO.getMappedPort(9000));
        registry.add("catalog.minio.access-key", () -> "minioadmin");
        registry.add("catalog.minio.secret-key", () -> "minioadmin");
    }

    @Autowired
    TestRestTemplate http;

    /** PNG 1×1 hợp lệ (signature + IHDR + IDAT + IEND). */
    static final byte[] PNG = new byte[] {
        (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, (byte) 0xC4,
        (byte) 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, (byte) 0x9C, 0x63, 0x00, 0x01, 0x00,
        0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, (byte) 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
        (byte) 0xAE, 0x42, 0x60, (byte) 0x82
    };

    @Test
    void adminUploadsPng_returns201_mediaUrl_objectPublicReadable() {
        ResponseEntity<String> res = upload(PNG, "photo.png", "image/png", "ADMIN");

        assertThat(res.getStatusCode().value()).isEqualTo(201);
        String url = jsonField(res.getBody(), "url");
        assertThat(url).matches("/media/products/[0-9a-f-]{36}\\.png");

        // Bucket policy anonymous download — GET thẳng MinIO (đường public gateway route) phải 200
        String direct = "http://" + MINIO.getHost() + ":" + MINIO.getMappedPort(9000)
            + url.replace("/media/", "/");
        ResponseEntity<byte[]> fetch = http.getRestTemplate().getForEntity(direct, byte[].class);
        assertThat(fetch.getStatusCode().value()).isEqualTo(200);
        assertThat(fetch.getBody()).isEqualTo(PNG);
    }

    @Test
    void gifFile_rejected400() {
        ResponseEntity<String> res = upload("GIF89a".getBytes(StandardCharsets.UTF_8), "x.gif", "image/gif", "ADMIN");
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void oversizedFile_rejected400() {
        byte[] big = new byte[5 * 1024 * 1024 + 1];
        ResponseEntity<String> res = upload(big, "big.png", "image/png", "ADMIN");
        assertThat(res.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void customerToken_forbidden403() {
        ResponseEntity<String> res = upload(PNG, "photo.png", "image/png", "CUSTOMER");
        assertThat(res.getStatusCode().value()).isEqualTo(403);
    }

    @Test
    void anonymous_unauthorized401() {
        ResponseEntity<String> res = upload(PNG, "photo.png", "image/png", null);
        assertThat(res.getStatusCode().value()).isEqualTo(401);
    }

    private ResponseEntity<String> upload(byte[] bytes, String filename, String contentType, String role) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        if (role != null) {
            headers.setBearerAuth(mintToken(role));
        }
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("image", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }
        });
        return http.exchange("/api/catalog/admin/uploads", HttpMethod.POST,
            new HttpEntity<>(body, headers), String.class,
            Map.of()); // URI vars trống — path không có placeholder
    }

    private String jsonField(String json, String field) {
        int i = json.indexOf("\"" + field + "\"");
        assertThat(i).as("field %s trong %s", field, json).isGreaterThan(-1);
        int colon = json.indexOf(':', i);
        int start = json.indexOf('"', colon);
        int end = json.indexOf('"', start + 1);
        return json.substring(start + 1, end);
    }
}
