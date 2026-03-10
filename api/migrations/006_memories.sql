-- Memory extraction storage (Phase 6)
-- Stores durable observations about each user extracted from conversation turns.
-- Three memory types with different decay rates (applied at query time in Phase 7):
--   structural: never decays
--   positional: 90-day half-life
--   tactical: 14-day half-life

CREATE TABLE IF NOT EXISTS memories (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id               TEXT,
    memory_type            TEXT NOT NULL CHECK (memory_type IN ('structural', 'positional', 'tactical')),
    content                TEXT NOT NULL,
    ticker                 TEXT,
    tags                   TEXT[] NOT NULL DEFAULT '{}',
    confidence             FLOAT NOT NULL DEFAULT 1.0,
    source_conversation_id UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    active                 BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_memories_user   ON memories(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_guest  ON memories(guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_ticker ON memories(ticker) WHERE ticker IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_active ON memories(active) WHERE active = TRUE;
