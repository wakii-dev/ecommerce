package com.ecommerce.partner.service;

import com.ecommerce.partner.auth.ApiKeyPrincipal;
import com.ecommerce.partner.domain.PartnerOrderRefEntity;
import com.ecommerce.partner.proxy.OrderingClient;
import com.ecommerce.partner.repo.PartnerOrderRefRepository;
import com.ecommerce.partner.web.dto.PartnerOrderDtos.CreatePartnerOrderRequest;
import com.ecommerce.partner.web.dto.PartnerOrderDtos.PartnerOrder;
import com.ecommerce.partner.web.dto.PartnerOrderDtos.PartnerOrderCreated;
import com.ecommerce.partner.web.dto.PartnerOrderDtos.PartnerOrderLine;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Đơn partner (contract partner-orders):
 *
 * <p><strong>Idempotency 2 lớp:</strong> (1) partner_order_refs
 * UNIQUE(partner_id, partner_ref) — replay trả đơn cũ NGAY không gọi ordering
 * (contract: "trả đơn đã có", bất kể payload); (2) Idempotency-Key
 * deterministic {@code UUID(partnerId:partnerRef)} — nếu 2 request race qua
 * layer 1, ordering saga replay cùng key trả đúng 1 đơn.</p>
 *
 * <p><strong>Mapping lỗi ordering</strong> (contract chỉ có 400/409/404/429):
 * 409 → re-check refs TRƯỚC (race cùng ref khác payload → 409
 * IdempotencyConflict ở ordering nhưng đơn đã tồn tại) → không thấy ref mới
 * 409 "hết hàng"; 422 (ItemUnavailable — ngừng bán) → 409; 400 pass-through;
 * còn lại → 502.</p>
 *
 * <p><strong>Cố ý KHÔNG {@code @Transactional}:</strong> create() chỉ có 1
 * INSERT; với tx bọc method, persist chỉ flush lúc commit (SAU khi method
 * return) → DataIntegrityViolationException ném ngoài catch race-UNIQUE →
 * 2 request đồng thời cùng partnerRef nhận 409 thay vì 201-replay, và giữ
 * DB connection trong suốt HTTP call ordering (code-review 07/09). Không
 * tx: save() commit ngay → DIVE ném đúng tại save() → catch re-fetch chạy
 * như thiết kế.</p>
 */
