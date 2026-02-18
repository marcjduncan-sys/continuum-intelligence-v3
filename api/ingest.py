"""
Document ingestion pipeline.

Parses STOCK_DATA objects from index.html and chunks them into
retrievable passages with metadata for the research chat API.
"""

import json
import os
import re
from typing import Any

from config import INDEX_HTML_PATH


# ---------------------------------------------------------------------------
# Passage data model
# ---------------------------------------------------------------------------

class Passage:
    """A single retrievable chunk of research content."""

    __slots__ = ("ticker", "section", "subsection", "content", "tags", "weight")

    def __init__(
        self,
        ticker: str,
        section: str,
        subsection: str,
        content: str,
        tags: list[str] | None = None,
        weight: float = 1.0,
    ):
        self.ticker = ticker
        self.section = section
        self.subsection = subsection
        self.content = content
        self.tags = tags or []
        self.weight = weight

    def to_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "section": self.section,
            "subsection": self.subsection,
            "content": self.content,
            "tags": self.tags,
            "weight": self.weight,
        }


# ---------------------------------------------------------------------------
# HTML entity cleanup
# ---------------------------------------------------------------------------

_HTML_ENTITIES = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&bull;": " - ",
    "&ndash;": "-",
    "&mdash;": " — ",
    "&rarr;": "->",
    "&larr;": "<-",
    "&uarr;": "^",
    "&darr;": "v",
    "&ge;": ">=",
    "&le;": "<=",
    "&#9650;": "^",
    "&#9660;": "v",
}


def _clean_html(text: str) -> str:
    """Strip HTML tags and decode common entities."""
    if not text:
        return ""
    text = str(text)
    for entity, replacement in _HTML_ENTITIES.items():
        text = text.replace(entity, replacement)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# JavaScript object extraction
# ---------------------------------------------------------------------------

def _extract_balanced_braces(text: str, start: int) -> str:
    """Extract a balanced {...} block starting at position `start` (which should point to '{')."""
    if start >= len(text) or text[start] != "{":
        return ""
    depth = 0
    i = start
    in_string = False
    string_char = ""
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\" and i + 1 < len(text):
                i += 2
                continue
            if ch == string_char:
                in_string = False
        else:
            if ch in ("'", '"'):
                in_string = True
                string_char = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        i += 1
    return ""


def _extract_js_objects(html: str) -> dict[str, dict]:
    """
    Extract STOCK_DATA.TICKER = {...} objects from the HTML source.
    Returns {ticker: parsed_dict}.
    """
    pattern = re.compile(r"STOCK_DATA\.([A-Z]{2,5})\s*=\s*\{")
    stocks: dict[str, dict] = {}
    for match in pattern.finditer(html):
        ticker = match.group(1)
        brace_start = match.end() - 1  # position of '{'
        js_obj = _extract_balanced_braces(html, brace_start)
        if js_obj:
            parsed = _js_to_dict(js_obj)
            if parsed:
                stocks[ticker] = parsed
    return stocks


def _extract_reference_data(html: str) -> dict[str, dict]:
    """Extract REFERENCE_DATA = {...} block."""
    pattern = re.compile(r"const\s+REFERENCE_DATA\s*=\s*\{")
    match = pattern.search(html)
    if not match:
        return {}
    brace_start = match.end() - 1
    js_obj = _extract_balanced_braces(html, brace_start)
    return _js_to_dict(js_obj) or {}


def _extract_freshness_data(html: str) -> dict[str, dict]:
    """Extract FRESHNESS_DATA = {...} block."""
    pattern = re.compile(r"const\s+FRESHNESS_DATA\s*=\s*\{")
    match = pattern.search(html)
    if not match:
        return {}
    brace_start = match.end() - 1
    js_obj = _extract_balanced_braces(html, brace_start)
    return _js_to_dict(js_obj) or {}


def _js_to_dict(js_str: str) -> dict | None:
    """
    Best-effort conversion of a JS object literal to a Python dict.
    Handles unquoted keys, single-quoted strings, trailing commas, and comments.
    """
    s = js_str
    # Remove single-line comments (but not inside strings)
    s = re.sub(r"//[^\n]*", "", s)
    # Remove multi-line comments
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
    # Quote unquoted keys:  key: -> "key":
    s = re.sub(r"(?<=[{,\n])\s*([a-zA-Z_]\w*)\s*:", r' "\1":', s)
    # Replace single-quoted strings with double-quoted
    s = _single_to_double_quotes(s)
    # Remove trailing commas before } or ]
    s = re.sub(r",\s*([}\]])", r"\1", s)
    # Handle undefined/null-like JS values
    s = s.replace(": undefined", ": null")
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return None


