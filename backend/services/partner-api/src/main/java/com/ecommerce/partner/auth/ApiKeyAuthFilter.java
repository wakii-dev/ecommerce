package com.ecommerce.partner.auth;

import com.ecommerce.common.web.ApiError;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Auth portal đối tác — MỘT filter quyết định 401/403/429 (problem+json, RFC
 * 7807 mirror common-lib ApiError; contract partner-api.yaml):
 * <ol>
 *   <li>401 — thiếu/sai/revoke/hết hạn key (sha256 + constant-time compare).</li>
 *   <li>403 — key hợp lệ nhưng thiếu scope cho endpoint (GAP-5: contract freeze
 *       không định nghĩa 403 — implement theo context pack "scope enforcement").</li>
 *   <li>429 — vượt rate_limit_per_min của key + header {@code Retry-After}.</li>
 * </ol>
 * Exempt: docs portal + actuator (docs portal là cửa tự phục vụ — KHÔNG yêu
 * cầu key; nó không tiết lộ key thật).
 */
@Component
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-API-Key";
    public static final String REQUEST_ATTRIBUTE = "partner.apiKeyPrincipal";

    private static final String APPLICATION_PREFIX = "/open-api/v1";

    private final ApiKeyService apiKeyService;
    private final PartnerRateLimiter rateLimiter;
    private final ObjectMapper objectMapper;

    public ApiKeyAuthFilter(ApiKeyService apiKeyService, PartnerRateLimiter rateLimiter,
                            ObjectMapper objectMapper) {
        this.apiKeyService = apiKeyService;
        this.rateLimiter = rateLimiter;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !(path.equals(APPLICATION_PREFIX) || path.startsWith(APPLICATION_PREFIX + "/"))
            || path.startsWith("/open-api/v1/api-docs")
            || path.equals("/open-api/v1/docs")
            || path.startsWith("/open-api/v1/docs/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String rawKey = request.getHeader(HEADER);
        ApiKeyPrincipal principal = apiKeyService.authenticate(rawKey).orElse(null);
        if (principal == null) {
            writeProblem(response, HttpStatus.UNAUTHORIZED,
                "Unauthorized", "API key thiếu, sai, đã revoke hoặc hết hạn");
            return;
        }

        String requiredScope = requiredScope(request);
        if (requiredScope != null && !principal.hasScope(requiredScope)) {
            writeProblem(response, HttpStatus.FORBIDDEN,
                "Forbidden", "API key thiếu scope '" + requiredScope + "' cho endpoint này");
            return;
        }

        int rateLimitPerMin = principal.rateLimitPerMin();
        var probe = rateLimiter.tryConsume(principal.keyId(), rateLimitPerMin);
        if (!probe.isConsumed()) {
            response.setHeader("Retry-After", Long.toString(PartnerRateLimiter.retryAfterSeconds(probe)));
            writeProblem(response, HttpStatus.TOO_MANY_REQUESTS,
                "Rate limited", "Vượt giới hạn " + rateLimitPerMin + " request/phút của API key");
            return;
        }

        request.setAttribute(REQUEST_ATTRIBUTE, principal);
        chain.doFilter(request, response);
    }

    /**
     * Scope map theo namespace (spec §3.1): đọc catalog → catalog:read,
     * tạo đơn → orders:write, tra cứu đơn → orders:read. Path lạ dưới
     * /open-api/v1 → chỉ cần auth (sẽ 404 ở controller).
     */
    static String requiredScope(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if (path.equals(APPLICATION_PREFIX + "/orders") && "POST".equalsIgnoreCase(method)) {
            return "orders:write";
        }
        if (path.startsWith(APPLICATION_PREFIX + "/orders/")) {
            return "orders:read";
        }
        if (path.startsWith(APPLICATION_PREFIX + "/products")
            || path.equals(APPLICATION_PREFIX + "/categories")
            || path.startsWith(APPLICATION_PREFIX + "/categories/")
            || path.equals(APPLICATION_PREFIX + "/search")) {
            return "catalog:read";
        }
        return null;
    }

    private void writeProblem(HttpServletResponse response, HttpStatus status, String title, String detail)
        throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        ApiError error = ApiError.of(status.value(), title, detail, null, MDC.get("requestId"), List.of());
        objectMapper.writeValue(response.getWriter(), error);
    }
}
