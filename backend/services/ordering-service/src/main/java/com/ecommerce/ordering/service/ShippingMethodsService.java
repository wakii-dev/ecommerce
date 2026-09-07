package com.ecommerce.ordering.service;

import com.ecommerce.ordering.api.InvalidShippingMethodException;
import com.ecommerce.ordering.api.dto.TrackingDtos.TrackingResponseDto;
import com.ecommerce.ordering.domain.Order;
import com.ecommerce.ordering.saga.GhnClient;
import com.ecommerce.ordering.saga.ShippingMethods;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Giải pháp vận chuyển (SF-14, D22) — GHN khi có token, fallback flat-fee khi
 * không (degraded, quyết định spec D9). Method id:
 * {@code standard|express} (flat, giữ nguyên hành vi cũ) và
 * {@code ghn:<serviceId>} (phí thật theo district GHN + weight 500g/item —
 * MVP weight hằng số, sản phẩm chưa có field weight).
 *
 * <p>District GHN là id số; address form nhập text → param {@code district}
 * parse được int mới dùng GHN, không thì fallback flat (UX không chết).
 * IT chứng minh nhánh GHN bằng WireMock.</p>
 */
@Service
public class ShippingMethodsService {

    private static final Logger log = LoggerFactory.getLogger(ShippingMethodsService.class);

    /** MVP: mỗi item 500g — catalog chưa có field weight (javadoc spec D9). */
    static final int WEIGHT_PER_ITEM_GRAMS = 500;
    private static final int DEFAULT_ETA_DAYS = 3;

    private final GhnClient ghn;

    public ShippingMethodsService(GhnClient ghn) {
        this.ghn = ghn;
    }

    /** Method có thêm ghnServiceId (null = flat) — nội bộ service, không ra contract. */
    public record Method(String id, String name, long fee, int etaDays, Long ghnServiceId) {

        public boolean isGhn() {
            return ghnServiceId != null;
        }
    }

    /**
     * GET /shipping/methods?province=&district= — GHN services + fee thật khi
     * bật được, ngược lại flat-fee (contract shape giữ nguyên).
     */
    public List<Method> methods(String province, String district, int totalQty) {
        List<Method> result = new ArrayList<>();
        Integer districtId = parseDistrictId(district);
        if (ghn.enabled() && districtId != null) {
            try {
                int weight = Math.max(1, totalQty) * WEIGHT_PER_ITEM_GRAMS;
                for (GhnClient.GhnService s : ghn.availableServices(districtId)) {
                    long fee = ghn.fee(s.serviceId(), districtId, weight);
                    result.add(new Method("ghn:" + s.serviceId(),
                        s.shortName() + " (GHN)", fee, DEFAULT_ETA_DAYS, s.serviceId()));
                }
            } catch (Exception e) {
                log.warn("GHN methods/fee lỗi ({}{}) — fallback flat-fee: {}",
                    province, district, e.getMessage());
            }
        }
        if (result.isEmpty()) {
            ShippingMethods.ALL.forEach(m ->
                result.add(new Method(m.id(), m.name(), m.fee(), m.etaDays(), null)));
        }
        return result;
    }

    /** Saga tạo đơn — fee authority tại thời điểm đặt (ghn → query fee lại). */
    public Method resolve(String methodId, String province, String district, int totalQty) {
        if (methodId != null && methodId.startsWith("ghn:")) {
            Integer districtId = parseDistrictId(district);
            if (!ghn.enabled() || districtId == null) {
                throw new InvalidShippingMethodException(
                    "Phương thức GHN cần địa chỉ district mã GHN hợp lệ: " + methodId);
            }
            long serviceId = Long.parseLong(methodId.substring(4));
            try {
                long fee = ghn.fee(serviceId, districtId,
                    Math.max(1, totalQty) * WEIGHT_PER_ITEM_GRAMS);
                return new Method(methodId, "Giao hàng GHN", fee, DEFAULT_ETA_DAYS, serviceId);
            } catch (Exception e) {
                throw new InvalidShippingMethodException(
                    "GHN không tính được phí cho phương thức " + methodId);
            }
        }
        ShippingMethods.Method flat = ShippingMethods.byId(methodId);
        return new Method(flat.id(), flat.name(), flat.fee(), flat.etaDays(), null);
    }

    /**
     * Admin ship — tạo vận đơn GHN cho method {@code ghn:*}; trả trackingCode
     * mới hoặc null (caller giữ TRK- fallback — ship không chết vì GHN).
     */
    public String createGhnTracking(Order order, int totalQty) {
        if (!order.getShippingMethod().startsWith("ghn:") || !ghn.enabled()) {
            return null;
        }
        Integer districtId = parseDistrictId(order.getAddress().district());
        if (districtId == null) {
            return null;
        }
        try {
            GhnClient.Created created = ghn.createOrder(
                Long.parseLong(order.getShippingMethod().substring(4)),
                districtId, order.getAddress().ward(),
                Math.max(1, totalQty) * WEIGHT_PER_ITEM_GRAMS,
                order.getId().toString(),
                order.getAddress().fullName(), order.getAddress().phone(),
                order.getAddress().line1());
            return created.orderCode();
        } catch (Exception e) {
            log.warn("Tạo vận đơn GHN lỗi cho order {} — giữ tracking fallback: {}",
                order.getId(), e.getMessage());
            return null;
        }
    }

    /** GET /me/orders/{id}/tracking — ghn → detail GHN; flat → trạng thái đơn. */
    public TrackingResponseDto trackingFor(Order order) {
        if (order.getShippingMethod().startsWith("ghn:") && ghn.enabled()
            && order.getTrackingCode() != null) {
            try {
                GhnClient.Detail detail = ghn.detail(order.getTrackingCode());
                List<com.ecommerce.ordering.api.dto.TrackingDtos.EventDto> events = detail.events().stream()
                    .map(e -> new com.ecommerce.ordering.api.dto.TrackingDtos.EventDto(e.at(), e.description()))
                    .toList();
                return new TrackingResponseDto(order.getTrackingCode(), "GHN",
                    mapGhnStatus(detail.status()), events);
            } catch (Exception e) {
                log.warn("GHN detail lỗi cho {} — trả trạng thái đơn: {}",
                    order.getTrackingCode(), e.getMessage());
            }
        }
        return new TrackingResponseDto(
            order.getTrackingCode() == null ? "" : order.getTrackingCode(),
            "flat",
            flatStatus(order.getStatus().name()),
            List.of());
    }

    /** GHN status → generic (contract ví dụ: pending, in_transit, delivered). */
    private String mapGhnStatus(String ghnStatus) {
        return switch (ghnStatus == null ? "" : ghnStatus.toLowerCase(Locale.ROOT)) {
            case "ready_to_pick", "picking" -> "pending";
            case "delivered" -> "delivered";
            case "cancel" -> "cancelled";
            case "return" -> "returned";
            default -> "in_transit"; // transporting/storing/sorting/...
        };
    }

    private String flatStatus(String orderStatus) {
        return switch (orderStatus) {
            case "CONFIRMED" -> "pending";
            case "SHIPPED" -> "in_transit";
            case "DELIVERED" -> "delivered";
            case "CANCELLED", "FAILED" -> "cancelled";
            default -> "pending";
        };
    }

    private Integer parseDistrictId(String district) {
        if (district == null || district.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(district.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
