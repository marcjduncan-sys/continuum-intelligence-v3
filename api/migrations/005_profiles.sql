-- Personalisation profiles (Phase 5: Server-Side Prompt Assembly)
-- One profile per user (upserted on save). Guest users supported via guest_id.

CREATE TABLE IF NOT EXISTS profiles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id   TEXT,
    data       JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_guest ON profiles(guest_id) WHERE guest_id IS NOT NULL;
