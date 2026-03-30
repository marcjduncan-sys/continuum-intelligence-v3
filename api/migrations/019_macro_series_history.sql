-- Migration 019: Macro series history for regime detection rolling stats.
-- macro_series stores only the latest + previous value per series (upsert).
-- This table appends each observation so we can compute 30-day rolling
-- mean and standard deviation for regime break threshold detection.
-- Retention: 90 days (pruned by application code after each append cycle).

CREATE TABLE IF NOT EXISTS macro_series_history (
    id          SERIAL PRIMARY KEY,
    source      VARCHAR(20) NOT NULL,
    series_id   VARCHAR(100) NOT NULL,
    value       DECIMAL,
    obs_date    VARCHAR(20),
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msh_lookup
    ON macro_series_history (source, series_id, recorded_at);
