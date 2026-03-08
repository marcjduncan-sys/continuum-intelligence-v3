-- Continuum Intelligence -- Auth and guest conversation support
-- Applied automatically by db.py run_migrations() after 001_initial.sql.

CREATE TABLE IF NOT EXISTS otp_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    code        CHAR(6) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_tokens(email);

-- Allow conversations to belong to a guest device (no user account required).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS guest_id TEXT;
