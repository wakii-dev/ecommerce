package com.ecommerce.ordering;

import com.ecommerce.ordering.api.dto.CouponDtos.AdminCouponRequest;
import com.ecommerce.ordering.domain.Coupon;
import com.ecommerce.ordering.domain.CouponType;
import com.ecommerce.ordering.repo.CouponRepository;
import com.ecommerce.ordering.repo.CouponReservationRepository;
import com.ecommerce.ordering.service.CouponService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * CouponService UNIT test (FI-408 QA sweep — sửa coupon edit 400 từ UI):
 * Mockito mock repo — KHÔNG Spring context/Testcontainers, chạy lẻ được
 * {@code mvn -pl services/ordering-service -Dtest='Coupon*' test} (AdminCouponApiTest
 * là IT Testcontainers — chi tiết round-trip HTTP xem đó).
 *
 * Contract sau fix QA-F2-03: PUT /admin/coupons/{code} — PATH code là
 * authority (FE contract client strip path-param khỏi body → body.code từ UI
 * là null); adminCreate GIỮ nguyên behavior cũ (code bắt buộc trong body).
 */
@ExtendWith(MockitoExtension.class)
class CouponServiceTest {

    @Mock
    CouponRepository coupons;
    @Mock
    CouponReservationRepository reservations;

    CouponService service;

    @BeforeEach
    void setUp() {
        service = new CouponService(coupons, reservations);
    }

    /** Body giống UI edit gửi lên (code thường null sau khi contract client strip). */
    private AdminCouponRequest req(String code) {
        return new AdminCouponRequest(code, "PERCENT", 15, 100_000L,
            null, Instant.now().plusSeconds(3600), 9, true, "unit");
    }

    private Coupon existing(String code) {
        return new Coupon(code, CouponType.PERCENT, 10, 100_000L,
            Instant.now(), null, 5, "demo");
    }

    @Test
    void update_nullBodyCode_pathCodeWins_updateApplies() {
        Coupon c = existing("WELCOME10");
        when(coupons.findByCode("WELCOME10")).thenReturn(Optional.of(c));
        when(coupons.save(c)).thenReturn(c);

        // 200-path: body KHÔNG code → validateAdminRest pass, applyUpdate chạy
        Coupon out = service.adminUpdate("WELCOME10", req(null));
        assertThat(out.getCode()).isEqualTo("WELCOME10");
        assertThat(out.getValue()).isEqualTo(15);
        assertThat(out.getUsageLimit()).isEqualTo(9);
    }

    @Test
    void update_blankBodyCode_treatedAsAbsent_ok() {
        Coupon c = existing("GIAM50K");
        when(coupons.findByCode("GIAM50K")).thenReturn(Optional.of(c));
        when(coupons.save(c)).thenReturn(c);
        assertThat(service.adminUpdate("GIAM50K", req("   ")).getCode()).isEqualTo("GIAM50K");
    }

    @Test
    void update_bodyCodeCaseInsensitiveMatch_ok() {
        Coupon c = existing("WELCOME10");
        when(coupons.findByCode("WELCOME10")).thenReturn(Optional.of(c)); // path uppercase trước khi lookup
        when(coupons.save(c)).thenReturn(c);
        assertThat(service.adminUpdate("welcome10", req("WELCOME10")).getValue()).isEqualTo(15);
    }

    @Test
    void update_mismatchedBodyCode_throws_beforeDb() {
        assertThatThrownBy(() -> service.adminUpdate("WELCOME10", req("OTHERCODE")))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("code trong body không khớp code trên path");
        verify(coupons, never()).findByCode(anyString()); // fail TRƯỚC khi đụng DB
    }

    @Test
    void update_badPathCodeFormat_throws() {
        assertThatThrownBy(() -> service.adminUpdate("it bad code!", req(null)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("code không hợp lệ (1-64 ký tự [A-Za-z0-9_-])");
        assertThatThrownBy(() -> service.adminUpdate("  ", req(null)))
            .hasMessageContaining("code không hợp lệ");
        verify(coupons, never()).findByCode(anyString());
    }

    @Test
    void create_nullBodyCode_stillThrows_unchanged() {
        // adminCreate byte-identical: POST không có path code → body.code bắt buộc
        assertThatThrownBy(() -> service.adminCreate(req(null)))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("code không hợp lệ (1-64 ký tự [A-Za-z0-9_-])");
        verify(coupons, never()).findByCode(anyString());
    }
}
