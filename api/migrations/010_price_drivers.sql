-- 010_price_drivers.sql
-- Store daily price driver analysis reports per ticker.

CREATE TABLE IF NOT EXISTS price_driver_reports (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    report_json JSONB NOT NULL,
    analysis_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours',
    UNIQUE(ticker, analysis_date)
);

CREATE INDEX IF NOT EXISTS idx_pdr_ticker_date ON price_driver_reports(ticker, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_pdr_expires ON price_driver_reports(expires_at);
