package com.ecommerce.catalog.storage;

import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.minio.PutObjectArgs;
import io.minio.MinioClient;

/**
 * Lưu ảnh sản phẩm vào MinIO (SF-13 A3) — object key {@code <uuid>.<ext>}
 * trong bucket {@code products}, trả URL public {@code /media/products/<uuid>.<ext>}
 * (gateway route {@code /media/**} → MinIO rewrite {@code /media/<seg> → /<seg>}
 * → bucket products / object <seg>; bucket policy anonymous download).
 * Validate theo contract catalog.yaml: ≤5MB, chỉ jpg/png/webp.
 */
@Component
public class ProductStorage {

    static final long MAX_BYTES = 5L * 1024 * 1024;
    static final Set<String> ALLOWED_EXT = Set.of("jpg", "jpeg", "png", "webp");
    static final Set<String> ALLOWED_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    private final MinioClient client;
    private final String bucket;

    public ProductStorage(MinioClient client, @Value("${catalog.minio.bucket:products}") String bucket) {
        this.client = client;
        this.bucket = bucket;
    }

    /** Upload + trả URL public. Sai loại/quá cỡ → 400 problem+json; MinIO lỗi → 502. */
    public String upload(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw bad("File trống.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw bad("Ảnh vượt 5MB.");
        }
        String ext = ext(file.getOriginalFilename());
        if (!ALLOWED_EXT.contains(ext) || !ALLOWED_TYPES.contains(lower(file.getContentType()))) {
            throw bad("Chỉ chấp nhận ảnh jpg/png/webp.");
        }
        String key = UUID.randomUUID() + "." + ext;
        try {
            client.putObject(PutObjectArgs.builder()
                .bucket(bucket)
                .object(key)
                .stream(file.getInputStream(), file.getSize(), -1)
                .contentType(lower(file.getContentType()))
                .build());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Đọc file upload thất bại.", e);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Lưu ảnh vào MinIO thất bại.", e);
        }
        return "/media/" + bucket + "/" + key;
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static String lower(String v) {
        return v == null ? "" : v.toLowerCase(Locale.ROOT);
    }

    private static String ext(String filename) {
        if (filename == null) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }
}
