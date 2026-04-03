"""
Workstation payload extraction endpoint.

POST /api/extract-workstation
  Body: { "ticker": str, "source_text": str }
  Returns: validated workstation JSON payload
  Errors: 422 with detail listing validation errors

Uses the Claude API with a workstation extraction system prompt.
Validates the response against the workstation schema.
Retries once if the first attempt produces an invalid payload.
Respects LLM semaphore (max 2 concurrent).
"""

import asyncio
import json
import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import config
from prompts.workstation_extraction import WORKSTATION_EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

# LLM semaphore: max 2 concurrent extraction LLM calls
_llm_semaphore: asyncio.Semaphore | None = None
_llm_semaphore_loop: asyncio.AbstractEventLoop | None = None


def _get_llm_semaphore() -> asyncio.Semaphore:
    """Return the LLM semaphore, creating it if needed for the current loop."""
    global _llm_semaphore, _llm_semaphore_loop
    loop = asyncio.get_running_loop()
    if _llm_semaphore is None or _llm_semaphore_loop is not loop:
        _llm_semaphore = asyncio.Semaphore(2)
        _llm_semaphore_loop = loop
    return _llm_semaphore


# ---------------------------------------------------------------------------
# Validator constants
# ---------------------------------------------------------------------------

_VERDICT_RATINGS = {'Strong Buy', 'Accumulate', 'Hold', 'Reduce', 'Sell'}
_SKEW_OPTIONS = {'Strong upside', 'Moderate upside', 'Balanced', 'Moderate downside', 'Strong downside'}
_WATCHLIST_SEVERITIES = {'High', 'Medium', 'Low', 'Supportive'}
_EVIDENCE_CATEGORIES = {'Observed', 'Inference', 'Tripwire'}
_EVIDENCE_QUALITIES = {'High quality', 'Needs market proof', 'Directional', 'Critical'}
_RISK_IMPACTS = {'High', 'Medium', 'Low'}
_RISK_PROBABILITIES = {'High', 'Medium', 'Low-Medium', 'Low'}
_REVISION_DIRECTIONS = {'positive', 'negative', 'neutral'}
_SCENARIO_STYLES = {'bull', 'base', 'bear', 'stretch', 'stress'}
_CHAT_ROLES = {'analyst', 'pm', 'strategist'}
_TAG_COLOURS = {'blue', 'green', 'red', 'amber', 'violet'}

_REQUIRED_TOP_LEVEL_FIELDS = [
    'schema_version',
    'generated_at',
    'identity',
    'verdict',
    'decision_strip',
    'summary',
    'watchlist',
    'thesis',
    'scenarios',
    'valuation',
    'risks',
    'evidence',
    'revisions',
    'deep_research',
    'quality',
    'chat_seed',
]

_STRONG_OPEN_RE = re.compile(r'<strong>')
_STRONG_CLOSE_RE = re.compile(r'</strong>')
_ANY_TAG_RE = re.compile(r'<[^>]+>')


# ---------------------------------------------------------------------------
# Inline HTML validator
# ---------------------------------------------------------------------------

def _validate_inline_html(text: str) -> tuple[bool, list[str]]:
    """Check inline HTML in a prose field.

    Returns (valid, warnings). Only <strong>, </strong>, and <br> are allowed.
    Unbalanced <strong> tags make the field invalid.
    """
    if not text or not isinstance(text, str):
        return True, []

    warnings: list[str] = []

    open_count = len(_STRONG_OPEN_RE.findall(text))
    close_count = len(_STRONG_CLOSE_RE.findall(text))

    if open_count != close_count:
        return False, [
            f"Unbalanced <strong> tags: {open_count} open, {close_count} close"
        ]

    for tag in _ANY_TAG_RE.findall(text):
        if tag not in ('<strong>', '</strong>', '<br>'):
            warnings.append(
                f"Disallowed HTML tag found: {tag}. Only <strong>, </strong>, and <br> are permitted."
            )

    return True, warnings


# ---------------------------------------------------------------------------
# Scenario probability validator
# ---------------------------------------------------------------------------

def _validate_scenario_probabilities(scenarios: list[Any]) -> list[str]:
    """Validate probability distribution across scenarios.

    Returns a list of error strings (empty on success).
    """
    errors: list[str] = []

    if not isinstance(scenarios, list):
        return ['Scenarios must be an array']

    if len(scenarios) < 3 or len(scenarios) > 5:
        errors.append(f'Scenarios must contain 3-5 items, got {len(scenarios)}')
        return errors

    total = 0.0
    base_count = 0

    for i, s in enumerate(scenarios):
        if not isinstance(s, dict):
            errors.append(f'Scenario at index {i} is not an object')
            continue

        prob = s.get('probability')
        if not isinstance(prob, (int, float)):
            errors.append(
                f'Scenario at index {i} has invalid probability: expected number, got {type(prob).__name__}'
            )
            continue

        prob = float(prob)
        if prob < 0.01 or prob > 0.99:
            errors.append(
                f'Scenario at index {i} probability {prob} outside range [0.01, 0.99]'
            )

        total += prob

        style = s.get('style')
        if style == 'base':
            base_count += 1
            if prob < 0.35 or prob > 0.55:
                errors.append(
                    f'Base case scenario probability {prob} outside range [0.35, 0.55]'
                )
        else:
            if prob > 0.30:
                errors.append(
                    f'Non-base scenario "{style}" has probability {prob} exceeding max 0.30'
                )

    if abs(total - 1.0) > 0.001:
        errors.append(
            f'Scenario probabilities sum to {total:.3f}, not 1.0 (tolerance 0.001)'
        )

    if base_count != 1:
        errors.append(f'Expected exactly 1 base case scenario, found {base_count}')

    return errors


