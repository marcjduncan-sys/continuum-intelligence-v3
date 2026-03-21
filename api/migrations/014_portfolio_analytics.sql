-- 014_portfolio_analytics.sql
-- Phase C: Persist computed analytics per snapshot.
-- analytics_json stores the full output of compute_analytics() as JSONB.
-- One row per snapshot; re-computation overwrites.

CREATE TABLE IF NOT EXISTS portfolio_analytics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id   UUID NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
    analytics_json JSONB NOT NULL,
    thresholds_json JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT analytics_one_per_snapshot UNIQUE (snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshot ON portfolio_analytics (snapshot_id);
