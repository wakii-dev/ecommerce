package com.ecommerce.affiliate.api;

import com.ecommerce.affiliate.api.dto.AffiliateDtos.AdminStatsResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.AffiliateProfileResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.PageResponse;
import com.ecommerce.affiliate.api.dto.AffiliateDtos.UpdateRateRequest;
import com.ecommerce.affiliate.domain.AffiliateStatus;
import com.ecommerce.affiliate.service.AffiliateService;
import com.ecommerce.affiliate.service.LedgerService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Admin API affiliate (contract affiliate.yaml, tag "admin") — 2 lớp RBAC:
 * gateway admin-prefix /api/affiliate/admin/** + @PreAuthorize ở đây.
 * suspend/reactivate là endpoint ADDITIVE (acceptance pack — requiremen-gap
 * đã note FI-310; contract file KHÔNG đổi).
 */
@RestController
@RequestMapping("/api/affiliate/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAffiliateController {

    private final AffiliateService affiliateService;
    private final LedgerService ledgerService;

    public AdminAffiliateController(AffiliateService affiliateService, LedgerService ledgerService) {
        this.affiliateService = affiliateService;
        this.ledgerService = ledgerService;
    }

    /** GET /api/affiliate/admin/affiliates?status=&page= — danh sách hồ sơ. */
    @GetMapping("/affiliates")
    public PageResponse<AffiliateProfileResponse> list(
        @RequestParam(required = false) AffiliateStatus status,
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int size) {
        return affiliateService.listAdmin(status, page, size);
    }

    /** POST /{id}/approve — duyệt (sinh ref code + rate mặc định), chỉ PENDING. */
    @PostMapping("/affiliates/{id}/approve")
    public AffiliateProfileResponse approve(@PathVariable UUID id) {
        return affiliateService.approve(id);
    }

    /** POST /{id}/reject — từ chối, chỉ PENDING; user đăng ký lại sau. */
    @PostMapping("/affiliates/{id}/reject")
    public AffiliateProfileResponse reject(@PathVariable UUID id) {
        return affiliateService.reject(id);
    }

    /** POST /{id}/suspend — additive: APPROVED → SUSPENDED (ngừng track). */
    @PostMapping("/affiliates/{id}/suspend")
    public AffiliateProfileResponse suspend(@PathVariable UUID id) {
        return affiliateService.suspend(id);
    }

    /** POST /{id}/reactivate — additive: SUSPENDED → APPROVED (track lại). */
    @PostMapping("/affiliates/{id}/reactivate")
    public AffiliateProfileResponse reactivate(@PathVariable UUID id) {
        return affiliateService.reactivate(id);
    }

    /** PUT /{id}/rate — đặt % hoa hồng (0 < rate ≤ 50), áp cho đơn sau. */
    @PutMapping("/affiliates/{id}/rate")
    public AffiliateProfileResponse updateRate(@PathVariable UUID id,
                                               @Valid @RequestBody UpdateRateRequest request) {
        return affiliateService.updateRate(id, request.rate());
    }

    /** GET /api/affiliate/admin/stats?from=&to= — stats tổng hợp dashboard. */
    @GetMapping("/stats")
    public AdminStatsResponse stats(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ledgerService.adminStats(from, to);
    }
}
