-- Migration 021: Macro sensitivity registry (replaces macro_sensitivity.json).
-- Stores per-ticker macro variable sensitivity with direction and magnitude.
-- Seeded from existing JSON. New tickers get auto-inferred entries during
-- coverage initiation.

CREATE TABLE IF NOT EXISTS macro_sensitivity (
    id          SERIAL PRIMARY KEY,
    ticker      VARCHAR(20) NOT NULL,
    macro_key   VARCHAR(50) NOT NULL,
    direction   VARCHAR(10) NOT NULL,
    magnitude   VARCHAR(10) NOT NULL,
    source      VARCHAR(20) NOT NULL DEFAULT 'manual',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(ticker, macro_key)
);

CREATE INDEX IF NOT EXISTS idx_ms_ticker ON macro_sensitivity (ticker);
CREATE INDEX IF NOT EXISTS idx_ms_macro_key ON macro_sensitivity (macro_key);

-- Seed from existing JSON (idempotent)
INSERT INTO macro_sensitivity (ticker, macro_key, direction, magnitude, source) VALUES
    ('BHP', 'iron_ore', 'positive', 'high', 'manual'),
    ('BHP', 'copper', 'positive', 'medium', 'manual'),
    ('BHP', 'gold', 'positive', 'low', 'manual'),
    ('FMG', 'iron_ore', 'positive', 'high', 'manual'),
    ('FMG', 'copper', 'positive', 'low', 'manual'),
    ('RIO', 'iron_ore', 'positive', 'high', 'manual'),
    ('RIO', 'copper', 'positive', 'medium', 'manual'),
    ('RIO', 'gold', 'positive', 'low', 'manual'),
    ('MIN', 'iron_ore', 'positive', 'high', 'manual'),
    ('MIN', 'copper', 'positive', 'low', 'manual'),
    ('HRZ', 'gold', 'positive', 'high', 'manual'),
    ('NST', 'gold', 'positive', 'high', 'manual'),
    ('EVN', 'gold', 'positive', 'high', 'manual'),
    ('WAF', 'gold', 'positive', 'high', 'manual'),
    ('ASB', 'gold', 'positive', 'high', 'manual'),
    ('OBM', 'gold', 'positive', 'high', 'manual'),
    ('WIA', 'gold', 'positive', 'high', 'manual'),
    ('WDS', 'brent_crude', 'positive', 'high', 'manual'),
    ('WDS', 'natural_gas', 'positive', 'medium', 'manual'),
    ('WDS', 'audusd', 'negative', 'low', 'manual'),
    ('STO', 'brent_crude', 'positive', 'high', 'manual'),
    ('STO', 'natural_gas', 'positive', 'medium', 'manual'),
    ('RMC', 'brent_crude', 'positive', 'high', 'manual'),
    ('RMC', 'natural_gas', 'positive', 'medium', 'manual'),
    ('WOR', 'brent_crude', 'positive', 'medium', 'manual'),
    ('WOR', 'natural_gas', 'positive', 'medium', 'manual'),
    ('CBA', 'us10y', 'positive', 'medium', 'manual'),
    ('CBA', 'rba_cash_rate', 'positive', 'high', 'manual'),
    ('CBA', 'audusd', 'mixed', 'medium', 'manual'),
    ('NAB', 'us10y', 'positive', 'medium', 'manual'),
    ('NAB', 'rba_cash_rate', 'positive', 'high', 'manual'),
    ('NAB', 'audusd', 'mixed', 'medium', 'manual'),
    ('MQG', 'us10y', 'mixed', 'medium', 'manual'),
    ('MQG', 'audusd', 'negative', 'medium', 'manual'),
    ('MQG', 'gold', 'positive', 'low', 'manual'),
    ('CSL', 'audusd', 'negative', 'high', 'manual'),
    ('SIG', 'audusd', 'negative', 'medium', 'manual'),
    ('PME', 'audusd', 'negative', 'high', 'manual'),
    ('XRO', 'audusd', 'negative', 'high', 'manual'),
    ('WTC', 'audusd', 'negative', 'medium', 'manual'),
    ('WTC', 'brent_crude', 'negative', 'low', 'manual'),
    ('OCL', 'audusd', 'negative', 'medium', 'manual'),
    ('DXS', 'rba_cash_rate', 'negative', 'high', 'manual'),
    ('DXS', 'audusd', 'mixed', 'low', 'manual'),
    ('GMG', 'rba_cash_rate', 'negative', 'medium', 'manual'),
    ('GMG', 'audusd', 'mixed', 'low', 'manual'),
    ('WOW', 'audusd', 'negative', 'low', 'manual'),
    ('GYG', 'audusd', 'negative', 'low', 'manual'),
    ('RFG', 'audusd', 'negative', 'low', 'manual'),
    ('DRO', 'audusd', 'negative', 'medium', 'manual'),
    ('REA', 'rba_cash_rate', 'negative', 'high', 'manual'),
    ('REA', 'audusd', 'mixed', 'low', 'manual')
ON CONFLICT (ticker, macro_key) DO NOTHING;