# ---------------------------------------------------------------------------
# Main payload validator
# ---------------------------------------------------------------------------

def validate_workstation_payload(
    payload: dict,
) -> tuple[bool, list[str], list[str]]:
    """Validate a workstation JSON payload against the schema.

    Python port of src/features/workstation/ws-schema-validator.js.

    Returns (valid, errors, warnings).
    """
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(payload, dict):
        return False, ['Payload must be a non-null object'], []

    # Required top-level fields
    for field in _REQUIRED_TOP_LEVEL_FIELDS:
        if field not in payload:
            errors.append(f'Missing required field: {field}')

    # schema_version
    if payload.get('schema_version') != '1.0.0':
        errors.append(f'schema_version must be "1.0.0", got "{payload.get("schema_version")}"')

    # identity
    identity = payload.get('identity')
    if isinstance(identity, dict):
        ticker = identity.get('ticker')
        if not ticker or not isinstance(ticker, str) or len(ticker) == 0 or len(ticker) > 6:
            errors.append(
                f'identity.ticker must be non-empty string, max 6 chars; got "{ticker}"'
            )

    # verdict
    verdict = payload.get('verdict')
    if isinstance(verdict, dict):
        rating = verdict.get('rating')
        if rating not in _VERDICT_RATINGS:
            errors.append(
                f'verdict.rating must be one of {", ".join(sorted(_VERDICT_RATINGS))}; got "{rating}"'
            )

        skew = verdict.get('skew')
        if skew not in _SKEW_OPTIONS:
            errors.append(
                f'verdict.skew must be one of {", ".join(sorted(_SKEW_OPTIONS))}; got "{skew}"'
            )

        confidence_pct = verdict.get('confidence_pct')
        if (
            not isinstance(confidence_pct, int)
            or isinstance(confidence_pct, bool)
            or confidence_pct < 0
            or confidence_pct > 100
        ):
            errors.append(
                f'verdict.confidence_pct must be integer 0-100; got {confidence_pct}'
            )

    # scenarios
    scenarios = payload.get('scenarios')
    if isinstance(scenarios, list):
        errors.extend(_validate_scenario_probabilities(scenarios))
        for i, s in enumerate(scenarios):
            if isinstance(s, dict):
                style = s.get('style')
                if style not in _SCENARIO_STYLES:
                    errors.append(
                        f'scenarios[{i}].style must be one of '
                        f'{", ".join(sorted(_SCENARIO_STYLES))}; got "{style}"'
                    )
    elif scenarios is not None:
        errors.append('scenarios must be an array')

    # watchlist
    watchlist = payload.get('watchlist')
    if isinstance(watchlist, list):
        if len(watchlist) < 3 or len(watchlist) > 5:
            errors.append(f'watchlist must contain 3-5 items, got {len(watchlist)}')
        for i, item in enumerate(watchlist):
            if isinstance(item, dict):
                severity = item.get('severity')
                if severity not in _WATCHLIST_SEVERITIES:
                    errors.append(
                        f'watchlist[{i}].severity must be one of '
                        f'{", ".join(sorted(_WATCHLIST_SEVERITIES))}; got "{severity}"'
                    )
    elif watchlist is not None:
        errors.append('watchlist must be an array')

    # evidence
    evidence = payload.get('evidence')
    if isinstance(evidence, dict):
        items = evidence.get('items')
        if isinstance(items, list):
            for i, item in enumerate(items):
                if isinstance(item, dict):
                    category = item.get('category')
                    if category not in _EVIDENCE_CATEGORIES:
                        errors.append(
                            f'evidence.items[{i}].category must be one of '
                            f'{", ".join(sorted(_EVIDENCE_CATEGORIES))}; got "{category}"'
                        )
                    quality = item.get('quality')
                    if quality not in _EVIDENCE_QUALITIES:
                        errors.append(
                            f'evidence.items[{i}].quality must be one of '
                            f'{", ".join(sorted(_EVIDENCE_QUALITIES))}; got "{quality}"'
                        )

    # risks
    risks = payload.get('risks')
    if isinstance(risks, dict):
        items = risks.get('items')
        if isinstance(items, list):
            for i, item in enumerate(items):
                if isinstance(item, dict):
                    impact = item.get('impact')
                    if impact not in _RISK_IMPACTS:
                        errors.append(
                            f'risks.items[{i}].impact must be one of '
                            f'{", ".join(sorted(_RISK_IMPACTS))}; got "{impact}"'
                        )
                    probability = item.get('probability')
                    if probability not in _RISK_PROBABILITIES:
                        errors.append(
                            f'risks.items[{i}].probability must be one of '
                            f'{", ".join(sorted(_RISK_PROBABILITIES))}; got "{probability}"'
                        )

    # revisions
    revisions = payload.get('revisions')
    if isinstance(revisions, dict):
        items = revisions.get('items')
        if isinstance(items, list):
            for i, item in enumerate(items):
                if isinstance(item, dict):
                    direction = item.get('direction')
                    if direction not in _REVISION_DIRECTIONS:
                        errors.append(
                            f'revisions.items[{i}].direction must be one of '
                            f'{", ".join(sorted(_REVISION_DIRECTIONS))}; got "{direction}"'
                        )

    # chat_seed
    chat_seed = payload.get('chat_seed')
    if isinstance(chat_seed, dict):
        messages = chat_seed.get('messages')
        if isinstance(messages, list):
            for i, msg in enumerate(messages):
                if isinstance(msg, dict):
                    role = msg.get('role')
                    if role not in _CHAT_ROLES:
                        errors.append(
                            f'chat_seed.messages[{i}].role must be one of '
                            f'{", ".join(sorted(_CHAT_ROLES))}; got "{role}"'
                        )
                    tag = msg.get('tag')
                    if isinstance(tag, dict):
                        colour = tag.get('colour')
                        if colour not in _TAG_COLOURS:
                            errors.append(
                                f'chat_seed.messages[{i}].tag.colour must be one of '
                                f'{", ".join(sorted(_TAG_COLOURS))}; got "{colour}"'
                            )

    # Inline HTML check on summary, thesis string fields
    for field_name in ('summary', 'thesis'):
        val = payload.get(field_name)
        if isinstance(val, str):
            valid, html_issues = _validate_inline_html(val)
            if not valid:
                errors.extend(html_issues)
            elif html_issues:
                warnings.extend(html_issues)

    return len(errors) == 0, errors, warnings


