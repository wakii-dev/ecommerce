-- users + refresh_tokens — SF-3 (pack pin; role single column, API expose roles[]).
-- Đặt V10 theo convention fork template (V1 = schema nền outbox dùng chung).
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(255) NOT NULL UNIQUE,
  password_hash varchar(100) NOT NULL,
  full_name     varchar(255) NOT NULL,
  phone         varchar(32),
  role          varchar(16)  NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER','ADMIN')),
  status        varchar(16)  NOT NULL DEFAULT 'ACTIVE',
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
