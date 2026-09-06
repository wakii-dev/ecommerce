package com.ecommerce.catalog.cache;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.ecommerce.catalog.web.dto.CategoryDto;
import com.ecommerce.catalog.web.dto.ProductDetailDto;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Cache-aside Redis cho catalog đọc public (plan Task 7, spec Q13):
 * <ul>
 *   <li>PDP detail — key {@code cat:prod:{slugVi}:{locale}}, TTL 600s.
 *       Canonical key là {@code slugVi} gốc CẢ 2 locale (lookup qua slug_en
 *       đã resolve entity ở {@code CatalogQueryService} trước khi tới đây).</li>
 *   <li>Category tree — key {@code cat:cat-tree:{locale}}, TTL 1800s.</li>
 *   <li>{@code cat:home:*} KHÔNG có — home listing do Next.js ISR cache
 *       (revalidate 60s); backend double-cache = YAGNI (deviation plan Task 7,
 *       coordinator duyệt trong dispatch).</li>
 * </ul>
 *
 * <p><strong>§5 error handling:</strong> MỌI redis op bọc try/catch — Redis
 * chết → log WARN rate-limited (1 lần/phút), BYPASS cache, serve từ nguồn
 * (supplier), KHÔNG BAO GIỜ throw ra đọc path. Stale sau invalidate-fail tự
 * hết theo TTL (chi tiết tối đa 600s — cùng tradeoff "ack không requeue" của
 * ProductIndexer).</p>
 */
@Component
public class CatalogCacheService {

    private static final Logger log = LoggerFactory.getLogger(CatalogCacheService.class);

    public static final String DETAIL_KEY_PREFIX = "cat:prod:";
    public static final String TREE_KEY_PREFIX = "cat:cat-tree:";

    static final Duration DETAIL_TTL = Duration.ofSeconds(600);
    static final Duration TREE_TTL = Duration.ofSeconds(1800);

    private static final long WARN_INTERVAL_MS = 60_000;

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final AtomicLong lastWarnAt = new AtomicLong();

    public CatalogCacheService(StringRedisTemplate redis, ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    /** PDP — {@code loader} chỉ chạy khi miss/Redis chết. */
    public ProductDetailDto getOrLoadDetail(String slugVi, String locale, Supplier<ProductDetailDto> loader) {
        return getOrLoad(detailKey(slugVi, locale), DETAIL_TTL, new TypeReference<ProductDetailDto>() {}, loader);
    }

    /** Cây danh mục — 1 key theo locale, value JSON List<CategoryDto>. */
    public List<CategoryDto> getOrLoadCategoryTree(String locale, Supplier<List<CategoryDto>> loader) {
        return getOrLoad(TREE_KEY_PREFIX + locale, TREE_TTL, new TypeReference<List<CategoryDto>>() {}, loader);
    }

    /** Xóa mọi key {@code cat:prod:{slug}:*} (mọi locale) — invalidate consumer gọi. */
    public void deleteProductKeys(String slug) {
        deleteByPattern(DETAIL_KEY_PREFIX + slug + ":*");
    }

    public static String detailKey(String slugVi, String locale) {
        return DETAIL_KEY_PREFIX + slugVi + ":" + locale;
    }

    // ── core ─────────────────────────────────────────────────────────────────

    private <T> T getOrLoad(String key, Duration ttl, TypeReference<T> type, Supplier<T> loader) {
        String json = read(key);
        if (json != null) {
            try {
                return objectMapper.readValue(json, type);
            } catch (Exception corrupt) {
                log.debug("[cache] JSON hỏng ở {} — bỏ qua, load lại từ nguồn", key);
            }
        }
        T fresh = loader.get();
        write(key, fresh, ttl);
        return fresh;
    }

    private String read(String key) {
        try {
            return redis.opsForValue().get(key);
        } catch (Exception e) {
            warnRedisDown("get " + key, e);
            return null; // bypass — loader phục vụ
        }
    }

    private void write(String key, Object value, Duration ttl) {
        try {
            redis.opsForValue().set(key, objectMapper.writeValueAsString(value), ttl);
        } catch (Exception e) {
            warnRedisDown("set " + key, e); // serialize fail cũng rơi đây — response đã phục vụ xong
        }
    }

    /**
     * Xóa theo pattern qua <strong>SCAN</strong> (KHÔNG dùng {@code KEYS} —
     * chặn single-thread Redis): iterate cursor count 200 rồi delete batch.
     *
     * <p><strong>Tradeoff đã kiểm chứng bằng IT:</strong> cursor SCAN trên
     * lettuce shared native connection có thể starve khi serving traffic mượn
     * connection liên tục (giới hạn API SDR — dedicated connection không expose
     * public); khi starve, lettuce command timeout (mặc định 60s) buông lock,
     * op trả kết quả/exception → catch WARN bên dưới. Invalidations HIẾM (mỗi
     * product.changed) + TTL 600s là backstop nên chấp nhận — không tự viết
     * connection pool riêng cho 1 op.</p>
     */
    public void deleteByPattern(String pattern) {
        try {
            List<String> matched = new ArrayList<>();
            redis.execute((RedisCallback<Void>) connection -> {
                try (Cursor<byte[]> cursor = connection.keyCommands()
                        .scan(ScanOptions.scanOptions().match(pattern).count(200).build())) {
                    cursor.forEachRemaining(k -> matched.add(new String(k, StandardCharsets.UTF_8)));
                }
                return null;
            });
            if (!matched.isEmpty()) {
                redis.delete(matched);
            }
        } catch (Exception e) {
            warnRedisDown("delete " + pattern, e);
        }
    }

    /** WARN ghim 1 lần/phút — Redis chết không spam log, không throw (§5 bypass). */
    private void warnRedisDown(String op, Exception e) {
        long now = System.currentTimeMillis();
        long last = lastWarnAt.get();
        if (now - last >= WARN_INTERVAL_MS && lastWarnAt.compareAndSet(last, now)) {
            log.warn("[cache] Redis lỗi ở {} — bypass cache, serve từ nguồn (WARN ghim 1 phút)", op, e);
        } else {
            log.debug("[cache] Redis lỗi ở {} — bypass", op, e);
        }
    }
}
