package com.ecommerce.catalog.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import org.springframework.web.multipart.MultipartFile;

import com.ecommerce.catalog.admin.AdminCatalogService;
import com.ecommerce.catalog.storage.ProductStorage;
import com.ecommerce.catalog.web.dto.ProductAdminItemPageDto;
import com.ecommerce.catalog.web.dto.ProductAdminViewDto;
import com.ecommerce.catalog.web.dto.ProductWriteDto;
import com.ecommerce.catalog.web.dto.UploadResponseDto;

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
    private final ProductStorage storage;
    private final com.ecommerce.catalog.admin.ProductsCsvExporter productsCsv;

    public AdminProductController(AdminCatalogService admin, ProductStorage storage,
            com.ecommerce.catalog.admin.ProductsCsvExporter productsCsv) {
        this.admin = admin;
        this.storage = storage;
        this.productsCsv = productsCsv;
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

    /**
     * POST /admin/uploads — upload ảnh MinIO (SF-13 A3, contract catalog.yaml):
     * multipart field {@code image}, 201 {@code {url}} — URL public /media/**.
     */
    @PostMapping(value = "/uploads", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UploadResponseDto> upload(@RequestParam("image") MultipartFile image) {
        return ResponseEntity.status(HttpStatus.CREATED).body(new UploadResponseDto(storage.upload(image)));
    }

    /** GET /admin/products/export.csv — stream CSV (SF-13 A7b, ADR 0005). BOM UTF-8 Excel VN. */
    @GetMapping(value = "/products/export.csv", produces = "text/csv")
    public ResponseEntity<org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody> exportCsv() {
        String filename = "products-" + java.time.LocalDate.now() + ".csv";
        org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody body = out -> {
            out.write(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
            var writer = new java.io.OutputStreamWriter(out, java.nio.charset.StandardCharsets.UTF_8);
            productsCsv.write(writer);
            writer.flush(); // Spring chỉ đóng raw stream — KHÔNG flush writer tự động
        };
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .header("Content-Disposition", "attachment; filename=\"" + filename + "\"")
            .body(body);
    }
}
