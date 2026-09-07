-- SF-13 (FI-323) A1 — password reset tokens.
-- Token raw (base64url 43 ký tự) CHỈ nằm trong email link; DB giữ SHA-256 hex
-- (cùng convention refresh_tokens). TTL 30' single-use (used_at).
CREATE TABLE password_reset_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  varchar(64) NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
