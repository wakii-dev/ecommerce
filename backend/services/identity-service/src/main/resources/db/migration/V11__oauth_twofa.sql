-- SF-15 (FI-325) — OAuth identities + one-time codes + 2FA TOTP (D22).
-- users.password_hash NULL cho OAuth-only user (login bằng provider, không password).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Google/Facebook identity link — find-or-create theo (provider, provider_id),
-- email trùng user có sẵn → link (không tạo duplicate user).
CREATE TABLE user_identities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    varchar(16) NOT NULL CHECK (provider IN ('google','facebook')),
  provider_id varchar(191) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);

-- One-time code: callback 302 về FE kèm code (query), FE đổi lấy token qua
-- POST /oauth/exchange. DB chỉ giữ SHA-256 hash; TTL 60s, single-use.
CREATE TABLE oauth_one_time_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash   varchar(64) NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2FA TOTP: secret mã hóa AES-GCM (IDENTITY_2FA_KEY); pending = setup chờ
-- enable; backup_codes lưu BCrypt hash (plaintext chỉ hiện 1 lần lúc enable).
CREATE TABLE two_factor (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc         bytea,
  enabled            boolean NOT NULL DEFAULT false,
  pending_secret_enc bytea,
  backup_codes       text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  enabled_at         timestamptz
);

-- Challenge login 2FA: token raw trả client, DB giữ SHA-256 hash; TTL ngắn,
-- single-use, sai code 5 lần → consume luôn (phải đăng nhập lại).
CREATE TABLE two_factor_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      varchar(64) NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  failed_attempts int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_two_factor_challenges_user ON two_factor_challenges(user_id);
