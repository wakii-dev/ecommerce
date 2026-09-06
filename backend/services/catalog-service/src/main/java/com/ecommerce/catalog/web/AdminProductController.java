package com.ecommerce.catalog.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.admin.AdminCatalogService;
import com.ecommerce.catalog.web.dto.ProductAdminItemPageDto;
import com.ecommerce.catalog.web.dto.ProductAdminViewDto;
import com.ecommerce.catalog.web.dto.ProductWriteDto;

/**
 * Admin product CRUD (Task 8b) — path FULL {@code /api/catalog/admin/products}
 * (Conventions #11). Guard ROLE_ADMIN qua SecurityConfig; correlationId từ
 * header {@code X-Request-Id} propagate vào outbox event. Lỗi RFC 7807 qua
 * common-lib (409 unique slug/ DataIntegrityViolation, 404 không thấy).
 */
@RestController
@RequestMapping("/api/catalog/admin")
public class AdminProductController {

    private final AdminCatalogService admin;

    public AdminProductController(AdminCatalogService admin) {
        this.admin = admin;
    }

    /** GET /admin/products — q + status (DRAFT/PUBLISHED) + page 1-based + size. */
    @GetMapping("/products")
    public ProductAdminItemPageDto list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return admin.listProducts(q, status, page, size);
    }

    @PostMapping("/products")
    public ResponseEntity<ProductAdminViewDto> create(
            @RequestBody ProductWriteDto dto,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        ProductAdminViewDto view = admin.createProduct(dto, requestId);
        return ResponseEntity.created(URI.create("/api/catalog/admin/products/" + view.id())).body(view);
    }

    @GetMapping("/products/{id}")
    public ProductAdminViewDto get(@PathVariable UUID id) {
        return admin.getProduct(id);
    }

    @PutMapping("/products/{id}")
    public ProductAdminViewDto update(
            @PathVariable UUID id,
            @RequestBody ProductWriteDto dto,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        return admin.updateProduct(id, dto, requestId);
    }

    /** DELETE — soft-delete + event DELETED (204). */
    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId) {
        admin.deleteProduct(id, requestId);
        return ResponseEntity.noContent().build();
    }
}
