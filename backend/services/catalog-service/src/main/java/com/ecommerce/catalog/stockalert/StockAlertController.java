package com.ecommerce.catalog.stockalert;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Set;
import java.util.UUID;

/**
 * Public stock-alert (SF-15) — POST /api/catalog/products/{slug}/stock-alert
 * (freeze contracts/catalog.yaml: 202 + 400 + 404). Path FULL prefix
 * (Conventions #11 — gateway không StripPrefix).
 */
@RestController
public class StockAlertController {

    private final StockAlertService service;

    public StockAlertController(StockAlertService service) {
        this.service = service;
    }

    @PostMapping("/api/catalog/products/{slug}/stock-alert")
    public ResponseEntity<Void> register(@PathVariable String slug,
                                         @RequestBody StockAlertService.RegisterRequest request) {
        UUID variantId = request == null ? null : request.variantId();
        service.register(slug, request == null ? null : request.email(), variantId);
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }
}
