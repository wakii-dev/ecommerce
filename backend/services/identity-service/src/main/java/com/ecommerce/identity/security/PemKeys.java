package com.ecommerce.identity.security;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/** Đọc PEM sinh bởi `make keys` (openssl genpkey = PKCS#8, pubout = SPKI). */
public final class PemKeys {
    private PemKeys() {}

    public static RSAPublicKey readPublicKey(Path path) {
        try {
            String pem = Files.readString(path);
            String body = pem.replaceAll("-----BEGIN PUBLIC KEY-----", "")
                .replaceAll("-----END PUBLIC KEY-----", "")
                .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được public key " + path, e);
        }
    }

    public static RSAPrivateKey readPrivateKey(Path path) {
        try {
            String pem = Files.readString(path);
            String body = pem.replaceAll("-----BEGIN PRIVATE KEY-----", "")
                .replaceAll("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
            byte[] der = Base64.getDecoder().decode(body);
            return (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được private key " + path, e);
        }
    }
}
