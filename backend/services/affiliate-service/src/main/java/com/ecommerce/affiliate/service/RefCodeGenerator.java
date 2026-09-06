package com.ecommerce.affiliate.service;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Sinh ref code 8 ký tự (pack: code unique 8 ký tự) — alphabet bỏ ký tự dễ
 * nhầm (I, O, 0, 1) cho link nói miệng được; retry ở caller nếu đụng unique.
 */
@Component
public class RefCodeGenerator {

    public static final int CODE_LENGTH = 8;

    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final SecureRandom random = new SecureRandom();

    public String generate() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