# ---------------------------------------------------------------------------
# Claude call helper
# ---------------------------------------------------------------------------

def _strip_markdown_fences(text: str) -> str:
    """Remove leading/trailing markdown code fences if present."""
    text = text.strip()
    if text.startswith('```'):
        # Strip opening fence (e.g. ```json or ```)
        text = re.sub(r'^```[a-zA-Z]*\n?', '', text)
        # Strip closing fence
        text = re.sub(r'\n?```\s*$', '', text)
    return text.strip()


def _call_claude(system_prompt: str, user_message: str) -> str:
    """Call the Anthropic API synchronously and return the text response."""
    client = config.get_anthropic_client()
    response = client.messages.create(
        model=config.ANTHROPIC_MODEL,
        max_tokens=8192,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
        timeout=120.0,
    )
    return response.content[0].text


# ---------------------------------------------------------------------------
# Core extraction function
# ---------------------------------------------------------------------------

async def extract_workstation(source_text: str, ticker: str) -> dict:
    """Extract and validate a workstation payload from source text.

    Acquires the LLM semaphore (max 2 concurrent), calls Claude,
    validates the response, and retries once if validation fails.

    Raises ValueError if the payload is still invalid after one retry.
    """
    system_prompt = WORKSTATION_EXTRACTION_PROMPT.format(ticker=ticker)
    semaphore = _get_llm_semaphore()

    async with semaphore:
        # First attempt
        raw = _call_claude(system_prompt, source_text)

    try:
        payload = json.loads(_strip_markdown_fences(raw))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude response was not valid JSON: {exc}") from exc

    valid, errors, warnings = validate_workstation_payload(payload)

    if warnings:
        logger.warning(
            "Workstation extraction warnings for %s: %s", ticker, "; ".join(warnings)
        )

    if valid:
        return payload

    # Retry once with errors appended to the user message
    logger.warning(
        "Workstation extraction attempt 1 invalid for %s (%d errors). Retrying.",
        ticker,
        len(errors),
    )
    retry_message = (
        source_text
        + "\n\n---\nThe previous response failed validation. Fix these errors and return corrected JSON:\n"
        + "\n".join(f"- {e}" for e in errors)
    )

    async with semaphore:
        raw2 = _call_claude(system_prompt, retry_message)

    try:
        payload2 = json.loads(_strip_markdown_fences(raw2))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude retry response was not valid JSON: {exc}") from exc

    valid2, errors2, warnings2 = validate_workstation_payload(payload2)

    if warnings2:
        logger.warning(
            "Workstation extraction retry warnings for %s: %s",
            ticker,
            "; ".join(warnings2),
        )

    if not valid2:
        raise ValueError(
            f"Workstation payload invalid after retry for {ticker}. Errors: {errors2}"
        )

    return payload2


# ---------------------------------------------------------------------------
# FastAPI router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api", tags=["workstation"])


class ExtractionRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=6)
    source_text: str = Field(..., min_length=50)


@router.post("/extract-workstation")
async def extract_workstation_endpoint(request: ExtractionRequest) -> dict:
    """Extract a structured workstation payload from free-text research."""
    try:
        payload = await extract_workstation(request.source_text, request.ticker)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return payload
