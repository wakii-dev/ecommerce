package com.ecommerce.catalog.web;

import java.math.BigDecimal;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ecommerce.catalog.service.CatalogQueryService;
import com.ecommerce.catalog.service.LocaleResolver;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.ProductDetailDto;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Public product APIs (Task 3) — path FULL prefix {@code /api/catalog}
 * (Conventions #11: khớp contract + curl pack, gateway KHÔNG StripPrefix).
 * 404/400 RFC 7807 qua common-lib GlobalExceptionHandler.
 */
@RestController
@RequestMapping("/api/catalog")
public class ProductController {

    private final CatalogQueryService catalog;
    private final LocaleResolver localeResolver;

    public ProductController(CatalogQueryService catalog, LocaleResolver localeResolver) {
        this.catalog = catalog;
        this.localeResolver = localeResolver;
    }

    /**
     * PLP — GET /api/catalog/products.
     * Filter: category (slug vi/en), minPrice/maxPrice (VND), minRating, brand,
     * official (GAP FLAGGED — không có trong contract, implement theo pack).
     * Sort enum contract + locale (?locale thắng Accept-Language) + page 1-based + size (20/100).
     */
    @GetMapping("/products")
    public ProductCardPageDto listProducts(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Long minPrice,
            @RequestParam(required = false) Long maxPrice,
            @RequestParam(required = false) BigDecimal minRating,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Boolean official,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String locale,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        return catalog.listProducts(category, minPrice, maxPrice, minRating, brand, official, sort,
            localeResolver.resolve(request, locale), page, size);
    }

    /** PDP — GET /api/catalog/products/{slug}: khớp slug vi HOẶC en; draft → 404. */
    @GetMapping("/products/{slug}")
    public ProductDetailDto getProduct(
            @PathVariable String slug,
            @RequestParam(required = false) String locale,
            HttpServletRequest request) {
        return catalog.getProduct(slug, localeResolver.resolve(request, locale));
    }
}