@Service
public class PartnerOrderService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderService.class);

    private final PartnerOrderRefRepository refs;
    private final OrderingClient ordering;
    private final ObjectMapper objectMapper;

    public PartnerOrderService(PartnerOrderRefRepository refs, OrderingClient ordering,
                               ObjectMapper objectMapper) {
        this.refs = refs;
        this.ordering = ordering;
        this.objectMapper = objectMapper;
    }

    public PartnerOrderCreated create(ApiKeyPrincipal principal, CreatePartnerOrderRequest request) {
        UUID partnerId = principal.partnerId();
        String ref = request.partnerRef().trim();

        // ── Layer 1: replay cùng partnerRef → trả đơn đã có (không gọi ordering)
        PartnerOrderRefEntity existing = refs.findByPartnerIdAndPartnerRef(partnerId, ref).orElse(null);
        if (existing != null) {
            log.info("[partner-order] replay partnerRef {} (partner {}) → đơn cũ {}",
                ref, partnerId, existing.getOrderId());
            return new PartnerOrderCreated(existing.getOrderId().toString(), ref, statusOf(existing));
        }

        String idempotencyKey = UUID.nameUUIDFromBytes((partnerId + ":" + ref)
            .getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();

        JsonNode response;
        try {
            response = ordering.createOrder(idempotencyKey, toOrderingRequest(request));
        } catch (HttpClientErrorException.Conflict e) {
            // 409 quá tải: race cùng ref (payload khác) → đơn đã tồn tại; hay hết hàng
            PartnerOrderRefEntity raced = refs.findByPartnerIdAndPartnerRef(partnerId, ref).orElse(null);
            if (raced != null) {
                log.info("[partner-order] race partnerRef {} — ordering 409 nhưng đơn {} có rồi",
                    ref, raced.getOrderId());
                return new PartnerOrderCreated(raced.getOrderId().toString(), ref, statusOf(raced));
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Sản phẩm hết hàng hoặc ngừng bán — đơn không tạo được");
        } catch (HttpClientErrorException.UnprocessableEntity e) {
            // 422 ItemUnavailable (sản phẩm ngừng bán/variant sai) → 409 theo
            // mô tả contract ("hết hàng hoặc ngừng bán")
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Sản phẩm hết hàng hoặc ngừng bán — đơn không tạo được");
        } catch (HttpClientErrorException.BadRequest e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Payload đơn không hợp lệ theo hệ thống (kiểm tra productId/variantId)");
        } catch (HttpClientErrorException.Unauthorized e) {
            throw OrderingClient.unavailable(e);
        } catch (RestClientException e) {
            throw OrderingClient.unavailable(e);
        }

        JsonNode order = response == null ? null : response.path("order");
        String orderId = order == null ? "" : order.path("id").asText("");
        if (orderId.isBlank()) {
            log.error("[partner-order] ordering trả body thiếu order.id: {}", response);
            throw OrderingClient.unavailable(new IllegalStateException("ordering body thiếu order.id"));
        }

        // Insert ref — UNIQUE(partner_id, partner_ref) bắt race cuối: re-fetch
        try {
            PartnerOrderRefEntity entity = new PartnerOrderRefEntity();
            entity.setPartnerId(partnerId);
            entity.setPartnerRef(ref);
            entity.setOrderId(UUID.fromString(orderId));
            refs.save(entity);
        } catch (DataIntegrityViolationException e) {
            PartnerOrderRefEntity raced = refs.findByPartnerIdAndPartnerRef(partnerId, ref).orElseThrow();
            return new PartnerOrderCreated(raced.getOrderId().toString(), ref, statusOf(raced));
        }

        return new PartnerOrderCreated(orderId, ref, order.path("status").asText("PENDING"));
    }

    public PartnerOrder get(ApiKeyPrincipal principal, UUID orderId) {
        // Path param = orderId trả về lúc tạo (contract) — lookup theo order_id,
        // KHÔNG theo partnerRef; đơn partner khác → 404 (không lộ tồn tại)
        PartnerOrderRefEntity ref = refs.findByOrderId(orderId)
            .filter(r -> r.getPartnerId().equals(principal.partnerId()))
            .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn"));
        JsonNode order = ordering.getOrder(orderId.toString());
        if (order == null) {
            throw new EntityNotFoundException("Không tìm thấy đơn");
        }
        return toPartnerOrder(ref, order);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private String statusOf(PartnerOrderRefEntity ref) {
        try {
            JsonNode order = ordering.getOrder(ref.getOrderId().toString());
            if (order != null) {
                return order.path("status").asText("PENDING");
            }
        } catch (RestClientException e) {
            log.warn("[partner-order] replay lấy status ordering lỗi: {}", e.getMessage());
            throw OrderingClient.unavailable(e);
        }
        throw OrderingClient.unavailable(new IllegalStateException("ordering trả null"));
    }

    private ObjectNode toOrderingRequest(CreatePartnerOrderRequest request) {
        ObjectNode body = objectMapper.createObjectNode();
        ArrayNode items = body.putArray("items");
        for (var item : request.items()) {
            ObjectNode node = items.addObject();
            node.put("productId", item.productId());
            node.put("variantId", item.variantId());
            node.put("qty", item.qty());
        }
        body.put("shippingMethod", "standard");
        body.put("paymentMethod", "stripe");
        ObjectNode address = body.putObject("address");
        address.put("fullName", request.customer().name());
        address.put("phone", request.customer().phone());
        address.put("line1", request.customer().address());
        // contract PartnerCustomer chỉ có 1 dòng địa chỉ — các field bắt buộc
        // của ordering AddressDto nhận placeholder (đơn partner quản fulfil thủ công)
        address.put("ward", "—");
        address.put("district", "—");
        address.put("city", "—");
        return body;
    }

    private PartnerOrder toPartnerOrder(PartnerOrderRefEntity ref, JsonNode order) {
        List<PartnerOrderLine> lines = new ArrayList<>();
        for (JsonNode line : order.path("items")) {
            lines.add(new PartnerOrderLine(
                line.path("productId").asText(),
                line.path("variantId").asText(""),
                line.path("name").asText(""),
                line.path("qty").asInt(),
                line.path("unitPrice").asLong()));
        }
        String updatedAt = order.path("updatedAt").asText(null);
        return new PartnerOrder(
            order.path("id").asText(),
            ref.getPartnerRef(),
            order.path("status").asText("PENDING"),
            lines,
            updatedAt == null ? Instant.now() : Instant.parse(updatedAt));
    }
}
