-- Migration 017: Research Intelligence Graph - source tables
-- Stores user-uploaded research documents, structured decomposition views,
-- and chunked passages for multi-source retrieval.

-- research_sources: one row per uploaded document
CREATE TABLE IF NOT EXISTS research_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id        TEXT,
    ticker          TEXT NOT NULL,
    source_name     TEXT NOT NULL,
    source_type     TEXT NOT NULL DEFAULT 'broker',
    document_date   DATE,
    file_name       TEXT,
    page_count      INT,
    char_count      INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT sources_owner_check CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sources_ticker ON research_sources (ticker);
CREATE INDEX IF NOT EXISTS idx_sources_user ON research_sources (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sources_guest ON research_sources (guest_id) WHERE guest_id IS NOT NULL;

-- source_views: structured decomposition output per source
CREATE TABLE IF NOT EXISTS source_views (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id            UUID NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
    aligned_hypothesis   TEXT,
    alignment_confidence NUMERIC(3,2),
    direction            TEXT,
    price_target         NUMERIC(18,2),
    conviction_signals   JSONB,
    key_evidence         JSONB,
    key_risks            JSONB,
    summary              TEXT,
    raw_decomposition    JSONB,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_views_source ON source_views (source_id);

-- source_passages: chunked text for retrieval
CREATE TABLE IF NOT EXISTS source_passages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
    ticker      TEXT NOT NULL,
    section     TEXT NOT NULL DEFAULT 'external',
    subsection  TEXT NOT NULL DEFAULT 'uploaded',
    content     TEXT NOT NULL,
    tags        TEXT[] DEFAULT '{}',
    weight      NUMERIC(4,2) NOT NULL DEFAULT 1.0,
    embedding   FLOAT[],
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_passages_ticker ON source_passages (ticker);
CREATE INDEX IF NOT EXISTS idx_source_passages_source ON source_passages (source_id);
