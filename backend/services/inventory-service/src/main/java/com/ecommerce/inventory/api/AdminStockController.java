package com.ecommerce.inventory.api;

import com.ecommerce.inventory.domain.Stock;
import com.ecommerce.inventory.repo.StockRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin set-stock (FI-397 demo follow-up) — PUT /inventory/admin/stocks:
 * upsert tồn kho theo variant. Catalog admin PUT variants KHÔNG sync stock
 * (catalog không sở hữu inventory — snake pattern "writer-supply"), form admin
 * gọi endpoint này NGAY SAU save product cho từng variant.
 *
 * <p>Guard 2 lớp: gateway admin-prefixes (/api/inventory/admin/**) +
 * SecurityConfig service-side {@code /inventory/admin/**} → ROLE_ADMIN.</p>
 */
@RestController
@RequestMapping("/inventory/admin")
public class AdminStockController {

    private final StockRepository stocks;

    public AdminStockController(StockRepository stocks) {
        this.stocks = stocks;
    }

    /** Body PUT — variantId bắt buộc; quantity >= 0 (0 = hợp lệ: chốt hết hàng). */
    public record SetStockRequest(String variantId, Integer quantity, String productId, String productName) {}

    @PutMapping("/stocks")
    public Stock setStock(@RequestBody SetStockRequest req) {
        if (req.variantId() == null || req.variantId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "variantId bắt buộc (non-blank)");
        }
        if (req.quantity() == null || req.quantity() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "quantity phải >= 0");
        }
        Stock s = stocks.findById(req.variantId()).orElse(null);
        if (s == null) {
            s = new Stock(req.variantId(), req.quantity(), 10, req.productId(), req.productName());
        } else {
            s.applyAdminSet(req.quantity(), req.productId(), req.productName());
        }
        return stocks.save(s);
    }

    /** Đọc 1 variant — form admin dùng sau save để confirm. */
    @GetMapping("/stocks/{variantId}")
    public Stock getStock(@PathVariable String variantId) {
        return stocks.findById(variantId).orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không có stock row cho variant"));
    }
}
