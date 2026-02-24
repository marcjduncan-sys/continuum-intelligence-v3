"""
Document ingestion pipeline.

Reads per-ticker JSON files from data/research/ and chunks them into
retrievable passages with metadata for the research chat API.
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from config import INDEX_HTML_PATH


logger = logging.getLogger(__name__)


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
    "&mdash;": " -- ",
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
# Resolve data directory
# ---------------------------------------------------------------------------

def _get_data_dir() -> Path:
    index_dir = Path(INDEX_HTML_PATH).parent
    return index_dir / "data" / "research"


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _chunk_stock(ticker: str, data: dict, ref: dict | None = None, fresh: dict | None = None) -> list[Passage]:
    passages: list[Passage] = []

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
        passages.append(Passage(ticker=ticker, section="overview", subsection="company_description", content="\n".join(overview_parts), tags=["overview", "fundamentals"], weight=1.0))

    metrics = data.get("heroMetrics") or []
    if metrics:
        metric_str = ", ".join(f"{m.get('label','')}: {_clean_html(m.get('value',''))}" for m in metrics)
        passages.append(Passage(ticker=ticker, section="overview", subsection="key_metrics", content=f"Key metrics for {ticker}: {metric_str}", tags=["metrics", "fundamentals"], weight=0.8))

    identity = data.get("identity", {})
    id_rows = identity.get("rows", [])
    if id_rows:
        id_lines = []
        for row in id_rows:
            for cell in row:
                if len(cell) >= 2:
                    id_lines.append(f"{cell[0]}: {_clean_html(cell[1])}")
        passages.append(Passage(ticker=ticker, section="identity", subsection="financial_data", content=f"Financial identity for {ticker}:\n" + "\n".join(id_lines), tags=["identity", "financials", "fundamentals"], weight=0.9))

    skew = data.get("skew", {})
    if skew:
        passages.append(Passage(ticker=ticker, section="verdict", subsection="skew", content=f"Risk skew for {ticker}: {skew.get('direction', 'unknown')}. {_clean_html(skew.get('rationale', ''))}", tags=["skew", "risk", "verdict"], weight=1.0))

    verdict = data.get("verdict", {})
    if verdict:
        verdict_parts = [f"Verdict for {ticker}: {_clean_html(verdict.get('text', ''))}"]
        for score in verdict.get("scores", []):
            verdict_parts.append(f"  {score.get('label','')}: {score.get('score','')} ({_clean_html(score.get('dirText',''))})")
        passages.append(Passage(ticker=ticker, section="verdict", subsection="summary", content="\n".join(verdict_parts), tags=["verdict", "thesis", "summary"], weight=1.2))

    for hyp in data.get("hypotheses", []):
        parts = [f"Hypothesis: {_clean_html(hyp.get('title', ''))}", f"Direction: {hyp.get('direction', '')}", f"Probability: {hyp.get('score', '')}", f"Status: {_clean_html(hyp.get('statusText', ''))}", f"Description: {_clean_html(hyp.get('description', ''))}"]
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
        passages.append(Passage(ticker=ticker, section="hypothesis", subsection=tier, content="\n".join(parts), tags=["hypothesis", tier, hyp.get("direction", "")], weight=1.3))

    narrative = data.get("narrative", {})
    if narrative:
        if narrative.get("theNarrative"):
            passages.append(Passage(ticker=ticker, section="narrative", subsection="the_narrative", content=f"Market narrative for {ticker}: {_clean_html(narrative['theNarrative'])}", tags=["narrative", "thesis"], weight=1.1))
        pi = narrative.get("priceImplication", {})
        if pi and pi.get("content"):
            passages.append(Passage(ticker=ticker, section="narrative", subsection="price_implication", content=f"Price implications for {ticker} ({_clean_html(pi.get('label',''))}): {_clean_html(pi['content'])}", tags=["narrative", "price", "valuation"], weight=1.0))
        if narrative.get("evidenceCheck"):
            passages.append(Passage(ticker=ticker, section="narrative", subsection="evidence_check", content=f"Evidence check for {ticker}: {_clean_html(narrative['evidenceCheck'])}", tags=["narrative", "evidence"], weight=1.0))
        if narrative.get("narrativeStability"):
            passages.append(Passage(ticker=ticker, section="narrative", subsection="stability", content=f"Narrative stability for {ticker}: {_clean_html(narrative['narrativeStability'])}", tags=["narrative", "stability", "risk"], weight=1.0))

    evidence = data.get("evidence", {})
    for card in evidence.get("cards", []):
        parts = [f"Evidence: {_clean_html(card.get('title', ''))}", f"Epistemic status: {_clean_html(card.get('epistemicLabel', ''))}", f"Finding: {_clean_html(card.get('finding', ''))}"]
        if card.get("tension"):
            parts.append(f"Tension: {_clean_html(card['tension'])}")
        if card.get("source"):
            parts.append(f"Source: {_clean_html(card['source'])}")
        tag_texts = [_clean_html(t.get("text", "")) for t in card.get("tags", [])]
        passages.append(Passage(ticker=ticker, section="evidence", subsection=f"card_{card.get('number', '')}", content="\n".join(parts), tags=["evidence"] + tag_texts, weight=1.1))
        tbl = card.get("table")
        if tbl:
            headers = tbl.get("headers", [])
            rows = tbl.get("rows", [])
            table_lines = [" | ".join(headers)]
            for row in rows:
                table_lines.append(" | ".join(_clean_html(c) for c in row))
            passages.append(Passage(ticker=ticker, section="evidence", subsection=f"card_{card.get('number', '')}_table", content=f"Data table for {_clean_html(card.get('title',''))}:\n" + "\n".join(table_lines), tags=["evidence", "data"], weight=0.8))

    alignment = evidence.get("alignmentSummary", {})
    if alignment and alignment.get("summary"):
        s = alignment["summary"]
        passages.append(Passage(ticker=ticker, section="evidence", subsection="alignment_summary", content=f"Evidence alignment summary for {ticker}: T1 support: {s.get('t1','-')}, T2 support: {s.get('t2','-')}, T3 support: {s.get('t3','-')}, T4 support: {s.get('t4','-')}", tags=["evidence", "summary", "alignment"], weight=1.0))

    disc = data.get("discriminators", {})
    if disc:
        for i, row in enumerate(disc.get("rows", [])):
            passages.append(Passage(ticker=ticker, section="discriminator", subsection=f"disc_{i+1}", content=f"Discriminator ({row.get('diagnosticity','')}) for {ticker}: {_clean_html(row.get('evidence', ''))} -- Discriminates between: {_clean_html(row.get('discriminatesBetween', ''))} -- Current reading: {_clean_html(row.get('currentReading', ''))}", tags=["discriminator", row.get("diagnosticity", "").lower()], weight=1.2))
        if disc.get("nonDiscriminating"):
            passages.append(Passage(ticker=ticker, section="discriminator", subsection="non_discriminating", content=f"Non-discriminating evidence for {ticker}: {_clean_html(disc['nonDiscriminating'])}", tags=["discriminator", "noise"], weight=0.6))

    tripwires = data.get("tripwires", {})
    for tw in tripwires.get("cards", []):
        cond_parts = []
        for cond in tw.get("conditions", []):
            cond_parts.append(f"{_clean_html(cond.get('if',''))} -> {_clean_html(cond.get('then',''))}")
        passages.append(Passage(ticker=ticker, section="tripwire", subsection=_clean_html(tw.get("name", "")), content=f"Tripwire for {ticker}: {_clean_html(tw.get('name', ''))} (Date: {_clean_html(tw.get('date', ''))})\n" + "\n".join(cond_parts), tags=["tripwire", "catalyst", "risk"], weight=1.2))

    gaps = data.get("gaps", {})
    couldnt = gaps.get("couldntAssess", [])
    if couldnt:
        passages.append(Passage(ticker=ticker, section="gaps", subsection="unknowns", content=f"Research gaps for {ticker} (what we couldn't assess):\n" + "\n".join(f"- {_clean_html(g)}" for g in couldnt), tags=["gaps", "limitations"], weight=0.9))

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
        passages.append(Passage(ticker=ticker, section="technical", subsection="analysis", content="\n".join(ta_parts), tags=["technical", "price", "chart"], weight=0.8))

    if ref:
        ref_parts = [f"Reference data for {ticker}:"]
        field_labels = {"sharesOutstanding": "Shares outstanding (M)", "analystTarget": "Analyst target price", "epsTrailing": "Trailing EPS", "epsForward": "Forward EPS", "divPerShare": "Dividend per share", "revenue": "Revenue ($B)", "revenueGrowth": "Revenue growth (%)", "ebitMargin": "EBIT margin (%)", "ebitdaMargin": "EBITDA margin (%)", "roe": "Return on equity (%)", "netDebtToEbitda": "Net debt/EBITDA", "fcf": "Free cash flow ($B)", "fcfMargin": "FCF margin (%)"}
        for key, label in field_labels.items():
            val = ref.get(key)
            if val is not None:
                ref_parts.append(f"  {label}: {val}")
        if ref.get("analystBuys") is not None:
            ref_parts.append(f"  Analyst consensus: {ref.get('analystBuys',0)} Buy, {ref.get('analystHolds',0)} Hold, {ref.get('analystSells',0)} Sell")
        passages.append(Passage(ticker=ticker, section="reference", subsection="fundamentals", content="\n".join(ref_parts), tags=["reference", "fundamentals", "financials"], weight=0.7))

    if fresh:
        passages.append(Passage(ticker=ticker, section="freshness", subsection="status", content=f"Research freshness for {ticker}: Last reviewed {fresh.get('reviewDate', 'unknown')} ({fresh.get('daysSinceReview', '?')} days ago). Price at review: {fresh.get('priceAtReview', '?')}, change since: {fresh.get('pricePctChange', '?')}%. Nearest catalyst: {fresh.get('nearestCatalyst', 'none')} ({fresh.get('nearestCatalystDays', '?')} days). Status: {fresh.get('status', 'unknown')}.", tags=["freshness", "status"], weight=0.5))

    return passages


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_store: dict[str, list[Passage]] = {}
_all_passages: list[Passage] = []


def ingest(html_path: str | None = None) -> dict[str, list[Passage]]:
    """
    Load research data from data/research/*.json and build the passage store.
    Returns {ticker: [Passage, ...]}.
    """
    global _store, _all_passages

    data_dir = _get_data_dir()
    _store = {}
    _all_passages = []

    if not data_dir.exists():
        logger.warning(f"Research data directory not found: {data_dir}")
        return _store

    json_files = sorted(data_dir.glob("*.json"))
    loaded = 0

    for json_file in json_files:
        if json_file.name.startswith("_"):
            continue

        ticker = json_file.stem.upper()

        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load {json_file.name}: {e}")
            continue

        if not isinstance(data, dict):
            logger.warning(f"Unexpected data format in {json_file.name}, skipping")
            continue

        passages = _chunk_stock(ticker, data)
        if passages:
            _store[ticker] = passages
            _all_passages.extend(passages)
            loaded += 1
            logger.info(f"  {ticker}: {len(passages)} passages from {json_file.name}")

    logger.info(f"Loaded {loaded} tickers from {data_dir}")
    return _store


def get_passages(ticker: str | None = None) -> list[Passage]:
    if ticker:
        return _store.get(ticker.upper(), [])
    return _all_passages


def get_tickers() -> list[str]:
    return sorted(_store.keys())


def get_passage_count() -> dict[str, int]:
    return {t: len(p) for t, p in sorted(_store.items())}


if __name__ == "__main__":
    store = ingest()
    for ticker, passages in sorted(store.items()):
        print(f"{ticker}: {len(passages)} passages")
        for p in passages[:3]:
            print(f"  [{p.section}/{p.subsection}] {p.content[:80]}...")
        print()
    print(f"Total: {len(_all_passages)} passages across {len(store)} stocks")
