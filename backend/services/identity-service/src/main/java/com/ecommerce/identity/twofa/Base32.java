package com.ecommerce.identity.twofa;

/** RFC 4648 Base32 (A-Z, 2-7) tối thiểu cho secret TOTP — không kéo codec lib. */
public final class Base32 {

    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    private Base32() {}

    public static String encode(byte[] data) {
        StringBuilder out = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = 0;
        int bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xFF);
            bits += 8;
            while (bits >= 5) {
                out.append(ALPHABET.charAt((buffer >> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) out.append(ALPHABET.charAt((buffer << (5 - bits)) & 31));
        return out.toString();
    }

    public static byte[] decode(String input) {
        String clean = input.trim().replace("=", "").replace(" ", "").toUpperCase();
        int outLen = clean.length() * 5 / 8;
        byte[] out = new byte[outLen];
        int buffer = 0;
        int bits = 0;
        int index = 0;
        for (char c : clean.toCharArray()) {
            int value = ALPHABET.indexOf(c);
            if (value < 0) throw new IllegalArgumentException("Ký tự Base32 không hợp lệ: " + c);
            buffer = (buffer << 5) | value;
            bits += 5;
            if (bits >= 8 && index < outLen) {
                out[index++] = (byte) ((buffer >> (bits - 8)) & 0xFF);
                bits -= 8;
            }
        }
        return out;
    }
}