def _single_to_double_quotes(s: str) -> str:
    """Replace single-quoted JS strings with double-quoted JSON strings."""
    result = []
    i = 0
    while i < len(s):
        if s[i] == '"':
            # Already a double-quoted string — skip through it
            result.append(s[i])
            i += 1
            while i < len(s) and s[i] != '"':
                if s[i] == "\\":
                    result.append(s[i])
                    i += 1
                    if i < len(s):
                        result.append(s[i])
                        i += 1
                else:
                    result.append(s[i])
                    i += 1
            if i < len(s):
                result.append(s[i])
                i += 1
        elif s[i] == "'":
            # Single-quoted string — convert to double-quoted
            result.append('"')
            i += 1
            while i < len(s) and s[i] != "'":
                if s[i] == "\\":
                    i += 1
                    if i < len(s):
                        if s[i] == "'":
                            # \' in JS → just ' in JSON (no escape needed)
                            result.append("'")
                        elif s[i] == '"':
                            # \" stays as \"
                            result.append('\\"')
                        elif s[i] == "\\":
                            result.append("\\\\")
                        elif s[i] == "n":
                            result.append("\\n")
                        elif s[i] == "t":
                            result.append("\\t")
                        elif s[i] == "r":
                            result.append("\\r")
                        else:
                            # Other escapes — pass through
                            result.append("\\")
                            result.append(s[i])
                        i += 1
                elif s[i] == '"':
                    # Unescaped double quote inside single-quoted string — escape it
                    result.append('\\"')
                    i += 1
                else:
                    result.append(s[i])
                    i += 1
            result.append('"')
            if i < len(s):
                i += 1
        else:
            result.append(s[i])
            i += 1
    return "".join(result)


# ---------------------------------------------------------------------------
# Chunking — turn structured data into passages
# ---------------------------------------------------------------------------

