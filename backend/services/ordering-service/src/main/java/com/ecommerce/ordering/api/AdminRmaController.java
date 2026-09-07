package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.RmaDtos.RmaDto;
import com.ecommerce.ordering.api.dto.RmaDtos.RmaPageDto;
import com.ecommerce.ordering.domain.RmaStatus;
import com.ecommerce.ordering.service.RmaAdminService;
import org.springframework.data.domain.Page;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Admin RMA APIs (D22) — paths SAU StripPrefix=2 (contract /api/ordering/admin/rma).
 * 2 lớp guard: gateway admin-prefix + @PreAuthorize (pattern AdminOrderController).
 */
@RestController
@RequestMapping("/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminRmaController {

    private final RmaAdminService service;

    public AdminRmaController(RmaAdminService service) {
        this.service = service;
    }

    /** GET /admin/rma?status= — queue, filter status (contract adminListRmas). */
    @GetMapping("/rma")
    public RmaPageDto list(@RequestParam(required = false) RmaStatus status,
                           @RequestParam(defaultValue = "1") int page,
                           @RequestParam(defaultValue = "20") int size) {
        Page<RmaDto> result = service.list(status, page, size);
        return RmaPageDto.of(result);
    }

    /** POST /admin/rma/{id}/approve — REQUESTED → APPROVED (contract). */
    @PostMapping("/rma/{id}/approve")
    public RmaDto approve(@PathVariable UUID id) {
        return service.approve(id);
    }

    /** POST /admin/rma/{id}/reject — REQUESTED → REJECTED terminal (contract). */
    @PostMapping("/rma/{id}/reject")
    public RmaDto reject(@PathVariable UUID id) {
        return service.reject(id);
    }

    /** POST /admin/rma/{id}/mark-received — APPROVED → RECEIVED (contract). */
    @PostMapping("/rma/{id}/mark-received")
    public RmaDto markReceived(@PathVariable UUID id) {
        return service.markReceived(id);
    }

    /** POST /admin/rma/{id}/refund — RECEIVED → REFUNDED, server gọi payment (contract). */
    @PostMapping("/rma/{id}/refund")
    public RmaDto refund(@PathVariable UUID id) {
        return service.refund(id);
    }
}
