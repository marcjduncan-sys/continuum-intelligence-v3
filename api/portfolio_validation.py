"""
Portfolio validation rules (Phase B).

Pure functions that validate snapshot and holdings data before persistence.
Returns a list of error strings; empty list means valid.
"""

from typing import Any


def validate_snapshot(
    *,
    total_value: float,
    cash_value: float,
    holdings: list[dict],
) -> list[str]:
    """Validate a complete snapshot before saving.

    Each holding dict must have: ticker, quantity, price, market_value.
    Optional: sector, asset_class, notes.
    """
    errors: list[str] = []

    # Total value checks
    if total_value < 0:
        errors.append("total_value must be non-negative")
    if cash_value < 0:
        errors.append("cash_value must be non-negative")
    if cash_value > total_value:
        errors.append("cash_value cannot exceed total_value")

    # Holdings-level checks
    tickers_seen: set[str] = set()
    holdings_sum = 0.0

    for i, h in enumerate(holdings):
        prefix = f"holdings[{i}]"
        ticker = h.get("ticker", "").strip().upper()

        if not ticker:
            errors.append(f"{prefix}: ticker is required")
            continue

        if ticker in tickers_seen:
            errors.append(f"{prefix}: duplicate ticker '{ticker}'")
        tickers_seen.add(ticker)

        qty = h.get("quantity")
        price = h.get("price")
        mv = h.get("market_value")

        if qty is None or qty == 0:
            errors.append(f"{prefix} ({ticker}): quantity must be non-zero")
        if price is None or price <= 0:
            errors.append(f"{prefix} ({ticker}): price must be positive")
        if mv is None or mv == 0:
            errors.append(f"{prefix} ({ticker}): market_value must be non-zero")

        # Cross-check: market_value should be close to quantity * price
        if qty and price and mv:
            expected = qty * price
            tolerance = max(abs(expected) * 0.01, 0.01)  # 1% or $0.01
            if abs(mv - expected) > tolerance:
                errors.append(
                    f"{prefix} ({ticker}): market_value {mv} does not match "
                    f"quantity * price ({qty} * {price} = {expected:.2f})"
                )

        if mv and mv > 0:
            holdings_sum += mv

    # Sum consistency: holdings_sum + cash should approximate total_value
    if holdings and total_value > 0:
        implied_total = holdings_sum + cash_value
        tolerance = max(total_value * 0.01, 0.01)
        if abs(implied_total - total_value) > tolerance:
            errors.append(
                f"Sum inconsistency: holdings ({holdings_sum:.2f}) + cash ({cash_value:.2f}) "
                f"= {implied_total:.2f}, but total_value is {total_value:.2f}"
            )

    return errors
