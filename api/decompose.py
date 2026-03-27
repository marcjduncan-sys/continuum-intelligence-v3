"""
Research document decomposition pipeline.

Takes extracted text from a broker/research document plus the ticker's
existing N1-N4 hypotheses, calls Claude to decompose the text into a
structured view, and parses the response.
"""

import json
import logging
import os
import re
from typing import Any

import config
from llm import complete

logger = logging.getLogger(__name__)

_MAX_TEXT_CHARS = 80_000


def _load_hypotheses(ticker: str) -> list[dict]:
    """Load N1-N4 hypotheses from the ticker's research JSON."""
    research_path = os.path.join(
        config.PROJECT_ROOT, "data", "research", f"{ticker.upper()}.json"
    )
    with open(research_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("hypotheses", [])


def _format_hypotheses(hypotheses: list[dict]) -> str:
    """Format hypotheses for inclusion in the decomposition prompt."""
    lines = []
    for h in hypotheses:
        tier = h.get("tier", "").upper()
        title = h.get("title", tier)
        direction = h.get("direction", "unknown")
        score = h.get("score", "?")
        description = h.get("description", "")
        lines.append(
            f"### {title}\n"
            f"- Direction: {direction}\n"
            f"- Current probability: {score}\n"
            f"- Description: {description}\n"
        )
    return "\n".join(lines)


def build_decomposition_prompt(
    extracted_text: str,
    ticker: str,
    hypotheses: list[dict],
) -> tuple[str, str]:
    """Build system prompt and user message for decomposition.

    Returns (system_prompt, user_message).
    """
    hyp_text = _format_hypotheses(hypotheses)

    system_prompt = (
        "You are a structured research analyst. Your task is to decompose "
        "an external research document into a structured view aligned to "
        "a set of existing hypotheses for a stock.\n\n"
        "Rules:\n"
        "- Respond with valid JSON only. No commentary, no markdown fences.\n"
        "- Map the source's view to the hypothesis it most closely aligns with.\n"
        "- If the source's view does not fit any hypothesis, use \"CONTRARIAN\".\n"
        "- If the source supports multiple hypotheses roughly equally, use \"MIXED\".\n"
        "- Set price_target to null if no explicit price target is stated.\n"
        "- Do not editorialise. Extract the source's view, do not add your own.\n"
        "- Evidence and risk points should be concise (1-2 sentences each).\n\n"
        "Response JSON schema:\n"
        "{\n"
        '  "aligned_hypothesis": "N1" | "N2" | "N3" | "N4" | "CONTRARIAN" | "MIXED",\n'
        '  "alignment_confidence": 0.0 to 1.0,\n'
        '  "direction": "upside" | "downside" | "neutral",\n'
        '  "price_target": number or null,\n'
        '  "conviction_signals": {\n'
        '    "language_strength": "high" | "moderate" | "low",\n'
        '    "caveats_count": integer,\n'
        '    "conditional_phrasing": true | false\n'
        "  },\n"
        '  "key_evidence": [\n'
        '    {"point": "...", "supports": "N1"}\n'
        "  ],\n"
        '  "key_risks": [\n'
        '    {"point": "...", "threatens": "N2"}\n'
        "  ],\n"
        '  "summary": "2-3 sentence summary of the source\'s view"\n'
        "}"
    )

    user_message = (
        f"## Ticker: {ticker.upper()}\n\n"
        f"## Current Hypotheses\n\n{hyp_text}\n\n"
        f"## Research Document Text\n\n{extracted_text}"
    )

    return system_prompt, user_message


def parse_decomposition_response(raw_text: str) -> dict:
    """Parse Claude's JSON response into a structured dict.

    Handles clean JSON, JSON in code fences, partial/malformed responses,
    and empty responses.
    """
    _EMPTY = {
        "aligned_hypothesis": None,
        "alignment_confidence": None,
        "direction": None,
        "price_target": None,
        "conviction_signals": None,
        "key_evidence": None,
        "key_risks": None,
        "summary": None,
    }

    if not raw_text or not raw_text.strip():
        return dict(_EMPTY)

    text = raw_text.strip()

    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0]
        text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                parsed = json.loads(match.group())
            except json.JSONDecodeError:
                return dict(_EMPTY)
        else:
            return dict(_EMPTY)

    if not isinstance(parsed, dict):
        return dict(_EMPTY)

    result = {}

    # aligned_hypothesis
    valid_hypotheses = {"N1", "N2", "N3", "N4", "CONTRARIAN", "MIXED"}
    ah = parsed.get("aligned_hypothesis")
    if isinstance(ah, str):
        ah = ah.upper()
    result["aligned_hypothesis"] = ah if ah in valid_hypotheses else None

    # alignment_confidence: clamp to 0.0-1.0
    ac = parsed.get("alignment_confidence")
    if ac is not None:
        try:
            ac = float(ac)
            ac = max(0.0, min(1.0, ac))
        except (TypeError, ValueError):
            ac = None
    result["alignment_confidence"] = ac

    # direction
    valid_directions = {"upside", "downside", "neutral"}
    d = parsed.get("direction")
    if isinstance(d, str):
        d = d.lower()
    result["direction"] = d if d in valid_directions else None

    # price_target
    pt = parsed.get("price_target")
    if pt is not None:
        try:
            pt = float(pt)
        except (TypeError, ValueError):
            pt = None
    result["price_target"] = pt

    # conviction_signals
    cs = parsed.get("conviction_signals")
    if isinstance(cs, dict):
        valid_strength = {"high", "moderate", "low"}
        ls = cs.get("language_strength")
        if isinstance(ls, str):
            ls = ls.lower()
        result["conviction_signals"] = {
            "language_strength": ls if ls in valid_strength else None,
            "caveats_count": (
                int(cs["caveats_count"])
                if isinstance(cs.get("caveats_count"), (int, float))
                else None
            ),
            "conditional_phrasing": (
                bool(cs["conditional_phrasing"])
                if isinstance(cs.get("conditional_phrasing"), bool)
                else None
            ),
        }
    else:
        result["conviction_signals"] = None

    # key_evidence
    ke = parsed.get("key_evidence")
    if isinstance(ke, list):
        result["key_evidence"] = [
            {"point": str(item.get("point", "")), "supports": str(item.get("supports", ""))}
            for item in ke
            if isinstance(item, dict)
        ]
    else:
        result["key_evidence"] = None

    # key_risks
    kr = parsed.get("key_risks")
    if isinstance(kr, list):
        result["key_risks"] = [
            {"point": str(item.get("point", "")), "threatens": str(item.get("threatens", ""))}
            for item in kr
            if isinstance(item, dict)
        ]
    else:
        result["key_risks"] = None

    # summary
    s = parsed.get("summary")
    result["summary"] = str(s) if s is not None else None

    return result


async def decompose_document(
    extracted_text: str,
    ticker: str,
    hypotheses: list[dict],
    model: str = "claude-sonnet-4-20250514",
) -> dict:
    """Full decomposition: build prompt, call Claude, parse response.

    Truncates input at 80,000 characters. Returns parsed dict plus
    raw_decomposition and model_used fields.
    """
    if len(extracted_text) > _MAX_TEXT_CHARS:
        extracted_text = (
            extracted_text[:_MAX_TEXT_CHARS]
            + "\n\n[Document truncated at 80,000 characters for analysis]"
        )

    system_prompt, user_message = build_decomposition_prompt(
        extracted_text, ticker, hypotheses
    )

    response = await complete(
        model=model,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        max_tokens=2000,
        temperature=0.2,
        json_mode=True,
        feature="source_decomposition",
        ticker=ticker,
    )

    parsed = parse_decomposition_response(response.text)
    parsed["raw_decomposition"] = response.json if response.json else response.text
    parsed["model_used"] = model

    return parsed
