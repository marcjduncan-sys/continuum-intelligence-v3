-- Migration 018: Economist Chat data layer
-- Stores macro/economic series, real-time prices, economic calendar,
-- conversation history, and aggregated state for the Economist module.

-- macro_series: time series from official and vendor sources
CREATE TABLE IF NOT EXISTS macro_series (
    id              SERIAL PRIMARY KEY,
    source          VARCHAR(20) NOT NULL,
    series_id       VARCHAR(100) NOT NULL,
    description     TEXT,
    frequency       VARCHAR(10),
    last_value      DECIMAL,
    last_date       VARCHAR(20),
    previous_value  DECIMAL,
    previous_date   VARCHAR(20),
    unit            VARCHAR(50),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(source, series_id)
);

CREATE INDEX IF NOT EXISTS idx_macro_series_source ON macro_series (source);
CREATE INDEX IF NOT EXISTS idx_macro_series_updated ON macro_series (updated_at);

-- macro_prices: real-time FX, commodity, index prices
CREATE TABLE IF NOT EXISTS macro_prices (
    id          SERIAL PRIMARY KEY,
    symbol      VARCHAR(30) NOT NULL,
    price       DECIMAL NOT NULL,
    change_pct  DECIMAL,
    source      VARCHAR(20),
    fetched_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_macro_prices_symbol ON macro_prices (symbol);
CREATE INDEX IF NOT EXISTS idx_macro_prices_fetched ON macro_prices (fetched_at);

-- economic_calendar: upcoming releases and central bank decisions
CREATE TABLE IF NOT EXISTS economic_calendar (
    id          SERIAL PRIMARY KEY,
    event_date  DATE NOT NULL,
    event_time  TIME,
    country     VARCHAR(5),
    event_name  VARCHAR(200),
    importance  VARCHAR(10),
    actual      VARCHAR(50),
    forecast    VARCHAR(50),
    previous    VARCHAR(50),
    source      VARCHAR(20),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_econ_calendar_unique
    ON economic_calendar (event_date, country, event_name, source);
CREATE INDEX IF NOT EXISTS idx_econ_calendar_date ON economic_calendar (event_date);
CREATE INDEX IF NOT EXISTS idx_econ_calendar_country ON economic_calendar (country);

-- economist_conversations: chat history with macro context
CREATE TABLE IF NOT EXISTS economist_conversations (
    id                      SERIAL PRIMARY KEY,
    user_id                 VARCHAR(100),
    conversation_id         VARCHAR(100) NOT NULL UNIQUE,
    messages                JSONB NOT NULL,
    macro_context_summary   TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_econ_conv_user ON economist_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_econ_conv_convid ON economist_conversations (conversation_id);

-- economist_state: aggregated snapshot state for the module
CREATE TABLE IF NOT EXISTS economist_state (
    id          SERIAL PRIMARY KEY,
    state_data  JSONB NOT NULL,
    summary     TEXT,
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
