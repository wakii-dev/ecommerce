package com.ecommerce.catalog.admin;

import com.ecommerce.catalog.repo.ProductRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.io.Writer;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Export CSV sản phẩm (SF-13 A7b) — stream trang 500 dòng; rows dựng trong
 * TransactionTemplate PER-PAGE (StreamingResponseBody chạy thread khác —
 * lesson từ OrdersCsvExporter); UTF-8 BOM do caller ghi. Runtime endpoint
 * ngoài catalog.yaml freeze (ADR 0005).
 */
@Service
public class ProductsCsvExporter {

    static final String[] HEADER = {
        "id", "slug", "name_vi", "brand", "price", "compare_price",
        "discount_percent", "status", "rating_avg", "created_at"
    };
    private static final int BATCH = 500;
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_INSTANT;

    private final ProductRepository products;
    private final TransactionTemplate tx;

    public ProductsCsvExporter(ProductRepository products, TransactionTemplate tx) {
        this.products = products;
        this.tx = tx;
    }

    public void write(Writer out) throws IOException {
        out.write(String.join(",", HEADER));
        out.write("\r\n");
        int pageNum = 0;
        Page<String> slice;
        do {
            final int pageIndex = pageNum;
            slice = tx.execute(status -> {
                Page<com.ecommerce.catalog.domain.ProductEntity> p = products.findAll(
                    PageRequest.of(pageIndex, BATCH, Sort.by(Sort.Direction.ASC, "createdAt")));
                List<String> rows = new ArrayList<>(p.getNumberOfElements());
                for (var product : p.getContent()) {
                    rows.add(row(product));
                }
                return new org.springframework.data.domain.PageImpl<>(rows, p.getPageable(), p.getTotalElements());
            });
            for (String row : slice.getContent()) {
                out.write(row);
            }
            pageNum++;
        } while (slice.hasNext());
    }

    private static String row(com.ecommerce.catalog.domain.ProductEntity p) {
        Long compare = p.getComparePrice();
        // discount % tự tính (entity không có getter — @Formula chỉ cho sort)
        String discount = compare != null && compare > p.getPrice()
            ? String.valueOf(Math.round((compare - p.getPrice()) * 100.0 / compare))
            : "";
        return String.join(",",
            p.getId().toString(),
            nullSafe(p.getSlugVi()),
            quote(nullSafe(p.getName() == null ? null : p.getName().vi())),
            quote(nullSafe(p.getBrand())),
            String.valueOf(p.getPrice()),
            compare == null ? "" : String.valueOf(compare),
            discount,
            String.valueOf(p.getStatus()),
            p.getRatingAvg() == null ? "" : String.valueOf(p.getRatingAvg()),
            quote(p.getCreatedAt() == null ? "" : ISO.format(p.getCreatedAt())))
            + "\r\n";
    }

    private static String quote(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return '"' + value.replace("\"", "\"\"") + '"';
        }
        return value;
    }

    private static String nullSafe(String v) {
        return v == null ? "" : v;
    }
}
