-- LLM call logging for cost tracking and usage analytics (Phase 4)
CREATE TABLE IF NOT EXISTS llm_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    feature TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
    latency_ms INT NOT NULL DEFAULT 0,
    ticker TEXT,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_llm_calls_feature ON llm_calls(feature);
CREATE INDEX IF NOT EXISTS idx_llm_calls_created ON llm_calls(created_at);
