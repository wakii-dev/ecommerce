package com.ecommerce.catalog.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.ecommerce.catalog.search.SearchEngine;
import com.ecommerce.catalog.search.SearchQuery;
import com.ecommerce.catalog.service.LocaleResolver;
import com.ecommerce.catalog.web.dto.ProductCardPageDto;
import com.ecommerce.catalog.web.dto.SuggestResponseDto;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Public search APIs (Task 4) — contract khớp CHÍNH XÁC catalog.yaml:
 * {@code GET /api/catalog/search} (q bắt buộc, category/sort/locale/page/size)
 * + {@code GET /api/catalog/search/suggest}. Engine đằng sau do
 * {@link SearchEngineConfig} chọn (D15) — controller không biết ES hay PG.
 * 400 problem+json qua common-lib khi param sai.
 */
@RestController
@RequestMapping("/api/catalog")
public class SearchController {

    private final SearchEngine searchEngine;
    private final LocaleResolver localeResolver;

    public SearchController(SearchEngine searchEngine, LocaleResolver localeResolver) {
        this.searchEngine = searchEngine;
        this.localeResolver = localeResolver;
    }

    @GetMapping("/search")
    public ProductCardPageDto search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String locale,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        if (q == null || q.isBlank()) {
            throw bad("q bắt buộc (tối thiểu 1 ký tự)");
        }
        if (page < 1) {
            throw bad("page phải >= 1 (1-based)");
        }
        if (size < 1 || size > 100) {
            throw bad("size phải trong khoảng [1, 100] (mặc định 20)");
        }
        String sortKey = (sort == null || sort.isBlank()) ? "newest" : sort.trim();
        if (!SearchQuery.VALID_SORTS.contains(sortKey)) {
            throw bad("sort chỉ nhận: price_asc, price_desc, rating, newest, discount");
        }
        // Contract /search không có filter giá/rating/brand — SearchQuery giữ field
        // engine-level (parity EsEngine Task 6), HTTP chỉ bind đúng contract.
        return searchEngine.search(new SearchQuery(q.trim(), localeResolver.resolve(request, locale),
            category, sortKey, null, null, null, null, null, page, size));
    }

    @GetMapping("/search/suggest")
    public SuggestResponseDto suggest(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String locale,
            HttpServletRequest request) {
        if (q == null || q.isBlank()) {
            throw bad("q bắt buộc (tối thiểu 1 ký tự)");
        }
        return searchEngine.suggest(q.trim(), localeResolver.resolve(request, locale));
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
