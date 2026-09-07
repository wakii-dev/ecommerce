package com.ecommerce.identity.oauth;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/**
 * Đổi code + lấy profile Google/Facebook (SF-15). Endpoint URI đọc từ
 * {@link OAuthProperties} — IT override sang WireMock (pattern InvoiceClient:
 * SimpleClientHttpRequestFactory + timeout). Provider lỗi/hồ sơ thiếu sub/id →
 * 502 problem+json (callback sẽ 302 FE ?error=provider_error).
 */
@Component
public class OAuthProviderClient {

    private final RestClient rest;
    private final OAuthProperties props;

    public OAuthProviderClient(OAuthProperties props) {
        this.props = props;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(5000);
        this.rest = RestClient.builder().requestFactory(factory).build();
    }

    public ProviderProfile fetchProfile(String provider, String code) {
        OAuthProperties.Provider p = configured(provider);
        String accessToken = exchangeCode(p, code, props.redirectUri(provider));
        JsonNode info = rest.get()
            .uri(p.userInfoUri().contains("{access_token}")
                ? p.userInfoUri().replace("{access_token}", accessToken)
                : appendAccessToken(p.userInfoUri(), accessToken))
            .retrieve()
            .body(JsonNode.class);
        String providerId = info.path("sub").asText(info.path("id").asText(null));
        if (providerId == null || providerId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Provider profile thiếu id");
        }
        String email = info.path("email").asText(null);
        // Google assert email_verified tường minh; Facebook email đã qua verify
        // khi có mặt (đăng ký phone → không email → callback chặn no_email).
        boolean verified = "google".equals(provider)
            ? info.path("email_verified").asBoolean(false)
            : email != null;
        String name = info.path("name").asText(null);
        return new ProviderProfile(provider, providerId, email, verified, name);
    }

    private String exchangeCode(OAuthProperties.Provider p, String code, String redirectUri) {
        try {
            JsonNode token = rest.post()
                .uri(p.tokenUri())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form(code, redirectUri, p))
                .retrieve()
                .body(JsonNode.class);
            String at = token.path("access_token").asText(null);
            if (at == null || at.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Provider không trả access_token");
            }
            return at;
        } catch (ResponseStatusException re) {
            throw re;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Đổi code OAuth lỗi: " + e.getMessage());
        }
    }

    private MultiValueMap<String, String> form(String code, String redirectUri, OAuthProperties.Provider p) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("code", code);
        form.add("client_id", p.clientId());
        form.add("client_secret", p.secret());
        form.add("redirect_uri", redirectUri);
        form.add("grant_type", "authorization_code");
        return form;
    }

    private String appendAccessToken(String userInfoUri, String accessToken) {
        return userInfoUri + (userInfoUri.contains("?") ? "&" : "?") + "access_token=" + accessToken;
    }

    private OAuthProperties.Provider configured(String provider) {
        OAuthProperties.Provider p = props.provider(provider);
        if (p == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provider không hỗ trợ: " + provider);
        }
        if (!p.configured()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provider chưa cấu hình: " + provider);
        }
        return p;
    }
}
