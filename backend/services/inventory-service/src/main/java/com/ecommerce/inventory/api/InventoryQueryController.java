package com.ecommerce.inventory.api;

import com.ecommerce.inventory.repo.InventoryQueryRepository;
import com.ecommerce.inventory.repo.LowStockView;
import com.ecommerce.inventory.repo.VariantAvailabilityView;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Query APIs — path không prefix `/api` (gateway StripPrefix=1).
 * `/inventory/availability` cho PDP/storefront (SF-4 gọi); `/inventory/admin/low-stock`
 * cho dashboard admin (SF-7 gọi) — RBAC do gateway wire ở SF-3 (pack: không cần identity).
 */
@RestController
@RequestMapping("/inventory")
public class InventoryQueryController {

    private final InventoryQueryRepository queries;
    private final int defaultLowStockThreshold;

    public InventoryQueryController(
        InventoryQueryRepository queries,
        @Value("${inventory.low-stock-threshold:10}") int defaultLowStockThreshold
    ) {
        this.queries = queries;
        this.defaultLowStockThreshold = defaultLowStockThreshold;
    }

    /** `?variantIds=a,b,c` (form explode=false — Spring tách comma tự động). Cap 100 (DoS bound — security-audit L-2). */
    @GetMapping("/availability")
    public List<VariantAvailabilityView> availability(@RequestParam List<String> variantIds) {
        if (variantIds.size() > 100) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST, "Tối đa 100 variantIds mỗi request");
        }
        return queries.findAvailability(variantIds);
    }

    @GetMapping("/admin/low-stock")
    public List<LowStockView> lowStock(@RequestParam(required = false) Integer threshold) {
        int effective = threshold != null ? threshold : defaultLowStockThreshold;
        // Clamp — threshold khổng lồ dump cả bảng (security-audit L-3); dashboard
        // thật không bao giờ cần > 10000
        effective = Math.min(effective, 10_000);
        return queries.findLowStock(effective);
    }
}
