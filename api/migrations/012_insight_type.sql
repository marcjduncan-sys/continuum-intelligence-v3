-- Add insight_type column to memories table for card-level classification.
-- Values: conviction, risk_flag, valuation, thesis_challenge, process_note.
-- Nullable: existing memories use NULL (frontend falls back to heuristic).

ALTER TABLE memories ADD COLUMN IF NOT EXISTS insight_type TEXT;