def _chunk_stock(ticker: str, data: dict, ref: dict | None, fresh: dict | None) -> list[Passage]:
    """Convert a single stock's data into a list of Passage objects."""
    passages: list[Passage] = []

    # --- Company overview ---
    overview_parts = []
    if data.get("company"):
        overview_parts.append(f"{data['company']} (ASX: {ticker})")
    if data.get("sector"):
        overview_parts.append(f"Sector: {data['sector']}")
    if data.get("heroDescription"):
        overview_parts.append(_clean_html(data["heroDescription"]))
    if data.get("heroCompanyDescription"):
        overview_parts.append(_clean_html(data["heroCompanyDescription"]))
    if data.get("identity", {}).get("overview"):
        overview_parts.append(_clean_html(data["identity"]["overview"]))
    if overview_parts:
        passages.append(Passage(
            ticker=ticker,
            section="overview",
            subsection="company_description",
            content="\n".join(overview_parts),
            tags=["overview", "fundamentals"],
            weight=1.0,
        ))

    # --- Hero metrics ---
    metrics = data.get("heroMetrics") or []
    if metrics:
        metric_str = ", ".join(
            f"{m.get('label','')}: {_clean_html(m.get('value',''))}"
            for m in metrics
        )
        passages.append(Passage(
            ticker=ticker,
            section="overview",
            subsection="key_metrics",
            content=f"Key metrics for {ticker}: {metric_str}",
            tags=["metrics", "fundamentals"],
            weight=0.8,
        ))

    # --- Identity table ---
    identity = data.get("identity", {})
    id_rows = identity.get("rows", [])
    if id_rows:
        id_lines = []
        for row in id_rows:
            for cell in row:
                if len(cell) >= 2:
                    id_lines.append(f"{cell[0]}: {_clean_html(cell[1])}")
        passages.append(Passage(
            ticker=ticker,
            section="identity",
            subsection="financial_data",
            content=f"Financial identity for {ticker}:\n" + "\n".join(id_lines),
            tags=["identity", "financials", "fundamentals"],
            weight=0.9,
        ))

    # --- Skew ---
    skew = data.get("skew", {})
    if skew:
        passages.append(Passage(
            ticker=ticker,
            section="verdict",
            subsection="skew",
            content=f"Risk skew for {ticker}: {skew.get('direction', 'unknown')}. {_clean_html(skew.get('rationale', ''))}",
            tags=["skew", "risk", "verdict"],
            weight=1.0,
        ))

    # --- Verdict ---
    verdict = data.get("verdict", {})
    if verdict:
        verdict_parts = [f"Verdict for {ticker}: {_clean_html(verdict.get('text', ''))}"]
        for score in verdict.get("scores", []):
            verdict_parts.append(
                f"  {score.get('label','')}: {score.get('score','')} ({_clean_html(score.get('dirText',''))})"
            )
        passages.append(Passage(
            ticker=ticker,
            section="verdict",
            subsection="summary",
            content="\n".join(verdict_parts),
            tags=["verdict", "thesis", "summary"],
            weight=1.2,
        ))

    # --- Hypotheses (one passage per hypothesis) ---
    for hyp in data.get("hypotheses", []):
        parts = [
            f"Hypothesis: {_clean_html(hyp.get('title', ''))}",
            f"Direction: {hyp.get('direction', '')}",
            f"Probability: {hyp.get('score', '')}",
            f"Status: {_clean_html(hyp.get('statusText', ''))}",
            f"Description: {_clean_html(hyp.get('description', ''))}",
        ]
        requires = hyp.get("requires") or []
        if requires:
            parts.append("Requires: " + "; ".join(_clean_html(r) for r in requires))
        supporting = hyp.get("supporting") or []
        if supporting:
            parts.append("Supporting evidence: " + " | ".join(_clean_html(s) for s in supporting))
        contradicting = hyp.get("contradicting") or []
        if contradicting:
            parts.append("Contradicting evidence: " + " | ".join(_clean_html(c) for c in contradicting))

        tier = hyp.get("tier", "")
        passages.append(Passage(
            ticker=ticker,
            section="hypothesis",
            subsection=tier,
            content="\n".join(parts),
            tags=["hypothesis", tier, hyp.get("direction", "")],
            weight=1.3,
        ))

    # --- Narrative ---
    narrative = data.get("narrative", {})
    if narrative:
        if narrative.get("theNarrative"):
            passages.append(Passage(
                ticker=ticker,
                section="narrative",
                subsection="the_narrative",
                content=f"Market narrative for {ticker}: {_clean_html(narrative['theNarrative'])}",
                tags=["narrative", "thesis"],
                weight=1.1,
            ))
        pi = narrative.get("priceImplication", {})
        if pi and pi.get("content"):
            passages.append(Passage(
                ticker=ticker,
                section="narrative",
                subsection="price_implication",
                content=f"Price implications for {ticker} ({_clean_html(pi.get('label',''))}): {_clean_html(pi['content'])}",
                tags=["narrative", "price", "valuation"],
                weight=1.0,
            ))
        if narrative.get("evidenceCheck"):
            passages.append(Passage(
                ticker=ticker,
                section="narrative",
                subsection="evidence_check",
                content=f"Evidence check for {ticker}: {_clean_html(narrative['evidenceCheck'])}",
                tags=["narrative", "evidence"],
                weight=1.0,
            ))
        if narrative.get("narrativeStability"):
            passages.append(Passage(
                ticker=ticker,
                section="narrative",
                subsection="stability",
                content=f"Narrative stability for {ticker}: {_clean_html(narrative['narrativeStability'])}",
                tags=["narrative", "stability", "risk"],
                weight=1.0,
            ))

    # --- Evidence cards (one passage per card) ---
    evidence = data.get("evidence", {})
    for card in evidence.get("cards", []):
        parts = [
            f"Evidence: {_clean_html(card.get('title', ''))}",
            f"Epistemic status: {_clean_html(card.get('epistemicLabel', ''))}",
            f"Finding: {_clean_html(card.get('finding', ''))}",
        ]
        if card.get("tension"):
            parts.append(f"Tension: {_clean_html(card['tension'])}")
        if card.get("source"):
            parts.append(f"Source: {_clean_html(card['source'])}")
        tag_texts = [_clean_html(t.get("text", "")) for t in card.get("tags", [])]
        passages.append(Passage(
            ticker=ticker,
            section="evidence",
            subsection=f"card_{card.get('number', '')}",
            content="\n".join(parts),
            tags=["evidence"] + tag_texts,
            weight=1.1,
        ))

        # If card has a table (leadership, ownership), add it
        tbl = card.get("table")
        if tbl:
            headers = tbl.get("headers", [])
            rows = tbl.get("rows", [])
            table_lines = [" | ".join(headers)]
            for row in rows:
                table_lines.append(" | ".join(_clean_html(c) for c in row))
            passages.append(Passage(
                ticker=ticker,
                section="evidence",
                subsection=f"card_{card.get('number', '')}_table",
                content=f"Data table for {_clean_html(card.get('title',''))}:\n" + "\n".join(table_lines),
                tags=["evidence", "data"],
                weight=0.8,
            ))

    # --- Evidence alignment summary ---
    alignment = evidence.get("alignmentSummary", {})
    if alignment and alignment.get("summary"):
        s = alignment["summary"]
        passages.append(Passage(
            ticker=ticker,
            section="evidence",
            subsection="alignment_summary",
            content=(
                f"Evidence alignment summary for {ticker}: "
                f"T1 support: {s.get('t1','-')}, "
                f"T2 support: {s.get('t2','-')}, "
                f"T3 support: {s.get('t3','-')}, "
                f"T4 support: {s.get('t4','-')}"
            ),
            tags=["evidence", "summary", "alignment"],
            weight=1.0,
        ))

    # --- Discriminators ---
    disc = data.get("discriminators", {})
    if disc:
        for i, row in enumerate(disc.get("rows", [])):
            passages.append(Passage(
                ticker=ticker,
                section="discriminator",
                subsection=f"disc_{i+1}",
                content=(
                    f"Discriminator ({row.get('diagnosticity','')}) for {ticker}: "
                    f"{_clean_html(row.get('evidence', ''))} — "
                    f"Discriminates between: {_clean_html(row.get('discriminatesBetween', ''))} — "
                    f"Current reading: {_clean_html(row.get('currentReading', ''))}"
                ),
                tags=["discriminator", row.get("diagnosticity", "").lower()],
                weight=1.2,
            ))
        if disc.get("nonDiscriminating"):
            passages.append(Passage(
                ticker=ticker,
                section="discriminator",
                subsection="non_discriminating",
                content=f"Non-discriminating evidence for {ticker}: {_clean_html(disc['nonDiscriminating'])}",
                tags=["discriminator", "noise"],
                weight=0.6,
            ))

    # --- Tripwires ---
    tripwires = data.get("tripwires", {})
    for tw in tripwires.get("cards", []):
        cond_parts = []
        for cond in tw.get("conditions", []):
            cond_parts.append(f"{_clean_html(cond.get('if',''))} → {_clean_html(cond.get('then',''))}")
        passages.append(Passage(
            ticker=ticker,
            section="tripwire",
            subsection=_clean_html(tw.get("name", "")),
            content=(
                f"Tripwire for {ticker}: {_clean_html(tw.get('name', ''))} "
                f"(Date: {_clean_html(tw.get('date', ''))})\n"
                + "\n".join(cond_parts)
            ),
            tags=["tripwire", "catalyst", "risk"],
            weight=1.2,
        ))

    # --- Gaps ---
    gaps = data.get("gaps", {})
    couldnt = gaps.get("couldntAssess", [])
    if couldnt:
        passages.append(Passage(
            ticker=ticker,
            section="gaps",
            subsection="unknowns",
            content=f"Research gaps for {ticker} (what we couldn't assess):\n" + "\n".join(
                f"- {_clean_html(g)}" for g in couldnt
            ),
            tags=["gaps", "limitations"],
            weight=0.9,
        ))

    # --- Technical analysis ---
    ta = data.get("technicalAnalysis", {})
    if ta:
        ta_parts = [f"Technical analysis for {ticker} ({ta.get('date', '')}):"]
        ta_parts.append(f"Regime: {ta.get('regime', '')}, Clarity: {ta.get('clarity', '')}")
        price = ta.get("price", {})
        if price:
            ta_parts.append(f"Price: {price.get('currency', '')}{price.get('current', '')}")
        ma = ta.get("movingAverages", {})
        if ma:
            ma50 = ma.get("ma50", {})
            ma200 = ma.get("ma200", {})
            if ma50:
                ta_parts.append(f"50-day MA: {ma50.get('value', '')}")
            if ma200:
                ta_parts.append(f"200-day MA: {ma200.get('value', '')}")
            crossover = ma.get("crossover", {})
            if crossover:
                ta_parts.append(f"Crossover: {crossover.get('type', '')} ({crossover.get('date', '')})")
        vol = ta.get("volatility", {})
        if vol:
            ta_parts.append(f"Annualised volatility: {vol.get('annualised', '')}%")
        passages.append(Passage(
            ticker=ticker,
            section="technical",
            subsection="analysis",
            content="\n".join(ta_parts),
            tags=["technical", "price", "chart"],
            weight=0.8,
        ))

    # --- Reference data ---
    if ref:
        ref_parts = [f"Reference data for {ticker}:"]
        field_labels = {
            "sharesOutstanding": "Shares outstanding (M)",
            "analystTarget": "Analyst target price",
            "epsTrailing": "Trailing EPS",
            "epsForward": "Forward EPS",
            "divPerShare": "Dividend per share",
            "revenue": "Revenue ($B)",
            "revenueGrowth": "Revenue growth (%)",
            "ebitMargin": "EBIT margin (%)",
            "ebitdaMargin": "EBITDA margin (%)",
            "roe": "Return on equity (%)",
            "netDebtToEbitda": "Net debt/EBITDA",
            "fcf": "Free cash flow ($B)",
            "fcfMargin": "FCF margin (%)",
        }
        for key, label in field_labels.items():
            val = ref.get(key)
            if val is not None:
                ref_parts.append(f"  {label}: {val}")
        if ref.get("analystBuys") is not None:
            ref_parts.append(
                f"  Analyst consensus: {ref.get('analystBuys',0)} Buy, "
                f"{ref.get('analystHolds',0)} Hold, {ref.get('analystSells',0)} Sell"
            )
        passages.append(Passage(
            ticker=ticker,
            section="reference",
            subsection="fundamentals",
            content="\n".join(ref_parts),
            tags=["reference", "fundamentals", "financials"],
            weight=0.7,
        ))

    # --- Freshness data ---
    if fresh:
        passages.append(Passage(
            ticker=ticker,
            section="freshness",
            subsection="status",
            content=(
                f"Research freshness for {ticker}: "
                f"Last reviewed {fresh.get('reviewDate', 'unknown')} "
                f"({fresh.get('daysSinceReview', '?')} days ago). "
                f"Price at review: {fresh.get('priceAtReview', '?')}, "
                f"change since: {fresh.get('pricePctChange', '?')}%. "
                f"Nearest catalyst: {fresh.get('nearestCatalyst', 'none')} "
                f"({fresh.get('nearestCatalystDays', '?')} days). "
                f"Status: {fresh.get('status', 'unknown')}."
            ),
            tags=["freshness", "status"],
            weight=0.5,
        ))

    return passages


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_store: dict[str, list[Passage]] = {}
_all_passages: list[Passage] = []


