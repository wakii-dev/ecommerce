package com.ecommerce.identity.twofa;

import com.ecommerce.identity.twofa.TwoFactorDtos.EnableResponse;
import com.ecommerce.identity.twofa.TwoFactorDtos.SetupResponse;
import com.ecommerce.identity.user.UserEntity;
import com.ecommerce.identity.user.UserRepository;
import com.eatthepath.otp.TimeBasedOneTimePasswordGenerator;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.Key;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * 2FA TOTP (SF-15, D22): setup (secret pending + otpauth URL) → enable (verify
 * mã đầu, sinh backup codes) → login challenge → verify (TOTP ±1 bước hoặc
 * backup code dùng 1 lần) → disable (password + mã). secret at-rest AES-GCM.
 */
@Service
public class TwoFactorService {

    static final String ISSUER = "ShopVN";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final TwoFactorRepository repository;
    private final TwoFactorChallengeRepository challengeRepository;
    private final UserRepository userRepository;
    private final SecretCipher cipher;
    private final PasswordEncoder passwordEncoder;
    private final TwoFactorProperties props;
    private final TimeBasedOneTimePasswordGenerator totp;

    public TwoFactorService(TwoFactorRepository repository, TwoFactorChallengeRepository challengeRepository,
                            UserRepository userRepository, SecretCipher cipher,
                            PasswordEncoder passwordEncoder, TwoFactorProperties props) {
        this.repository = repository;
        this.challengeRepository = challengeRepository;
        this.userRepository = userRepository;
        this.cipher = cipher;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.totp = new TimeBasedOneTimePasswordGenerator(Duration.ofSeconds(30), 6,
            TimeBasedOneTimePasswordGenerator.TOTP_ALGORITHM_HMAC_SHA1);
    }

