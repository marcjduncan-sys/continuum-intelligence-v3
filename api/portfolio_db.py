"""
Portfolio data access layer (Phase B).

CRUD operations for portfolios, snapshots, and holdings.
Follows the same patterns as db.py: pool guard, asyncpg, dict returns.
Weights are derived deterministically -- never stored.
"""

import logging
from datetime import date
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Portfolio CRUD
# ---------------------------------------------------------------------------

async def create_portfolio(
    pool,
    *,
    name: str = "Default",
    currency: str = "AUD",
    user_id: str | None = None,
    guest_id: str | None = None,
) -> str | None:
    """Create a portfolio. Returns portfolio id as string."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO portfolios (name, currency, user_id, guest_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            name,
            currency,
            user_id,
            guest_id,
        )
        return str(row["id"]) if row else None


async def get_portfolios(
    pool,
    *,
    user_id: str | None = None,
    guest_id: str | None = None,
    active_only: bool = True,
) -> list[dict]:
    """List portfolios for a user or guest."""
    if pool is None:
        return []
    clauses = []
    params: list[Any] = []
    if user_id:
        params.append(user_id)
        clauses.append(f"user_id = ${len(params)}::uuid")
    if guest_id:
        params.append(guest_id)
        clauses.append(f"guest_id = ${len(params)}")
    if active_only:
        clauses.append("active = TRUE")
    where = " AND ".join(clauses) if clauses else "TRUE"
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT id, name, currency, created_at, updated_at, active "
            f"FROM portfolios WHERE {where} ORDER BY created_at",
            *params,
        )
        return [dict(r) for r in rows]


async def get_portfolio(pool, portfolio_id: str) -> dict | None:
    """Fetch a single portfolio by id."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, user_id, guest_id, name, currency, created_at, updated_at, active "
            "FROM portfolios WHERE id = $1::uuid",
            portfolio_id,
        )
        return dict(row) if row else None


async def deactivate_portfolio(pool, portfolio_id: str) -> bool:
    """Soft-delete a portfolio. Returns True if updated."""
    if pool is None:
        return False
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE portfolios SET active = FALSE, updated_at = now() WHERE id = $1::uuid",
            portfolio_id,
        )
        return result == "UPDATE 1"


# ---------------------------------------------------------------------------
# Snapshot CRUD
# ---------------------------------------------------------------------------

async def create_snapshot(
    pool,
    *,
    portfolio_id: str,
    as_of_date: date,
    total_value: float = 0,
    cash_value: float = 0,
    notes: str | None = None,
) -> str | None:
    """Create a point-in-time snapshot. Returns snapshot id."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO portfolio_snapshots
                (portfolio_id, as_of_date, total_value, cash_value, notes)
            VALUES ($1::uuid, $2, $3, $4, $5)
            RETURNING id
            """,
            portfolio_id,
            as_of_date,
            total_value,
            cash_value,
            notes,
        )
        return str(row["id"]) if row else None


async def get_latest_snapshot(pool, portfolio_id: str) -> dict | None:
    """Get the most recent snapshot for a portfolio."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, portfolio_id, as_of_date, total_value, cash_value, notes, created_at
            FROM portfolio_snapshots
            WHERE portfolio_id = $1::uuid
            ORDER BY as_of_date DESC, created_at DESC
            LIMIT 1
            """,
            portfolio_id,
        )
        return dict(row) if row else None


async def get_snapshot(pool, snapshot_id: str) -> dict | None:
    """Fetch a specific snapshot by id."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, portfolio_id, as_of_date, total_value, cash_value, notes, created_at "
            "FROM portfolio_snapshots WHERE id = $1::uuid",
            snapshot_id,
        )
        return dict(row) if row else None


async def get_snapshots(
    pool, portfolio_id: str, *, limit: int = 20
) -> list[dict]:
    """List snapshots for a portfolio, most recent first."""
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, portfolio_id, as_of_date, total_value, cash_value, notes, created_at
            FROM portfolio_snapshots
            WHERE portfolio_id = $1::uuid
            ORDER BY as_of_date DESC, created_at DESC
            LIMIT $2
            """,
            portfolio_id,
            limit,
        )
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Holdings CRUD
# ---------------------------------------------------------------------------

async def add_holding(
    pool,
    *,
    snapshot_id: str,
    ticker: str,
    quantity: float,
    price: float,
    market_value: float,
    sector: str | None = None,
    asset_class: str = "equity",
    notes: str | None = None,
) -> str | None:
    """Add a single holding to a snapshot. Returns holding id."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO portfolio_holdings
                (snapshot_id, ticker, quantity, price, market_value, sector, asset_class, notes)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
            """,
            snapshot_id,
            ticker.upper(),
            quantity,
            price,
            market_value,
            sector,
            asset_class,
            notes,
        )
        return str(row["id"]) if row else None


async def add_holdings_batch(
    pool,
    *,
    snapshot_id: str,
    holdings: list[dict],
) -> int:
    """Bulk-insert holdings for a snapshot. Returns count inserted.

    Each holding dict: {ticker, quantity, price, market_value, sector?, asset_class?, notes?}
    """
    if pool is None or not holdings:
        return 0
    rows = [
        (
            snapshot_id,
            h["ticker"].upper(),
            h["quantity"],
            h["price"],
            h["market_value"],
            h.get("sector"),
            h.get("asset_class", "equity"),
            h.get("notes"),
        )
        for h in holdings
    ]
    async with pool.acquire() as conn:
        result = await conn.executemany(
            """
            INSERT INTO portfolio_holdings
                (snapshot_id, ticker, quantity, price, market_value, sector, asset_class, notes)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
            """,
            rows,
        )
        return len(holdings)


