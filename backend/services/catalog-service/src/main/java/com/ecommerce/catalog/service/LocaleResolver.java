package com.ecommerce.catalog.service;

import java.util.Locale;

import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Resolve locale cho GET public (Conventions #4, D17): {@code ?locale} →
 * {@code Accept-Language} (parse prefix) → fallback {@code vi}.
 * Chỉ chấp nhận {@code vi|en} — giá trị khác coi như không truyền.
 * Locale param LUÔN thắng Accept-Language.
 *
 * <p>Bean name PHẢI KHÔNG phải {@code localeResolver} (default = tên class):
 * DispatcherServlet init dò bean đấy theo kiểu
 * {@code org.springframework.web.servlet.LocaleResolver} — trùng tên mà sai
 * kiểu → servlet init fail ở request ĐẦU TIÊN (Allocate exception).</p>
 */
@Component("requestLocaleResolver")
public class LocaleResolver {

    public static final String VI = "vi";
    public static final String EN = "en";

    public String resolve(HttpServletRequest request, String localeParam) {
        if (localeParam != null && !localeParam.isBlank()) {
            String normalized = localeParam.trim().toLowerCase(Locale.ROOT);
            if (normalized.equals(VI) || normalized.equals(EN)) {
                return normalized;
            }
        }
        String header = request == null ? null : request.getHeader(HttpHeaders.ACCEPT_LANGUAGE);
        if (header != null && !header.isBlank()) {
            for (String part : header.split(",")) {
                String tag = part.split(";")[0].trim().toLowerCase(Locale.ROOT);
                if (tag.startsWith(VI)) {
                    return VI;
                }
                if (tag.startsWith(EN)) {
                    return EN;
                }
            }
        }
        return VI;
    }
}
