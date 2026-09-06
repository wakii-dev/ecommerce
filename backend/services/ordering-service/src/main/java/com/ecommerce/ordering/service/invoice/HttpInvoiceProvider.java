package com.ecommerce.ordering.service.invoice;

import com.ecommerce.ordering.api.InvoiceUnavailableException;
import com.ecommerce.ordering.domain.InvoiceSequence;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.repo.InvoiceSequenceRepository;
import com.ecommerce.ordering.repo.OrderRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.LocalDate;
import java.util.Locale;

/**
 * InvoiceProvider mặc định (D18): gán số HĐ tuần tự theo (mẫu, ký hiệu, năm)
 * từ {@code invoice_sequences} (business truth Java) → build payload đầy đủ
 * (VAT breakdown {@code total × rate/(100+rate)} tính tại ĐÂY — renderer
 * stateless chỉ vẽ) → gọi invoice-service → PDF bytes.
 *
 * <p>Cùng đơn → cùng số: cấp số trong tx có row-lock trên ORDER (không phải
 * chỉ sequence) — request thứ 2 thấy số đã gán, KHÔNG cấp thêm. Renderer chết
 * → 503 problem rõ ràng (degraded như Stripe).</p>
 */
@Component
public class HttpInvoiceProvider implements InvoiceProvider {

    private static final Logger log = LoggerFactory.getLogger(HttpInvoiceProvider.class);

    private final RestClient rest;
    private final InvoiceSequenceRepository sequences;
    private final OrderRepository orders;
    private final TransactionTemplate tx;

    private final String mauSo;
    private final String kyHieu;
    private final double vatRate;
    private final String sellerName;
    private final String sellerAddress;
    private final String sellerPhone;
    private final String sellerTaxId;