async def get_holdings(pool, snapshot_id: str) -> list[dict]:
    """Get all holdings for a snapshot, ordered by market_value descending."""
    if pool is None:
        return []
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, snapshot_id, ticker, quantity, price, market_value,
                   sector, asset_class, notes
            FROM portfolio_holdings
            WHERE snapshot_id = $1::uuid
            ORDER BY market_value DESC
            """,
            snapshot_id,
        )
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Derived analytics (deterministic, no stored weights)
# ---------------------------------------------------------------------------

def compute_weights(holdings: list[dict], total_value: float) -> list[dict]:
    """Attach 'weight' (0..1) to each holding dict. Pure function, no DB call.

    If total_value is zero or negative, all weights are 0.
    """
    for h in holdings:
        if total_value > 0:
            h["weight"] = round(float(h["market_value"]) / total_value, 6)
        else:
            h["weight"] = 0.0
    return holdings


def compute_sector_exposure(holdings: list[dict], total_value: float) -> dict[str, float]:
    """Aggregate holdings by sector. Returns {sector: weight}."""
    sectors: dict[str, float] = {}
    for h in holdings:
        sector = h.get("sector") or "Unclassified"
        mv = float(h.get("market_value", 0))
        sectors[sector] = sectors.get(sector, 0.0) + mv
    if total_value > 0:
        return {s: round(v / total_value, 6) for s, v in sectors.items()}
    return {s: 0.0 for s in sectors}


def concentration_flags(
    holdings: list[dict],
    total_value: float,
    *,
    single_limit: float = 0.10,
    top3_limit: float = 0.40,
) -> list[str]:
    """Return human-readable concentration warnings.

    Default thresholds: single position >10%, top 3 >40% of total.
    """
    if total_value <= 0 or not holdings:
        return []
    flags = []
    weighted = compute_weights([dict(h) for h in holdings], total_value)
    weighted.sort(key=lambda h: h["weight"], reverse=True)

    for h in weighted:
        if h["weight"] > single_limit:
            pct = round(h["weight"] * 100, 1)
            flags.append(f"{h['ticker']} is {pct}% of portfolio (>{single_limit*100:.0f}% limit)")

    top3_weight = sum(h["weight"] for h in weighted[:3])
    if top3_weight > top3_limit:
        pct = round(top3_weight * 100, 1)
        flags.append(f"Top 3 holdings are {pct}% of portfolio (>{top3_limit*100:.0f}% limit)")

    return flags


# ---------------------------------------------------------------------------
# Full snapshot assembly (convenience)
# ---------------------------------------------------------------------------

async def get_portfolio_state(pool, portfolio_id: str) -> dict | None:
    """Assemble latest snapshot + holdings + derived weights for PM context.

    Returns None if no snapshot exists.
    """
    snapshot = await get_latest_snapshot(pool, portfolio_id)
    if not snapshot:
        return None

    holdings = await get_holdings(pool, str(snapshot["id"]))
    total_value = float(snapshot["total_value"])
    holdings_with_weights = compute_weights(holdings, total_value)
    sector_exposure = compute_sector_exposure(holdings, total_value)
    flags = concentration_flags(holdings, total_value)

    cash_weight = round(float(snapshot["cash_value"]) / total_value, 6) if total_value > 0 else 0.0

    # Phase C: compute full analytics if module available
    try:
        from portfolio_analytics import compute_analytics, analytics_to_json
        analytics = compute_analytics(
            holdings=holdings,
            total_value=total_value,
            cash_value=float(snapshot["cash_value"]),
        )
    except ImportError:
        analytics = None

    return {
        "portfolio_id": str(portfolio_id),
        "snapshot_id": str(snapshot["id"]),
        "as_of_date": snapshot["as_of_date"].isoformat() if hasattr(snapshot["as_of_date"], "isoformat") else str(snapshot["as_of_date"]),
        "total_value": total_value,
        "cash_value": float(snapshot["cash_value"]),
        "cash_weight": cash_weight,
        "holdings": holdings_with_weights,
        "sector_exposure": sector_exposure,
        "concentration_flags": flags,
        "analytics": analytics,
    }


# ---------------------------------------------------------------------------
# Portfolio analytics persistence (Phase C)
# ---------------------------------------------------------------------------

async def save_analytics(
    pool,
    *,
    snapshot_id: str,
    analytics_json: str,
    thresholds_json: str | None = None,
) -> str | None:
    """Persist computed analytics for a snapshot. Upserts (one per snapshot)."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO portfolio_analytics (snapshot_id, analytics_json, thresholds_json)
            VALUES ($1::uuid, $2::jsonb, $3::jsonb)
            ON CONFLICT (snapshot_id) DO UPDATE
                SET analytics_json = EXCLUDED.analytics_json,
                    thresholds_json = EXCLUDED.thresholds_json,
                    created_at = now()
            RETURNING id
            """,
            snapshot_id,
            analytics_json,
            thresholds_json,
        )
        return str(row["id"]) if row else None


async def get_analytics(pool, snapshot_id: str) -> dict | None:
    """Retrieve persisted analytics for a snapshot."""
    if pool is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, snapshot_id, analytics_json, thresholds_json, created_at "
            "FROM portfolio_analytics WHERE snapshot_id = $1::uuid",
            snapshot_id,
        )
        if not row:
            return None
        import json
        return {
            "id": str(row["id"]),
            "snapshot_id": str(row["snapshot_id"]),
            "analytics": json.loads(row["analytics_json"]) if isinstance(row["analytics_json"], str) else row["analytics_json"],
            "thresholds": json.loads(row["thresholds_json"]) if row["thresholds_json"] and isinstance(row["thresholds_json"], str) else row["thresholds_json"],
            "created_at": row["created_at"],
        }
