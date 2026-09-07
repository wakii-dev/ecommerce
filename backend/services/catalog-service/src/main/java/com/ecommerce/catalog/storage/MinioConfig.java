package com.ecommerce.catalog.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.SetBucketPolicyArgs;

/**
 * MinIO client (SF-13 A3 — D21 upload ảnh). Endpoint compose service
 * {@code minio} (:9000). Client bean LUÔN tạo (build = lazy, không connect)
 * để {@link ProductStorage} injection không chết context khi MinIO tắt —
 * IT mặc định {@code catalog.minio.enabled=false} chỉ bỏ bucket-initializer
 * (không connect lúc boot); ensure-bucket soft-fail: MinIO tạm chết không
 * chặn service (upload sẽ 502 từng request cho tới khi bucket sẵn sàng).
 */
@Configuration
public class MinioConfig {

    private static final Logger log = LoggerFactory.getLogger(MinioConfig.class);

    @Bean
    public MinioClient minioClient(
            @Value("${catalog.minio.endpoint}") String endpoint,
            @Value("${catalog.minio.access-key}") String accessKey,
            @Value("${catalog.minio.secret-key}") String secretKey) {
        return MinioClient.builder()
            .endpoint(endpoint)
            .credentials(accessKey, secretKey)
            .build();
    }

    /** Idempotent: tạo bucket nếu thiếu + policy anonymous download — chỉ khi enabled. */
    @Bean
    @ConditionalOnProperty(name = "catalog.minio.enabled", havingValue = "true")
    public ApplicationRunner minioBucketInitializer(MinioClient client,
            @Value("${catalog.minio.bucket:products}") String bucket) {
        return args -> {
            try {
                if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                    client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
                }
                String policy = """
                    {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},\
                    "Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/*"]}]}\
                    """.formatted(bucket);
                client.setBucketPolicy(SetBucketPolicyArgs.builder().bucket(bucket).config(policy).build());
                log.info("MinIO bucket '{}' sẵn sàng (anonymous download)", bucket);
            } catch (Exception e) {
                log.error("MinIO bucket init fail (upload sẽ lỗi tới khi MinIO sống lại): {}", e.getMessage());
            }
        };
    }
}
