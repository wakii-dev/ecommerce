package com.ecommerce.partner.web;

import com.ecommerce.partner.auth.ApiKeyAuthFilter;
import com.ecommerce.partner.auth.ApiKeyPrincipal;
import com.ecommerce.partner.service.PartnerOrderService;
import com.ecommerce.partner.web.dto.PartnerOrderDtos.CreatePartnerOrderRequest;
import com.ecommerce.partner.web.dto.PartnerOrderDtos.PartnerOrder;
import com.ecommerce.partner.web.dto.PartnerOrderDtos.PartnerOrderCreated;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Orders cho partner (contract partner-orders) — POST tạo đơn (idempotent
 * theo partnerRef), GET tra cứu CHỈ đơn của key này. Auth + scope đã chạy ở
 * ApiKeyAuthFilter — controller đọc principal từ request attribute.
 */
@RestController
@RequestMapping("/open-api/v1")
public class PartnerOrderController {

    private final PartnerOrderService orders;

    public PartnerOrderController(PartnerOrderService orders) {
        this.orders = orders;
    }

    /** 201 — "Đơn đã tạo (hoặc replay của partnerRef cũ)". */
    @PostMapping("/orders")
    public ResponseEntity<PartnerOrderCreated> createOrder(
        @RequestAttribute(ApiKeyAuthFilter.REQUEST_ATTRIBUTE) ApiKeyPrincipal principal,
        @Valid @RequestBody CreatePartnerOrderRequest request) {
        PartnerOrderCreated created = orders.create(principal, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /** 200 đơn của partner; partner khác/không tồn tại → 404. */
    @GetMapping("/orders/{id}")
    public PartnerOrder getOrder(
        @RequestAttribute(ApiKeyAuthFilter.REQUEST_ATTRIBUTE) ApiKeyPrincipal principal,
        @PathVariable UUID id) {
        return orders.get(principal, id);
    }
}
