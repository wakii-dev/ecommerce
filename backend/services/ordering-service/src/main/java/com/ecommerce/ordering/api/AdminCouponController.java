package com.ecommerce.ordering.api;

import com.ecommerce.ordering.api.dto.CouponDtos.AdminCouponActiveRequest;
import com.ecommerce.ordering.api.dto.CouponDtos.AdminCouponDto;
import com.ecommerce.ordering.api.dto.CouponDtos.AdminCouponRequest;
import com.ecommerce.ordering.domain.Coupon;
import com.ecommerce.ordering.service.CouponService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin coupon CRUD (FI-366 SF-1 T11 — spec §4.10 shape: %, fixed, window,
 * usage limit + validation) + FI-369 SF-2 bổ sung GET list + toggle active
 * (contracts amendment A3 — proposal theo baseline shape này, coordinator
 * apply). KHÔNG đụng create/update/delete đã đúng từ baseline.
 *
 * <p>2 lớp guard như AdminOrderController: gateway prefix
 * {@code /api/ordering/admin/**} (403 trước route) + {@code @PreAuthorize}
 * tại đây (defense in depth §3.4). Service gọi thẳng :8085 không qua prefix —
 * layer-2 vẫn chặn customer JWT.</p>
 */
@RestController
@RequestMapping("/admin/coupons")
@PreAuthorize("hasRole('ADMIN')")
public class AdminCouponController {

    private final CouponService couponService;

    public AdminCouponController(CouponService couponService) {
        this.couponService = couponService;
    }

    /** GET list (FI-369 SF-2 A3) — toàn bộ coupon, admin view đủ usageLimit/usedCount/active. */
    @GetMapping
    public List<AdminCouponDto> list() {
        return couponService.adminList().stream().map(AdminCouponController::toDto).toList();
    }

    @PostMapping
    public ResponseEntity<AdminCouponDto> create(@RequestBody AdminCouponRequest request) {
        Coupon saved = couponService.adminCreate(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(toDto(saved));
    }

    @PutMapping("/{code}")
    public AdminCouponDto update(@PathVariable String code, @RequestBody AdminCouponRequest request) {
        return toDto(couponService.adminUpdate(code, request));
    }

    @DeleteMapping("/{code}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String code) {
        couponService.adminDelete(code);
    }

    /** Toggle active (FI-369 SF-2 A3) — off: mã mới từ chối, in-flight RESERVED vẫn honor (N4). */
    @PutMapping("/{code}/active")
    public AdminCouponDto setActive(@PathVariable String code, @RequestBody AdminCouponActiveRequest request) {
        return toDto(couponService.adminSetActive(code, request.active()));
    }

    static AdminCouponDto toDto(Coupon c) {
        return new AdminCouponDto(c.getCode(), c.getType().name(), c.getValue(), c.getMinOrderValue(),
            c.getStartsAt(), c.getEndsAt(), c.getUsageLimit(), c.getUsedCount(), c.isActive(),
            c.getDescription());
    }

    /** Map lỗi domain → status contract: trùng code/giữ RESERVED → 409; sai validation → 400; thiếu → 404. */
    @ExceptionHandler(IllegalStateException.class)
    ResponseEntity<Object> conflict(IllegalStateException e) {
        return problem(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<Object> badRequest(IllegalArgumentException e) {
        return problem(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(jakarta.persistence.EntityNotFoundException.class)
    ResponseEntity<Object> notFound(jakarta.persistence.EntityNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, e.getMessage());
    }

    /** problem+json tối giản (khớp OrderingExceptionHandler baseBody shape). */
    private ResponseEntity<Object> problem(HttpStatus status, String message) {
        return ResponseEntity.status(status)
            .contentType(org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON)
            .body(java.util.Map.of(
                "status", status.value(),
                "title", status.getReasonPhrase(),
                "detail", message == null ? "" : message));
    }
}
