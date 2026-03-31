"""
Portfolio Alignment Engine (Phase D0.4).

Deterministic computation of alignment diagnostics between portfolio holdings
and research evidence. Single source of truth -- frontend renders these results
rather than computing its own.

Pure functions, no LLM, no network, no database.
"""

from __future__ import annotations

import glob
import json
import os
from typing import Any


# ---------------------------------------------------------------------------
# Research data loading
# ---------------------------------------------------------------------------

_RESEARCH_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "research")


def _normalise_ticker(ticker: str) -> str:
    """Normalise ticker to base form: strip .AX suffix, uppercase."""
    t = ticker.upper().strip()
    if t.endswith(".AX"):
        t = t[:-3]
    return t


def get_covered_tickers() -> set[str]:
    """Derive covered tickers dynamically from research JSON files on disk.

    Any ticker with a research JSON file is automatically covered.
    No manual list maintenance required.
    """
    return {
        os.path.basename(f).replace(".json", "")
        for f in glob.glob(os.path.join(_RESEARCH_DIR, "*.json"))
        if not os.path.basename(f).startswith("_")
    }


def load_research(ticker: str) -> dict | None:
    """Load research JSON for a ticker. Returns None if not found.

    Handles .AX suffix (e.g. FPH.AX -> FPH.json) and other exchange suffixes.
    """
    normalised = _normalise_ticker(ticker)
    path = os.path.join(_RESEARCH_DIR, f"{normalised}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


# ---------------------------------------------------------------------------
# Hypothesis parsing
# ---------------------------------------------------------------------------

def _parse_score(score_str: Any) -> float:
    """Parse a hypothesis score like '40%' to 0.40."""
    if isinstance(score_str, (int, float)):
        v = float(score_str)
        return v / 100.0 if v > 1 else v
    if isinstance(score_str, str):
        try:
            return float(score_str.replace("%", "").strip()) / 100.0
        except ValueError:
            return 0.0
    return 0.0


def parse_hypotheses(research: dict) -> list[dict]:
    """Extract structured hypothesis data from research JSON."""
    hyps = research.get("hypotheses") or []
    result = []
    for h in hyps:
        if not isinstance(h, dict):
            continue
        supporting = h.get("supporting") or []
        contradicting = h.get("contradicting") or []
        result.append({
            "tier": str(h.get("tier", "")),
            "title": str(h.get("title", "")),
            "direction": str(h.get("direction", "")).lower(),
            "score": _parse_score(h.get("score", 0)),
            "supporting_count": len(supporting) if isinstance(supporting, list) else 0,
            "contradicting_count": len(contradicting) if isinstance(contradicting, list) else 0,
        })
    return result


def _normalise_scores(raw_scores: list[int]) -> list[int]:
    """Normalise hypothesis scores to sum to 100, matching the frontend normaliseScores().

    Four steps:
    1. Clamp each score to [FLOOR, CEILING]
    2. Scale proportionally to sum to 100
    3. Iterative post-normalisation clamp (up to 20 iterations)
    4. Rounding residual fixup on the largest eligible value
    """
    FLOOR, CEILING = 5, 80

    if not raw_scores:
        return []

    # Step 1: Clamp
    clamped = [max(FLOOR, min(CEILING, v)) for v in raw_scores]

    # Step 2: Scale to 100
    total = sum(clamped)
    if total == 0:
        norm = [round(100 / len(clamped))] * len(clamped)
    else:
        norm = [round((c / total) * 100) for c in clamped]

    # Step 3: Iterative post-normalisation clamp
    for _ in range(20):
        overflow = 0
        underflow = 0
        free_indices = []
        for i in range(len(norm)):
            if norm[i] > CEILING:
                overflow += norm[i] - CEILING
                norm[i] = CEILING
            elif norm[i] < FLOOR:
                underflow += FLOOR - norm[i]
                norm[i] = FLOOR
            else:
                free_indices.append(i)
        if overflow == 0 and underflow == 0:
            break
        net = overflow - underflow
        if net == 0 or not free_indices:
            break
        if net > 0:
            free_indices.sort(key=lambda i: norm[i])
            remaining = net
            for fi in free_indices:
                if remaining <= 0:
                    break
                room = CEILING - norm[fi]
                give = min(remaining, room)
                norm[fi] += give
                remaining -= give
        else:
            free_indices.sort(key=lambda i: -norm[i])
            remaining = -net
            for fi in free_indices:
                if remaining <= 0:
                    break
                room = norm[fi] - FLOOR
                take = min(remaining, room)
                norm[fi] -= take
                remaining -= take

    # Step 4: Fix rounding residual
    rounded_sum = sum(norm)
    if rounded_sum != 100:
        diff = 100 - rounded_sum
        best_idx = -1
        for i in range(len(norm)):
            candidate = norm[i] + diff
            if FLOOR <= candidate <= CEILING:
                if best_idx == -1 or norm[i] > norm[best_idx]:
                    best_idx = i
        if best_idx == -1:
            best_idx = max(range(len(norm)), key=lambda i: norm[i])
        norm[best_idx] += diff

    return norm


def _infer_polarity(label: str) -> str:
    """Infer polarity from narrative label when explicit direction field is absent.
    Default is neutral -- only classify as upside/downside with clear keyword evidence.
    Keyword list must stay in sync with _inferPolarity() in src/lib/dom.js."""
    if not label:
        return "neutral"
    l = label.lower()
    upside_kw = ["growth", "recovery", "turnaround", "franchise", "quality", "moat"]
    downside_kw = ["risk", "downside", "erosion", "pressure", "decline",
                   "competition", "credit", "regulatory", "threat"]
    if any(k in l for k in upside_kw):
        return "upside"
    if any(k in l for k in downside_kw):
        return "downside"
    return "neutral"


def _compute_skew_from_hypotheses(hypotheses: list[dict]) -> dict:
    """Compute skew from hypothesis scores using the same algorithm as the frontend's
    computeSkewScore(): normalise scores to 100 via _normalise_scores(), resolve polarity,
    sum upside vs downside. Neutral weight moderates by not contributing to either side.
    Direction threshold +/- 5."""
    if not hypotheses:
        return {"direction": "balanced", "score": 0, "rationale": "", "source": "computed"}

    # Parse raw scores
    raw = []
    for h in hypotheses:
        s = h.get("score", 0)
        if isinstance(s, str):
            try:
                s = int(s.replace("%", "").strip())
            except (ValueError, TypeError):
                s = 0
        raw.append(int(s) if isinstance(s, (int, float)) else 0)

    norm = _normalise_scores(raw)

    # Sum upside vs downside using polarity resolution
    bull = 0
    bear = 0
    for i, h in enumerate(hypotheses):
        direction = h.get("direction") or _infer_polarity(h.get("title", ""))
        direction = str(direction).lower()
        w = norm[i] if i < len(norm) else 0
        if direction == "upside":
            bull += w
        elif direction == "downside":
            bear += w
        # neutral contributes zero -- its normalised weight moderates the signal

    bull = round(bull)
    bear = round(bear)
    score = bull - bear
    direction = "upside" if score > 5 else "downside" if score < -5 else "balanced"

    return {
        "direction": direction,
        "score": score,
        "rationale": f"bull={bull} bear={bear}",
        "source": "computed",
    }


def resolve_skew(research: dict) -> dict:
    """Compute skew from hypothesis scores, matching the frontend algorithm exactly.
    No longer consults the stale narrative skew field."""
    hypotheses = research.get("hypotheses") or []
    if not hypotheses:
        return {"direction": "balanced", "score": None, "rationale": "", "source": "none"}
    return _compute_skew_from_hypotheses(hypotheses)


# ---------------------------------------------------------------------------
# Alignment classification (single source of truth)
# ---------------------------------------------------------------------------

def classify_alignment(position_direction: str, evidence_skew: str) -> dict:
    """Classify alignment between a position and evidence skew.

    Args:
        position_direction: 'long' or 'short'
        evidence_skew: 'upside', 'downside', 'balanced', or ''

    Returns:
        dict with 'label' and 'cls' keys.
    """
    if not evidence_skew or evidence_skew == "none":
        return {"label": "Not covered", "cls": "not-covered"}
    if evidence_skew == "balanced":
        return {"label": "Neutral", "cls": "neutral"}

    if position_direction == "long":
        if evidence_skew == "upside":
            return {"label": "Aligned", "cls": "aligned"}
        return {"label": "Contradictory", "cls": "contradicts"}

    # short position
    if evidence_skew == "downside":
        return {"label": "Aligned", "cls": "aligned"}
    return {"label": "Contradictory", "cls": "contradicts"}


# ---------------------------------------------------------------------------
# Hypothesis DNA (exposure map)
# ---------------------------------------------------------------------------

def compute_hypothesis_dna(holdings_with_research: list[dict]) -> dict:
    """Compute portfolio-level hypothesis exposure.

    For each hypothesis direction (upside, downside), computes the weighted
    average score across all holdings that have research data.

    Args:
        holdings_with_research: list of dicts with 'weight', 'hypotheses' (parsed),
                                and 'ticker' keys.

    Returns:
        dict with 'upside_exposure', 'downside_exposure', 'dominant_theme',
        'concentration_risk' fields.
    """
    upside_weighted = 0.0
    downside_weighted = 0.0
    total_covered_weight = 0.0
    hypothesis_counts: dict[str, float] = {}  # tier -> weighted score sum

    for h in holdings_with_research:
        w = float(h.get("weight", 0))
        hyps = h.get("hypotheses") or []
        if not hyps:
            continue
        total_covered_weight += w
        for hyp in hyps:
            score = float(hyp.get("score", 0))
            direction = hyp.get("direction", "")
            tier = hyp.get("tier", "")
            if direction == "upside":
                upside_weighted += w * score
            elif direction == "downside":
                downside_weighted += w * score
            if tier:
                hypothesis_counts[tier] = hypothesis_counts.get(tier, 0) + w * score

    # Normalise
    if total_covered_weight > 0:
        upside_exposure = round(upside_weighted / total_covered_weight, 4)
        downside_exposure = round(downside_weighted / total_covered_weight, 4)
    else:
        upside_exposure = 0.0
        downside_exposure = 0.0

    # Dominant theme
    dominant_theme = ""
    if hypothesis_counts:
        dominant_theme = max(hypothesis_counts, key=hypothesis_counts.get)

    # Concentration risk: are many holdings exposed to the same hypothesis?
    concentration_risk = False
    if hypothesis_counts:
        max_exposure = max(hypothesis_counts.values())
        if total_covered_weight > 0 and max_exposure / total_covered_weight > 0.5:
            concentration_risk = True

    return {
        "upside_exposure": upside_exposure,
        "downside_exposure": downside_exposure,
        "total_covered_weight": round(total_covered_weight, 4),
        "dominant_theme": dominant_theme,
        "concentration_risk": concentration_risk,
        "hypothesis_weights": {k: round(v, 4) for k, v in hypothesis_counts.items()},
    }


# ---------------------------------------------------------------------------
# Hedge gaps
# ---------------------------------------------------------------------------

def compute_hedge_gaps(
    holdings_with_research: list[dict],
    mandate_risk_appetite: str = "moderate",
) -> list[dict]:
    """Identify unhedged tail risks in the portfolio.

    A hedge gap exists when:
    1. A holding has a high-probability downside hypothesis (>40%) and no
       other holding provides an offset
    2. Multiple holdings share the same downside hypothesis (correlated risk)

    Returns list of gap dicts with 'risk', 'severity', 'affected_tickers', 'description'.
    """
    gaps: list[dict] = []
    downside_exposures: dict[str, list[dict]] = {}  # hypothesis tier -> affected holdings

    for h in holdings_with_research:
        ticker = h.get("ticker", "")
        weight = float(h.get("weight", 0))
        for hyp in (h.get("hypotheses") or []):
            if hyp.get("direction") != "downside":
                continue
            score = float(hyp.get("score", 0))
            if score < 0.30:  # ignore low-probability risks
                continue
            tier = hyp.get("tier", "")
            title = hyp.get("title", tier)
            if tier not in downside_exposures:
                downside_exposures[tier] = []
            downside_exposures[tier].append({
                "ticker": ticker,
                "weight": weight,
                "score": score,
                "title": title,
            })

    # Check for correlated downside risks
    for tier, holdings in downside_exposures.items():
        total_weight = sum(h["weight"] for h in holdings)
        if len(holdings) >= 2 and total_weight > 0.10:
            gaps.append({
                "risk": "correlated_downside",
                "severity": "high" if total_weight > 0.25 else "medium",
                "affected_tickers": [h["ticker"] for h in holdings],
                "total_weight": round(total_weight, 4),
                "description": (
                    f"Correlated downside risk: {len(holdings)} holdings "
                    f"({', '.join(h['ticker'] for h in holdings)}) share "
                    f"exposure to '{holdings[0]['title']}' "
                    f"(combined weight {total_weight*100:.1f}%)"
                ),
            })

        # Single-name high downside
        for h in holdings:
            if h["score"] >= 0.40 and h["weight"] >= 0.05:
                gaps.append({
                    "risk": "unhedged_downside",
                    "severity": "high" if h["score"] >= 0.50 else "medium",
                    "affected_tickers": [h["ticker"]],
                    "total_weight": round(h["weight"], 4),
                    "description": (
                        f"{h['ticker']} has {h['score']*100:.0f}% probability "
                        f"downside hypothesis '{h['title']}' at {h['weight']*100:.1f}% weight"
                    ),
                })

    return gaps


# ---------------------------------------------------------------------------
# Reweighting suggestions
# ---------------------------------------------------------------------------

def compute_reweighting_deltas(
    holdings_with_alignment: list[dict],
    mandate_max_position: float = 0.15,
) -> list[dict]:
    """Suggest weight adjustments based on alignment and evidence.

    Returns list of suggestion dicts with 'ticker', 'current_weight',
    'suggested_direction', 'reason'.
    """
    suggestions: list[dict] = []
    for h in holdings_with_alignment:
        ticker = h.get("ticker", "")
        weight = float(h.get("weight", 0))
        alignment = h.get("alignment", {})
        cls = alignment.get("cls", "")

        if cls == "contradicts" and weight > 0.02:
            suggestions.append({
                "ticker": ticker,
                "current_weight": round(weight, 4),
                "suggested_direction": "trim",
                "reason": f"Evidence contradicts position direction ({alignment.get('label', 'Contradictory')})",
            })
        elif cls == "aligned" and weight < mandate_max_position * 0.5:
            suggestions.append({
                "ticker": ticker,
                "current_weight": round(weight, 4),
                "suggested_direction": "review_for_increase",
                "reason": f"Evidence supports position but weight is below half max ({weight*100:.1f}% vs {mandate_max_position*100:.0f}% cap)",
            })
        elif weight > mandate_max_position:
            suggestions.append({
                "ticker": ticker,
                "current_weight": round(weight, 4),
                "suggested_direction": "trim_to_limit",
                "reason": f"Weight {weight*100:.1f}% exceeds mandate max {mandate_max_position*100:.0f}%",
            })

    return suggestions


# ---------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------

def detect_changes(
    current_holdings: list[dict],
    previous_holdings: list[dict] | None,
) -> list[dict]:
    """Detect meaningful changes between two snapshots.

    Returns list of change dicts with 'ticker', 'change_type', 'description'.
    """
    if not previous_holdings:
        return []

    prev_map = {h.get("ticker", ""): h for h in previous_holdings if h.get("ticker")}
    curr_map = {h.get("ticker", ""): h for h in current_holdings if h.get("ticker")}

    changes: list[dict] = []

    # New positions
    for ticker in curr_map:
        if ticker not in prev_map:
            changes.append({
                "ticker": ticker,
                "change_type": "new_position",
                "description": f"{ticker} added to portfolio",
            })

    # Removed positions
    for ticker in prev_map:
        if ticker not in curr_map:
            changes.append({
                "ticker": ticker,
                "change_type": "removed_position",
                "description": f"{ticker} removed from portfolio",
            })

    # Weight changes > 1pp
    for ticker in curr_map:
        if ticker in prev_map:
            curr_w = float(curr_map[ticker].get("weight", 0))
            prev_w = float(prev_map[ticker].get("weight", 0))
            delta = curr_w - prev_w
            if abs(delta) > 0.01:
                direction = "increased" if delta > 0 else "decreased"
                changes.append({
                    "ticker": ticker,
                    "change_type": f"weight_{direction}",
                    "description": (
                        f"{ticker} weight {direction} by {abs(delta)*100:.1f}pp "
                        f"({prev_w*100:.1f}% to {curr_w*100:.1f}%)"
                    ),
                })

    return changes


# ---------------------------------------------------------------------------
# Mandate breach detection
# ---------------------------------------------------------------------------

def compute_mandate_breaches(
    *,
    analytics: dict | None = None,
    mandate_max_position: float = 0.15,
    mandate_sector_cap: float = 0.35,
    mandate_cash_min: float = 0.03,
    mandate_cash_max: float = 0.25,
    mandate_turnover_tolerance: str = "moderate",
) -> list[dict]:
    """Detect active breaches of user mandate limits.

    Cross-references actual portfolio analytics against the user's mandate.
    Returns a list of breach dicts, each with:
      - code: breach identifier
      - severity: 'critical' | 'warning' | 'info'
      - metric: the actual metric value
      - limit: the mandate limit
      - description: human-readable explanation

    Returns empty list if analytics is None (no portfolio loaded).
    """
    if not analytics:
        return []

    breaches: list[dict] = []
    conc = analytics.get("concentration") or {}
    holdings = analytics.get("holdings_with_weights") or []

    # Single-name position breach
    max_single = conc.get("max_single_weight", 0)
    if max_single > mandate_max_position:
        offender = ""
        for h in holdings:
            if abs(float(h.get("weight", 0)) - max_single) < 0.001:
                offender = h.get("ticker", "")
                break
        overshoot = max_single - mandate_max_position
        breaches.append({
            "code": "POSITION_BREACH",
            "severity": "critical" if overshoot > 0.10 else "warning",
            "metric": round(max_single, 4),
            "metric_name": "max_single_position",
            "limit": round(mandate_max_position, 4),
            "ticker": offender,
            "recommended_posture": "trim",
            "description": (
                f"{offender or 'Largest position'} at {max_single*100:.1f}% "
                f"exceeds mandate max {mandate_max_position*100:.0f}% "
                f"by {overshoot*100:.1f}pp"
            ),
        })

    # Sector cap breach
    sector_exposure = analytics.get("sector_exposure") or {}
    for sector, weight in sector_exposure.items():
        if sector == "Unclassified":
            continue
        if weight > mandate_sector_cap:
            overshoot = weight - mandate_sector_cap
            breaches.append({
                "code": "SECTOR_BREACH",
                "severity": "critical" if overshoot > 0.15 else "warning",
                "metric": round(weight, 4),
                "metric_name": "sector_exposure",
                "limit": round(mandate_sector_cap, 4),
                "sector": sector,
                "recommended_posture": "trim",
                "description": (
                    f"{sector} at {weight*100:.1f}% "
                    f"exceeds mandate sector cap {mandate_sector_cap*100:.0f}% "
                    f"by {overshoot*100:.1f}pp"
                ),
            })

    # Cash range breach
    cash_weight = analytics.get("cash_weight", 0)
    if cash_weight < mandate_cash_min:
        breaches.append({
            "code": "CASH_BELOW_MIN",
            "severity": "warning",
            "metric": round(cash_weight, 4),
            "metric_name": "cash_weight",
            "limit": round(mandate_cash_min, 4),
            "recommended_posture": "block_add",
            "description": (
                f"Cash at {cash_weight*100:.1f}% is below mandate minimum "
                f"{mandate_cash_min*100:.0f}%"
            ),
        })
    elif cash_weight > mandate_cash_max:
        breaches.append({
            "code": "CASH_ABOVE_MAX",
            "severity": "warning" if cash_weight < 0.50 else "critical",
            "metric": round(cash_weight, 4),
            "metric_name": "cash_weight",
            "limit": round(mandate_cash_max, 4),
            "recommended_posture": "review",
            "description": (
                f"Cash at {cash_weight*100:.1f}% exceeds mandate maximum "
                f"{mandate_cash_max*100:.0f}%"
            ),
        })

    return breaches


# ---------------------------------------------------------------------------
# Master alignment computation
# ---------------------------------------------------------------------------

def compute_alignment(
    *,
    holdings: list[dict],
    mandate_max_position: float = 0.15,
    mandate_sector_cap: float = 0.35,
    mandate_cash_min: float = 0.03,
    mandate_cash_max: float = 0.25,
    mandate_risk_appetite: str = "moderate",
    mandate_turnover_tolerance: str = "moderate",
    restricted_names: list[str] | None = None,
    previous_holdings: list[dict] | None = None,
    analytics: dict | None = None,
) -> dict[str, Any]:
    """Compute full alignment diagnostics for a portfolio.

    This is the single entry point. All other functions in this module are
    called from here. Frontend should render the output, not compute its own.

    Args:
        holdings: list of holding dicts with at minimum 'ticker' and 'weight'.
        mandate_max_position: max single-name weight from mandate (decimal).
        mandate_sector_cap: max single-sector weight from mandate (decimal).
        mandate_cash_min: minimum cash weight from mandate (decimal).
        mandate_cash_max: maximum cash weight from mandate (decimal).
        mandate_risk_appetite: risk appetite string from mandate.
        mandate_turnover_tolerance: turnover tolerance from mandate.
        restricted_names: list of tickers the user must not hold.
        previous_holdings: prior snapshot holdings for change detection.
        analytics: output from compute_analytics(), for mandate breach detection.

    Returns:
        Complete alignment diagnostics dict.
    """
    restricted = set((n.upper() for n in (restricted_names or [])))

    # Enrich holdings with research data and alignment
    enriched: list[dict] = []
    covered_count = 0
    aligned_weight = 0.0
    contradicts_weight = 0.0
    neutral_weight = 0.0
    not_covered_weight = 0.0
    restricted_violations: list[dict] = []

    for h in holdings:
        ticker = str(h.get("ticker", "")).upper()
        weight = float(h.get("weight", 0))

        # Check restricted names
        if ticker in restricted:
            restricted_violations.append({
                "ticker": ticker,
                "weight": round(weight, 4),
            })

        # Load research data
        research = load_research(ticker)
        hypotheses = parse_hypotheses(research) if research else []
        skew = resolve_skew(research) if research else {"direction": "", "score": None, "rationale": "", "source": "none"}

        # Derive position direction from multiple signals:
        # 1. Explicit notes field (set by portfolio sync: "direction:short")
        # 2. Negative quantity or market_value (if DB constraints are relaxed)
        notes = str(h.get("notes", "") or "")
        qty = h.get("quantity", h.get("units", 0))
        mv = h.get("market_value", 0)
        if "direction:short" in notes:
            pos_direction = "short"
        elif float(qty or 0) < 0 or float(mv or 0) < 0:
            pos_direction = "short"
        else:
            pos_direction = "long"

        alignment = classify_alignment(pos_direction, skew["direction"])

        # Accumulate weights
        if alignment["cls"] == "aligned":
            aligned_weight += weight
            covered_count += 1
        elif alignment["cls"] == "contradicts":
            contradicts_weight += weight
            covered_count += 1
        elif alignment["cls"] == "neutral":
            neutral_weight += weight
            covered_count += 1
        else:
            not_covered_weight += weight

        enriched.append({
            "ticker": ticker,
            "weight": round(weight, 4),
            "alignment": alignment,
            "skew": skew,
            "hypotheses": hypotheses,
            "has_research": research is not None,
        })

    # Compute hypothesis DNA
    dna = compute_hypothesis_dna(enriched)

    # Compute hedge gaps
    gaps = compute_hedge_gaps(enriched, mandate_risk_appetite)

    # Compute reweighting suggestions
    reweighting = compute_reweighting_deltas(enriched, mandate_max_position)

    # Detect changes
    changes = detect_changes(holdings, previous_holdings)

    # Mandate breach detection
    mandate_breaches = compute_mandate_breaches(
        analytics=analytics,
        mandate_max_position=mandate_max_position,
        mandate_sector_cap=mandate_sector_cap,
        mandate_cash_min=mandate_cash_min,
        mandate_cash_max=mandate_cash_max,
        mandate_turnover_tolerance=mandate_turnover_tolerance,
    )

    # Portfolio-level alignment summary
    total_weight = sum(float(h.get("weight", 0)) for h in holdings)
    alignment_summary = {
        "aligned_weight": round(aligned_weight, 4),
        "contradicts_weight": round(contradicts_weight, 4),
        "neutral_weight": round(neutral_weight, 4),
        "not_covered_weight": round(not_covered_weight, 4),
        "covered_count": covered_count,
        "total_count": len(holdings),
        "alignment_score": round(aligned_weight / total_weight, 4) if total_weight > 0 else 0.0,
    }

    return {
        "holdings": enriched,
        "alignment_summary": alignment_summary,
        "hypothesis_dna": dna,
        "hedge_gaps": gaps,
        "reweighting_suggestions": reweighting,
        "changes": changes,
        "restricted_violations": restricted_violations,
        "mandate_breaches": mandate_breaches,
    }
