package com.ecommerce.catalog.web;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.service.CatalogQueryService;
import com.ecommerce.catalog.service.LocaleResolver;
import com.ecommerce.catalog.web.dto.CategoryDto;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Public category tree (Task 3) — GET /api/catalog/categories, roots =
 * parent_id null, children đệ quy, name/slug resolved theo locale.
 */
@RestController
@RequestMapping("/api/catalog")
public class CategoryController {

    private final CatalogQueryService catalog;
    private final LocaleResolver localeResolver;

    public CategoryController(CatalogQueryService catalog, LocaleResolver localeResolver) {
        this.catalog = catalog;
        this.localeResolver = localeResolver;
    }

    @GetMapping("/categories")
    public List<CategoryDto> getCategories(
            @RequestParam(required = false) String locale,
            HttpServletRequest request) {
        return catalog.getCategoryTree(localeResolver.resolve(request, locale));
    }
}
