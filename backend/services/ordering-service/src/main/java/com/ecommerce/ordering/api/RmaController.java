package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.RmaDtos.RmaCreateRequest;
import com.ecommerce.ordering.api.dto.RmaDtos.RmaDto;
import com.ecommerce.ordering.api.dto.RmaDtos.RmaPageDto;
import com.ecommerce.ordering.service.RmaService;
import jakarta.validation.Valid;
import org.slf4j.MDC;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Customer RMA APIs (D22) — paths SAU StripPrefix=2 (contract /api/ordering/me/rma):
 * POST tạo yêu cầu (202 REQUESTED, contract) · GET list của tôi.
 */
@RestController
public class RmaController {

    private final RmaService rmaService;

    public RmaController(RmaService rmaService) {
        this.rmaService = rmaService;
    }

    /** POST /me/rma — 202 "Da tao — dang REQUESTED, cho admin duyet" (contract). */
    @PostMapping("/me/rma")
    public ResponseEntity<RmaDto> create(@AuthenticationPrincipal Jwt jwt,
                                         @Valid @RequestBody RmaCreateRequest request) {
        RmaDto created = rmaService.create(UUID.fromString(jwt.getSubject()), request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(created);
    }

    /** GET /me/rma — trang RMA của tôi, mới nhất trước (contract). */
    @GetMapping("/me/rma")
    public RmaPageDto myRmas(@AuthenticationPrincipal Jwt jwt,
                             @RequestParam(defaultValue = "1") int page,
                             @RequestParam(defaultValue = "20") int size) {
        Page<RmaDto> result = rmaService.listMine(UUID.fromString(jwt.getSubject()), page, size);
        return RmaPageDto.of(result);
    }
}
