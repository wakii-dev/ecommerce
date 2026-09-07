package com.ecommerce.ordering.api.dto;

import com.ecommerce.ordering.domain.Rma;
import com.ecommerce.ordering.domain.RmaLine;
import com.ecommerce.ordering.domain.RmaStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.UUID;

/** DTO RMA (D22) — khớp contracts/openapi/ordering.yaml Rma/RmaCreateRequest/RmaPage. */
public final class RmaDtos {

    private RmaDtos() {
    }

    /** POST /me/rma body — lineId là id OrderLine trong đơn (contract). */
    public record RmaCreateRequest(
        @NotNull UUID orderId,
        @NotEmpty @Valid List<Line> lines,
        @NotBlank String reason
    ) {

        public record Line(
            @NotNull UUID lineId,
            @Positive int qty
        ) {
        }
    }

    public record RmaDto(
        UUID id,
        UUID orderId,
        RmaStatus status,
        List<RmaLine> lines,
        String reason,
        Long refundAmount,
        String createdAt
    ) {

        public static RmaDto from(Rma r) {
            return new RmaDto(r.getId(), r.getOrderId(), r.getStatus(), r.getItems(),
                r.getReason(), r.getRefundAmount(), r.getCreatedAt().toString());
        }
    }

    public record RmaPageDto(List<RmaDto> items, int page, int size, long total) {

        public static RmaPageDto of(Page<RmaDto> p) {
            return new RmaPageDto(p.getContent(), p.getNumber() + 1, p.getSize(), p.getTotalElements());
        }
    }
}
