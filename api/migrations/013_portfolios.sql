-- 013_portfolios.sql
-- Phase B: Portfolio data layer.
-- Three tables: portfolios, portfolio_snapshots, portfolio_holdings.
-- Design: store market_value and quantity/price per holding; derive weights
-- deterministically in the service layer. No weight column stored.

-- ---------------------------------------------------------------------------
-- portfolios -- one per user/guest, named, with optional metadata
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id      TEXT,
    name          TEXT NOT NULL DEFAULT 'Default',
    currency      TEXT NOT NULL DEFAULT 'AUD',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT portfolios_owner_check CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portfolios_guest_id ON portfolios (guest_id) WHERE guest_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- portfolio_snapshots -- point-in-time captures of a portfolio
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id  UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    as_of_date    DATE NOT NULL,
    total_value   NUMERIC(18, 2) NOT NULL DEFAULT 0,
    cash_value    NUMERIC(18, 2) NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT snapshots_total_non_negative CHECK (total_value >= 0),
    CONSTRAINT snapshots_cash_non_negative CHECK (cash_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio_date
    ON portfolio_snapshots (portfolio_id, as_of_date DESC);

-- ---------------------------------------------------------------------------
-- portfolio_holdings -- individual positions within a snapshot
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id   UUID NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
    ticker        TEXT NOT NULL,
    quantity      NUMERIC(18, 6) NOT NULL,
    price         NUMERIC(18, 6) NOT NULL,
    market_value  NUMERIC(18, 2) NOT NULL,
    sector        TEXT,
    asset_class   TEXT NOT NULL DEFAULT 'equity',
    notes         TEXT,
    CONSTRAINT holdings_quantity_positive CHECK (quantity > 0),
    CONSTRAINT holdings_price_positive CHECK (price > 0),
    CONSTRAINT holdings_market_value_positive CHECK (market_value > 0),
    CONSTRAINT holdings_no_duplicate_ticker UNIQUE (snapshot_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_holdings_snapshot ON portfolio_holdings (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON portfolio_holdings (ticker);
