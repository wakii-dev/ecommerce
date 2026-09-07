package com.ecommerce.partner.auth;

import java.util.Set;
import java.util.UUID;

/**
 * Principal đã xác thực qua X-API-Key — đeo lên request attribute cho
 * controller (partnerId khóa quyền truy cập đơn; scopes khóa endpoint;
 * rateLimitPerMin nuôi Bucket4j lúc khởi tạo bucket).
 */
public record ApiKeyPrincipal(
    UUID keyId,
    UUID partnerId,
    String partnerName,
    Set<String> scopes,
    int rateLimitPerMin
) {

    public boolean hasScope(String scope) {
        return scopes.contains(scope);
    }
}
