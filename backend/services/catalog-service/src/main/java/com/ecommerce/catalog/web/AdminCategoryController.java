package com.ecommerce.catalog.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.admin.AdminCatalogService;
import com.ecommerce.catalog.web.dto.CategoryAdminDto;
import com.ecommerce.catalog.web.dto.CategoryWriteDto;

/**
 * Admin category CRUD (Task 8b) — path FULL {@code /api/catalog/admin/categories}.
 * Guard ROLE_ADMIN qua SecurityConfig; 409 khi xóa còn con/product qua service.
 * NOTE: category write KHÔNG emit product.changed (payload contract cần
 * productId — xem AdminCatalogService) — TTL cache cây category hấp thụ.
 */
@RestController
@RequestMapping("/api/catalog/admin")
public class AdminCategoryController {

    private final AdminCatalogService admin;

    public AdminCategoryController(AdminCatalogService admin) {
        this.admin = admin;
    }

    /** GET /admin/categories — cây đầy đủ kèm i18n gốc (nameI18n + slugVi). */
    @GetMapping("/categories")
    public List<CategoryAdminDto> list() {
        return admin.listCategoryTree();
    }

    @PostMapping("/categories")
    public ResponseEntity<CategoryAdminDto> create(@RequestBody CategoryWriteDto dto) {
        CategoryAdminDto view = admin.createCategory(dto);
        return ResponseEntity.created(URI.create("/api/catalog/admin/categories/" + view.id())).body(view);
    }

    @GetMapping("/categories/{id}")
    public CategoryAdminDto get(@PathVariable UUID id) {
        return admin.getCategory(id);
    }

    @PutMapping("/categories/{id}")
    public CategoryAdminDto update(@PathVariable UUID id, @RequestBody CategoryWriteDto dto) {
        return admin.updateCategory(id, dto);
    }

    /** DELETE — 204; 409 khi còn product hoặc còn children. */
    @DeleteMapping("/categories/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        admin.deleteCategory(id);
        return ResponseEntity.noContent().build();
    }
}