def ingest(html_path: str | None = None) -> dict[str, list[Passage]]:
    """
    Parse index.html and build the passage store.
    Returns {ticker: [Passage, ...]}.
    """
    global _store, _all_passages

    path = html_path or INDEX_HTML_PATH
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    stocks = _extract_js_objects(html)
    ref_data = _extract_reference_data(html)
    fresh_data = _extract_freshness_data(html)

    _store = {}
    _all_passages = []

    for ticker, data in stocks.items():
        ref = ref_data.get(ticker)
        fresh = fresh_data.get(ticker)
        passages = _chunk_stock(ticker, data, ref, fresh)
        _store[ticker] = passages
        _all_passages.extend(passages)

    return _store


def get_passages(ticker: str | None = None) -> list[Passage]:
    """Get passages, optionally filtered by ticker."""
    if ticker:
        return _store.get(ticker.upper(), [])
    return _all_passages


def get_tickers() -> list[str]:
    """Get list of available tickers."""
    return sorted(_store.keys())


def get_passage_count() -> dict[str, int]:
    """Get passage counts by ticker."""
    return {t: len(p) for t, p in sorted(_store.items())}


if __name__ == "__main__":
    store = ingest()
    for ticker, passages in sorted(store.items()):
        print(f"{ticker}: {len(passages)} passages")
        for p in passages[:3]:
            print(f"  [{p.section}/{p.subsection}] {p.content[:80]}...")
        print()
    print(f"Total: {len(_all_passages)} passages across {len(store)} stocks")
