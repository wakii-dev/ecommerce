package com.demo;

// Fixture @Value — dòng comment phải bị bỏ qua: // @Value("${COMMENTED_TOKEN:x}")
public class AlphaDecoder {
    public AlphaDecoder(@Value("${ALPHA_INTERNAL_TOKEN:dev-token}") String token) {
    }
}
