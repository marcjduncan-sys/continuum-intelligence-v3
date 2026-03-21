-- Phase E: PM Memory and Journal Integration
-- Separate PM conversation, decision, and insight persistence from Analyst memory.

-- PM conversations are per-portfolio (not per-ticker like Analyst).
CREATE TABLE IF NOT EXISTS pm_conversations (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                    TEXT,
    guest_id                   TEXT,
    portfolio_id               UUID REFERENCES portfolios(id) ON DELETE SET NULL,
    snapshot_id                UUID REFERENCES portfolio_snapshots(id) ON DELETE SET NULL,
    started_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at            TIMESTAMPTZ,
    summary                    TEXT,
    summary_cursor_message_id  UUID
);

CREATE INDEX IF NOT EXISTS idx_pm_conversations_user
    ON pm_conversations (user_id, last_message_at DESC NULLS LAST)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pm_conversations_guest
    ON pm_conversations (guest_id, last_message_at DESC NULLS LAST)
    WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pm_conversations_portfolio
    ON pm_conversations (portfolio_id, last_message_at DESC NULLS LAST)
    WHERE portfolio_id IS NOT NULL;

-- PM messages within a PM conversation.
CREATE TABLE IF NOT EXISTS pm_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pm_conversation_id  UUID NOT NULL REFERENCES pm_conversations(id) ON DELETE CASCADE,
    role                TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content             TEXT NOT NULL,
    metadata_json       TEXT,  -- response metadata (breaches, alignment_score, etc.)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_messages_conversation
    ON pm_messages (pm_conversation_id, created_at ASC);

-- PM decisions: explicit structured log of portfolio decisions.
-- Each row = one actionable recommendation from PM, with full decision basis.
CREATE TABLE IF NOT EXISTS pm_decisions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               TEXT,
    guest_id              TEXT,
    pm_conversation_id    UUID REFERENCES pm_conversations(id) ON DELETE SET NULL,
    pm_message_id         UUID REFERENCES pm_messages(id) ON DELETE SET NULL,
    action_type           TEXT NOT NULL CHECK (action_type IN (
        'trim', 'add', 'exit', 'hold', 'rebalance', 'watch', 'no_action'
    )),
    ticker                TEXT,
    rationale             TEXT NOT NULL,
    sizing_band           TEXT,            -- e.g. "2-3%"
    source_of_funds       TEXT,            -- e.g. "trim CBA proceeds"
    mandate_basis         TEXT,            -- e.g. "max_position_size: 10%"
    breach_codes          TEXT[],          -- active breach codes at decision time
    coverage_state        TEXT CHECK (coverage_state IN ('covered', 'not_covered', 'mixed', NULL)),
    decision_basis        JSONB NOT NULL,  -- compact snapshot of decision context
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_decisions_user
    ON pm_decisions (user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pm_decisions_guest
    ON pm_decisions (guest_id, created_at DESC)
    WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pm_decisions_ticker
    ON pm_decisions (ticker, created_at DESC)
    WHERE ticker IS NOT NULL;

-- PM insights: extracted observations from PM conversations.
-- Conservative taxonomy, separate from Analyst memories.
CREATE TABLE IF NOT EXISTS pm_insights (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               TEXT,
    guest_id              TEXT,
    pm_conversation_id    UUID REFERENCES pm_conversations(id) ON DELETE SET NULL,
    pm_message_id         UUID REFERENCES pm_messages(id) ON DELETE SET NULL,
    insight_type          TEXT NOT NULL CHECK (insight_type IN (
        'pm_decision', 'portfolio_risk', 'mandate_breach',
        'sizing_principle', 'rebalance_suggestion',
        'uncovered_exposure', 'change_alert'
    )),
    content               TEXT NOT NULL,
    tickers               TEXT[],         -- can relate to multiple tickers
    tags                  TEXT[],
    confidence            FLOAT NOT NULL DEFAULT 0.5,
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    archived_at           TIMESTAMPTZ,    -- set on archive (not delete)
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pm_insights_user_active
    ON pm_insights (user_id, created_at DESC)
    WHERE user_id IS NOT NULL AND active = TRUE;

CREATE INDEX IF NOT EXISTS idx_pm_insights_guest_active
    ON pm_insights (guest_id, created_at DESC)
    WHERE guest_id IS NOT NULL AND active = TRUE;

CREATE INDEX IF NOT EXISTS idx_pm_insights_type
    ON pm_insights (insight_type, created_at DESC)
    WHERE active = TRUE;
