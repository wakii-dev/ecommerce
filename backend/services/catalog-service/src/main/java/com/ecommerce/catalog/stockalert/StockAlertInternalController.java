package com.ecommerce.catalog.stockalert;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Internal stock-alert API (SF-15) cho notification restock-mailer — service
 * gọi TRỰC TIẾP :8082 (không qua gateway). Guard X-Internal-Token trong
 * service (path /api/catalog/** public ở gateway → không được permitAll mù).
 */
@RestController
public class StockAlertInternalController {

    public static final String TOKEN_HEADER = "X-Internal-Token";

    private final StockAlertService service;

    public StockAlertInternalController(StockAlertService service) {
        this.service = service;
    }

    @GetMapping("/api/catalog/internal/stock-alerts/candidates")
    public List<StockAlertService.Candidate> candidates(
        @RequestParam(defaultValue = "50") int limit,
        @RequestHeader(value = TOKEN_HEADER, required = false) String token) {
        service.requireToken(token);
        return service.candidates(limit);
    }

    public record ClaimRequest(List<UUID> ids) {}

    @PostMapping("/api/catalog/internal/stock-alerts/claim")
    public List<StockAlertService.Candidate> claim(@RequestBody ClaimRequest request,
                                                   @RequestHeader(value = TOKEN_HEADER, required = false) String token) {
        return service.claim(request == null ? List.of() : request.ids(), token);
    }
}