    public HttpInvoiceProvider(
        RestClient.Builder builder,
        InvoiceSequenceRepository sequences,
        OrderRepository orders,
        TransactionTemplate tx,
        @Value("${ordering.invoice.base-url:http://localhost:8090}") String baseUrl,
        @Value("${ordering.invoice.mau-so:01/001}") String mauSo,
        @Value("${ordering.invoice.ky-hieu:C26}") String kyHieu,
        @Value("${ordering.invoice.vat-rate:10}") double vatRate,
        @Value("${ordering.invoice.seller-name:}") String sellerName,
        @Value("${ordering.invoice.seller-address:}") String sellerAddress,
        @Value("${ordering.invoice.seller-phone:}") String sellerPhone,
        @Value("${ordering.invoice.seller-tax-id:}") String sellerTaxId,
        @Value("${ordering.invoice.timeout-ms:8000}") long timeoutMs
    ) {
        this.sequences = sequences;
        this.orders = orders;
        this.tx = tx;
        this.mauSo = mauSo;
        this.kyHieu = kyHieu;
        this.vatRate = vatRate;
        this.sellerName = sellerName;
        this.sellerAddress = sellerAddress;
        this.sellerPhone = sellerPhone;
        this.sellerTaxId = sellerTaxId;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) timeoutMs);
        factory.setReadTimeout((int) timeoutMs);
        this.rest = builder.requestFactory(factory).baseUrl(baseUrl).build();
    }

    @Override
    public byte[] generate(Order order) {
        long number = invoiceNumberFor(order);
        JsonNode payload = buildPayload(order, number);
        try {
            byte[] pdf = rest.post()
                .uri("/api/invoice/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(byte[].class);
            if (pdf == null || pdf.length == 0) {
                throw new InvoiceUnavailableException("invoice-service trả PDF rỗng");
            }
            log.info("Hóa đơn số {} ({} {}) cho order {} — {} bytes",
                number, mauSo, kyHieu, order.getId(), pdf.length);
            return pdf;
        } catch (RestClientException e) {
            // Degraded rõ ràng (pack D18): không crash, không tự sinh PDF thay thế
            throw new InvoiceUnavailableException("Dịch vụ hóa đơn tạm không khả dụng — thử lại sau");
        }
    }

    /**
     * Số HĐ cho đơn — cấp ĐÚNG 1 lần. Tx: row-lock ORDER → đã có số? trả số cũ
     * : increment sequence (guarded) + seed khi thiếu + gán vào order.
     */
    private long invoiceNumberFor(Order order) {
        if (order.getInvoiceNumber() != null) {
            return order.getInvoiceNumber();
        }
        int year = LocalDate.now().getYear();
        return tx.execute(status -> {
            Order locked = orders.findWithWriteLock(order.getId()).orElseThrow();
            if (locked.getInvoiceNumber() != null) {
                return locked.getInvoiceNumber(); // race: path khác cấp rồi
            }
            long number = nextNumber(mauSo, kyHieu, year);
            locked.attachInvoiceNumber(number);
            orders.save(locked);
            log.info("Cấp số hóa đơn {} cho order {} ({}/{}/{})",
                number, locked.getId(), mauSo, kyHieu, year);
            return number;
        });
    }

    /** Increment guarded + self-seed (race 2 đơn đầu tiên: INSERT ON CONFLICT → retry). */
    private long nextNumber(String mau, String ky, int year) {
        for (int attempt = 0; attempt < 3; attempt++) {
            if (sequences.increment(mau, ky, year) == 1) {
                InvoiceSequence seq = sequences.findForRead(mau, ky, year);
                return seq.getLastNumber();
            }
            // row chưa có — seed (năm mới / lần chạy đầu) rồi thử lại
            sequences.save(new InvoiceSequence(mau, ky, year));
        }
        throw new InvoiceUnavailableException("Không cấp được số hóa đơn — thử lại sau");
    }

    /**
     * Payload khớp invoice.yaml InvoicePayload — mọi giá trị ĐÃ tính:
     * VAT-inclusive per line, breakdown tổng {@code total × rate/(100+rate)}
     * truyền qua {@code note} (schema freeze không có field vat riêng).
     */
    private JsonNode buildPayload(Order order, long number) {
        ObjectNode root = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode();

        ObjectNode invoiceOrder = root.putObject("order");
        invoiceOrder.put("id", order.getId().toString());
        invoiceOrder.put("number", orderNumberLabel(order));
        invoiceOrder.put("createdAt", order.getCreatedAt().toString());
        ArrayNode items = invoiceOrder.putArray("items");
        order.getItems().forEach(i -> {
            ObjectNode item = items.addObject();
            item.put("name", i.getName());
            item.put("qty", i.getQty());
            item.put("unitPrice", i.getUnitPrice());
            item.put("lineTotal", i.getLineTotal());
        });

        ObjectNode seller = root.putObject("seller");
        seller.put("name", sellerName);
        seller.put("address", sellerAddress);
        seller.put("phone", sellerPhone);
        seller.put("taxId", sellerTaxId);

        ObjectNode buyer = root.putObject("buyer");
        var address = order.getAddress();
        buyer.put("name", address.fullName());
        buyer.put("address", String.join(", ", address.line1(), address.ward(),
            address.district(), address.city()));
        buyer.put("phone", address.phone());

        ObjectNode invoice = root.putObject("invoice");
        invoice.put("templateSymbol", mauSo);
        invoice.put("seriesSymbol", kyHieu);
        invoice.put("number", number);
        invoice.put("vatRate", vatRate);
        invoice.put("totalAmount", order.getTotal());
        invoice.put("note", vatNote(order.getTotal()));

        return root;
    }

    /** Mã đơn hiển thị — #<8 ký tự đầu> đủ phân biệt, gọn trên PDF. */
    private String orderNumberLabel(Order order) {
        return "#" + order.getId().toString().substring(0, 8).toUpperCase(Locale.ROOT);
    }

    /** VAT breakdown (D18): VAT = total × rate/(100+rate) — giá đã gồm thuế. */
    private String vatNote(long total) {
        long vat = Math.round(total * vatRate / (100.0 + vatRate));
        return "Thuế GTGT " + trimRate(vatRate) + "%: " + String.format(Locale.ROOT, "%,d", vat)
            .replace(',', '.') + "đ (đã bao gồm trong tổng tiền)";
    }

    private String trimRate(double rate) {
        return rate == Math.floor(rate)
            ? String.valueOf((long) rate)
            : String.valueOf(rate);
    }
}
