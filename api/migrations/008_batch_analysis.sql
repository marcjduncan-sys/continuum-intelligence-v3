-- Batch analysis logging (Phase 8: Memory Consolidation)
-- Records each nightly batch run and every individual consolidation action.

CREATE TABLE IF NOT EXISTS memory_batch_runs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ,
    users_processed  INTEGER,
    memories_merged  INTEGER,
    memories_retired INTEGER,
    error            TEXT
);

CREATE TABLE IF NOT EXISTS memory_consolidation_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_run_id  UUID REFERENCES memory_batch_runs(id) ON DELETE CASCADE,
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id      TEXT,
    action        TEXT NOT NULL CHECK (action IN ('merged', 'retired', 'evolved')),
    source_ids    UUID[] NOT NULL DEFAULT '{}',
    target_id     UUID,
    reason        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_events_run  ON memory_consolidation_events(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_batch_events_user ON memory_consolidation_events(user_id) WHERE user_id IS NOT NULL;