    /** POST /2fa/setup — sinh secret pending; 409 nếu đã enabled. */
    @Transactional
    public SetupResponse setup(UUID userId, String email) {
        TwoFactorEntity entity = repository.findByUserId(userId).orElseGet(() -> {
            TwoFactorEntity fresh = new TwoFactorEntity();
            fresh.setUserId(userId);
            return fresh;
        });
        if (entity.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "2FA đã bật từ trước");
        }
        byte[] secretBytes = new byte[20]; // 160-bit (RFC 4226 khuyến nghị)
        RANDOM.nextBytes(secretBytes);
        String base32 = Base32.encode(secretBytes);
        entity.setPendingSecretEnc(cipher.encrypt(secretBytes));
        repository.save(entity);
        String otpauth = "otpauth://totp/" + ISSUER + ":" + email
            + "?secret=" + base32 + "&issuer=" + ISSUER;
        return new SetupResponse(base32, otpauth);
    }

    /** POST /2fa/enable — verify mã TOTP đầu tiên từ pending; trả backup codes 1 lần. */
    @Transactional
    public EnableResponse enable(UUID userId, String code) {
        TwoFactorEntity entity = repository.findByUserId(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chưa setup 2FA"));
        if (entity.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "2FA đã bật từ trước");
        }
        if (entity.getPendingSecretEnc() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chưa setup 2FA");
        }
        byte[] secret = cipher.decrypt(entity.getPendingSecretEnc());
        if (!totpMatches(secret, code)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã không đúng — thử lại");
        }
        entity.setSecretEnc(entity.getPendingSecretEnc());
        entity.setPendingSecretEnc(null);
        entity.setEnabled(true);
        entity.setEnabledAt(Instant.now());
        List<String> plain = generateBackupCodes(entity);
        repository.save(entity);
        return new EnableResponse(plain);
    }

    /**
     * POST /2fa/disable — password + mã (REQUIREMENT-GAP #2: schema freeze chỉ
     * có {password}; code optional về shape, BẮT BUỘC về semantics).
     */
    @Transactional
    public void disable(UUID userId, String password, String code) {
        UserEntity user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (user.getPasswordHash() == null
            || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Mật khẩu không đúng");
        }
        TwoFactorEntity entity = repository.findByUserId(userId)
            .filter(TwoFactorEntity::isEnabled)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "2FA chưa bật"));
        if (code == null || code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thiếu mã xác nhận 2FA");
        }
        if (!verifyCode(entity, code)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã không đúng");
        }
        repository.delete(entity);
    }

    /** Login branch: user đã bật 2FA chưa. */
    @Transactional(readOnly = true)
    public boolean isEnabled(UUID userId) {
        return repository.existsByUserIdAndEnabledTrue(userId);
    }

    /** Login: password đúng + enabled → cấp challenge thay vì token. */
    @Transactional
    public String issueChallenge(UserEntity user) {
        challengeRepository.deleteExpired(Instant.now());
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        TwoFactorChallengeEntity entity = new TwoFactorChallengeEntity();
        entity.setUser(user);
        entity.setTokenHash(sha256Hex(token));
        entity.setExpiresAt(Instant.now().plusSeconds(props.challengeTtlSeconds()));
        challengeRepository.save(entity);
        return token;
    }

    /**
     * POST /2fa/verify (không JWT): challenge còn hạn + chưa dùng; code =
     * TOTP hoặc backup (dùng → xóa khỏi mảng). Sai → failed_attempts++, đạt
     * 5 → consume (phải đăng nhập lại). Thành công → consume + trả user.
     *
     * Trả Outcome thay vì throw: method @Transactional — ném exception ở đây
     * sẽ ROLL BACK cả failed_attempts/consume đã ghi (commit phải kèm path
     * thất bại). Controller mới map ok=false → 401.
     */
    @Transactional
    public VerifyOutcome verifyChallenge(String challengeToken, String code) {
        if (challengeToken == null || challengeToken.isBlank() || code == null || code.isBlank()) {
            return VerifyOutcome.fail();
        }
        String hash = sha256Hex(challengeToken);
        TwoFactorChallengeEntity challenge = challengeRepository.findByTokenHash(hash)
            .orElse(null);
        if (challenge == null || challenge.getConsumedAt() != null
            || challenge.getExpiresAt().isBefore(Instant.now())) {
            return VerifyOutcome.fail();
        }
        TwoFactorEntity entity = repository.findByUserId(challenge.getUser().getId())
            .filter(TwoFactorEntity::isEnabled)
            .orElse(null);
        if (entity == null) return VerifyOutcome.fail();
        if (!verifyCode(entity, code)) {
            int attempts = challenge.getFailedAttempts() + 1;
            challenge.setFailedAttempts(attempts);
            if (attempts >= TwoFactorChallengeEntity.MAX_FAILED_ATTEMPTS) {
                challenge.setConsumedAt(Instant.now()); // cap 5 — chặn brute force
            }
            challengeRepository.save(challenge);
            return VerifyOutcome.fail();
        }
        if (challengeRepository.consumeIfActive(hash, Instant.now()) != 1) {
            return VerifyOutcome.fail();
        }
        return userRepository.findById(challenge.getUser().getId())
            .map(VerifyOutcome::new)
            .orElseGet(VerifyOutcome::fail);
    }

    /** Kết quả verify — user null = thất bại (controller → 401). */
    public record VerifyOutcome(UserEntity user) {
        public static VerifyOutcome fail() { return new VerifyOutcome(null); }
        public boolean ok() { return user != null; }
    }

    /** Mã TOTP hiện tại (±1 bước 30s) hoặc 1 backup code (match → xóa — 1 lần). */
    boolean verifyCode(TwoFactorEntity entity, String code) {
        if (entity.getSecretEnc() != null && totpMatches(cipher.decrypt(entity.getSecretEnc()), code)) {
            return true;
        }
        List<String> hashes = entity.getBackupCodes();
        for (int i = 0; i < hashes.size(); i++) {
            if (passwordEncoder.matches(code, hashes.get(i))) {
                hashes.remove(i);
                repository.save(entity);
                return true;
            }
        }
        return false;
    }

    private boolean totpMatches(byte[] secret, String code) {
        if (code == null || !code.matches("\\d{6}")) return false;
        Key key = new SecretKeySpec(secret, totp.getAlgorithm());
        Instant now = Instant.now();
        for (Instant step : new Instant[] {now.minusSeconds(30), now, now.plusSeconds(30)}) {
            try {
                int expected = totp.generateOneTimePassword(key, step);
                if (Integer.parseInt(code) == expected) return true;
            } catch (InvalidKeyException e) {
                throw new IllegalStateException("TOTP key lỗi", e);
            }
        }
        return false;
    }

    private List<String> generateBackupCodes(TwoFactorEntity entity) {
        List<String> plain = new ArrayList<>();
        List<String> hashes = new ArrayList<>();
        for (int i = 0; i < props.backupCodeCount(); i++) {
            StringBuilder code = new StringBuilder(8);
            for (int j = 0; j < 8; j++) {
                code.append(BACKUP_ALPHABET.charAt(RANDOM.nextInt(BACKUP_ALPHABET.length())));
            }
            plain.add(code.toString());
            hashes.add(passwordEncoder.encode(code.toString()));
        }
        entity.setBackupCodes(hashes);
        return plain;
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
