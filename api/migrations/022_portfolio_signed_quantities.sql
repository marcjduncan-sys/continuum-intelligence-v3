-- 022_portfolio_signed_quantities.sql
-- BEAD-018: Allow negative quantities for short positions.
-- Replaces the notes-field workaround (direction:short) with native
-- signed quantities. Negative quantity = short position.

-- Drop the positive-only constraint on quantity
ALTER TABLE portfolio_holdings DROP CONSTRAINT IF EXISTS holdings_quantity_positive;

-- Add a new constraint allowing negative (short) or positive (long)
-- but not zero (zero-quantity positions are meaningless)
ALTER TABLE portfolio_holdings ADD CONSTRAINT holdings_quantity_nonzero CHECK (quantity != 0);

-- Drop the positive-only constraint on market_value
-- Short positions have negative market value
ALTER TABLE portfolio_holdings DROP CONSTRAINT IF EXISTS holdings_market_value_positive;

-- Backfill: convert direction:short notes into negative quantities
UPDATE portfolio_holdings
   SET quantity = -1 * ABS(quantity),
       market_value = -1 * ABS(market_value),
       notes = NULLIF(REPLACE(COALESCE(notes, ''), 'direction:short', ''), '')
 WHERE notes LIKE '%direction:short%';
