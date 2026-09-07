package com.ecommerce.ordering.service;

import com.ecommerce.ordering.repo.OrderRepository;
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
 * Export CSV đơn hàng (SF-13 A7b) — stream theo trang 500 dòng. Query entity
 * nằm trong TransactionTemplate PER-PAGE: {@code StreamingResponseBody} chạy
 * thread KHÁC request → @Transactional trên method KHÔNG hiệu lực (lazy items
 * chết LazyInitialization — đã gặp thật); rows dựng trong tx, ghi ra writer
 * ngoài tx. UTF-8 BOM do caller ghi trước stream (Excel VN).
 */
@Service
public class OrdersCsvExporter {

    static final String[] HEADER = {
        "order_id", "created_at", "status", "payment_method", "subtotal",
        "discount", "shipping_fee", "total", "currency", "coupon_code", "items_count"
    };
    private static final int BATCH = 500;
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_INSTANT;

    private final OrderRepository orders;
    private final TransactionTemplate tx;

    public OrdersCsvExporter(OrderRepository orders, TransactionTemplate tx) {
        this.orders = orders;
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
                Page<com.ecommerce.ordering.domain.Order> p = orders.findAll(
                    PageRequest.of(pageIndex, BATCH, Sort.by(Sort.Direction.ASC, "createdAt")));
                List<String> rows = new ArrayList<>(p.getNumberOfElements());
                for (var o : p.getContent()) {
                    rows.add(row(o));
                }
                return new org.springframework.data.domain.PageImpl<>(rows, p.getPageable(), p.getTotalElements());
            });
            for (String row : slice.getContent()) {
                out.write(row);
            }
            pageNum++;
        } while (slice.hasNext());
    }

    private static String row(com.ecommerce.ordering.domain.Order o) {
        return String.join(",",
            o.getId().toString(),
            quote(ISO.format(o.getCreatedAt())),
            o.getStatus().name(),
            nullSafe(o.getPaymentMethod()),
            String.valueOf(o.getSubtotal()),
            String.valueOf(o.getDiscount()),
            String.valueOf(o.getShippingFee()),
            String.valueOf(o.getTotal()),
            "VND",
            quote(nullSafe(o.getCouponCode())),
            String.valueOf(o.getItems() == null ? 0 : o.getItems().size()))
            + "\r\n";
    }

    /** Bọc quote khi có dấu phẩy/ngoặc kép/xuống dòng — CSV an toàn. */
    private static String quote(String value) {
        if (value == null) {
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
