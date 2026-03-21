-- Analyst-to-PM and PM-to-Analyst handoff log (Phase F)
--
-- Every cross-role handoff is logged here: which role initiated, the ticker,
-- the summary payload delivered, and the originating conversation.
-- This provides a full audit trail of how the two roles collaborate.

CREATE TABLE IF NOT EXISTS handoffs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 TEXT,
    guest_id                TEXT,
    source_role             TEXT NOT NULL CHECK (source_role IN ('analyst', 'pm')),
    destination_role        TEXT NOT NULL CHECK (destination_role IN ('analyst', 'pm')),
    ticker                  TEXT NOT NULL,

    -- The summary payload delivered to the destination role
    summary_payload         JSONB NOT NULL,

    -- Originating conversation (from the source role)
    source_conversation_id  TEXT,

    -- Handoff context
    handoff_reason          TEXT,
    coverage_state          TEXT CHECK (coverage_state IN ('covered', 'not_covered', 'stale', NULL)),
    analyst_summary_version TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handoffs_user
    ON handoffs(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_handoffs_guest
    ON handoffs(guest_id, created_at DESC) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_handoffs_ticker
    ON handoffs(ticker, created_at DESC);
