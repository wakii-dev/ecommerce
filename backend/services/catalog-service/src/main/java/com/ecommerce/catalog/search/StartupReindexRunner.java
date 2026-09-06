package com.ecommerce.catalog.search;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Reindex lúc startup (plan Task 5, §5.9): chạy SAU SeedDataRunner
 * ({@code @Order(2)} vs seed {@code @Order(1)}) — seed xong rồi index. Chỉ có
 * nghĩa khi engine đang là EsEngine (PgFts no-op → skip, đỡ log nhầm).
 * KHÔNG BAO GIỜ crash startup: reindexAll tự swallow, nhưng vẫn bọc try/catch
 * phòng lỗi ngoài lớp IO (D15 + review P2 group 3) — ES chết sau seed chỉ mất
 * index, service vẫn phục vụ qua PgFts.
 */
@Component
@ConditionalOnProperty(name = "catalog.reindex.enabled", havingValue = "true", matchIfMissing = true)
@Order(2)
public class StartupReindexRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupReindexRunner.class);

    private final SearchEngine searchEngine;

    public StartupReindexRunner(SearchEngine searchEngine) {
        this.searchEngine = searchEngine;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!(searchEngine instanceof EsEngine)) {
            log.info("Startup reindex BỎ QUA — engine={} (không cần index ngoài)", searchEngine.name());
            return;
        }
        try {
            searchEngine.reindexAll();
            log.info("Startup reindex xong (engine=es)");
        } catch (Exception e) {
            log.error("Startup reindex lỗi — service vẫn chạy, PgFts phục vụ khi ES down", e);
        }
    }
}
