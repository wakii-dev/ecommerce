-- SF-13 (FI-323) A8 — newsletter subscriptions (email unique — không double).
CREATE TABLE newsletter_subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email      varchar(255) NOT NULL UNIQUE,
    created_at timestamptz  NOT NULL DEFAULT now()
);
