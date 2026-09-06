package com.ecommerce.inventory.api;

import com.ecommerce.inventory.api.dto.CreateReservationRequest;
import com.ecommerce.inventory.api.dto.ReservationCreatedResponse;
import com.ecommerce.inventory.service.ReservationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reservation API — path KHÔNG có prefix `/api`: gateway route
 * `Path=/api/inventory/**` + `StripPrefix=1` đã bóc prefix (convention
 * gateway-routes.yml). Public path qua gateway = `/api/inventory/reservations`
 * (khớp contract); gọi trực tiếp service = `/inventory/reservations`.
 * Auth: `x-internal-only` — public trong gateway tới khi SF-3 wire service-token.
 */
@RestController
@RequestMapping("/inventory")
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @PostMapping("/reservations")
    public ResponseEntity<ReservationCreatedResponse> create(@Valid @RequestBody CreateReservationRequest request) {
        ReservationCreatedResponse response = reservationService.create(
            request.orderId(), request.items(), request.ttlMinutes());
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }
}
