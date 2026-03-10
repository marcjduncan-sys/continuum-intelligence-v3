-- Memory embeddings (Phase 7: Memory Selection & Ranking)
-- Stores vector embeddings alongside each memory for semantic similarity search.
-- Uses FLOAT[] (not pgvector) — cosine similarity computed in Python at query time.

ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding FLOAT[];
