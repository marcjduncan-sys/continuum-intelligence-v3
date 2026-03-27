"""
Unified LLM abstraction layer (Phase 4).

All LLM calls route through `complete()`. Provider dispatch is automatic
based on model name prefix. Every call is logged with token counts and cost.

Supported providers:
  - Anthropic (claude-*): via config.get_anthropic_client()
  - Google Gemini (gemini-*): via gemini_client.gemini_completion()

Adding a provider: extend _PROVIDER_MAP and add a _call_<provider> function.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import config
from task_monitor import monitored_task

logger = logging.getLogger(__name__)

# Tracks the last successful LLM call (wall-clock) per provider for health reporting.
_last_success: dict[str, float] = {}  # provider -> time.time()

# ---------------------------------------------------------------------------
# Pricing (USD per 1M tokens)
# ---------------------------------------------------------------------------

_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-sonnet-4-5-20250929": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
}

_ZERO_PRICE = {"input": 0.0, "output": 0.0}


def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    prices = _PRICING.get(model, _ZERO_PRICE)
    return (
        input_tokens * prices["input"] / 1_000_000
        + output_tokens * prices["output"] / 1_000_000
    )


# ---------------------------------------------------------------------------
# Response dataclass
# ---------------------------------------------------------------------------

@dataclass
class LLMResponse:
    text: str
    json: dict | None = None
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    provider: str = ""


# ---------------------------------------------------------------------------
# Provider dispatch
# ---------------------------------------------------------------------------

def _detect_provider(model: str) -> str:
    if model.startswith("claude"):
        return "anthropic"
    if model.startswith("gemini"):
        return "google"
    raise ValueError(f"Unknown provider for model: {model}")


# ---------------------------------------------------------------------------
# Anthropic provider
# ---------------------------------------------------------------------------

def _strip_markdown_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        text = text.rsplit("```", 1)[0]
    return text.strip()


async def _call_anthropic(
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    json_mode: bool,
) -> LLMResponse:
    client = config.get_anthropic_client()

    if json_mode:
        system = system + "\n\nRespond with valid JSON only."

    response = await asyncio.to_thread(
        client.messages.create,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=messages,
    )

    text = ""
    for block in response.content:
        if block.type == "text":
            text += block.text

    input_tokens = getattr(response.usage, "input_tokens", 0)
    output_tokens = getattr(response.usage, "output_tokens", 0)

    parsed = None
    if json_mode:
        text = _strip_markdown_fences(text)
        parsed = json.loads(text)

    return LLMResponse(
        text=text,
        json=parsed,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=_compute_cost(model, input_tokens, output_tokens),
        provider="anthropic",
    )


# ---------------------------------------------------------------------------
# Gemini provider
# ---------------------------------------------------------------------------

async def _call_gemini(
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    json_mode: bool,
) -> LLMResponse:
    from google import genai
    from google.genai import types

    _ensure_gemini_client()

    user_content = ""
    for m in messages:
        if m["role"] == "user":
            user_content += m["content"] + "\n"

    gen_config: dict[str, Any] = {
        "max_output_tokens": max_tokens,
        "temperature": temperature,
        "system_instruction": system,
    }
    if json_mode:
        gen_config["response_mime_type"] = "application/json"

    response = await asyncio.to_thread(
        _gemini_client.models.generate_content,
        model=model,
        contents=user_content.strip(),
        config=gen_config,
    )

    text = response.text or ""

    input_tokens = 0
    output_tokens = 0
    usage = getattr(response, "usage_metadata", None)
    if usage:
        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0

    parsed = None
    if json_mode:
        text = _strip_markdown_fences(text)
        parsed = json.loads(text)

    return LLMResponse(
        text=text,
        json=parsed,
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=_compute_cost(model, input_tokens, output_tokens),
        provider="google",
    )


_gemini_client = None


def _ensure_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not configured")
        _gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)


# ---------------------------------------------------------------------------
# Retry wrapper
# ---------------------------------------------------------------------------

_RETRYABLE_STRINGS = ("429", "quota", "rate", "500", "503", "overloaded")


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, json.JSONDecodeError):
        return True
    error_str = str(exc).lower()
    return any(s in error_str for s in _RETRYABLE_STRINGS)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def complete(
    *,
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 4096,
    temperature: float = 0.0,
    json_mode: bool = False,
    feature: str = "unknown",
    ticker: str | None = None,
    fallback_model: str | None = None,
    max_retries: int = 2,
) -> LLMResponse:
    """
    Unified LLM completion.

    Routes to the correct provider based on model prefix. Retries on transient
    errors. Falls back to fallback_model if the primary model fails entirely.
    Logs every call (including failures) to the llm_calls table.
    """
    provider = _detect_provider(model)
    call_fn = _call_anthropic if provider == "anthropic" else _call_gemini

    last_error = None
    for attempt in range(max_retries + 1):
        t0 = time.monotonic()
        try:
            result = await call_fn(
                model=model,
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                json_mode=json_mode,
            )
            result.latency_ms = int((time.monotonic() - t0) * 1000)
            _last_success[provider] = time.time()

            # Log success (fire-and-forget)
            monitored_task(_log_call(
                feature=feature, model=model, provider=provider,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                cost_usd=result.cost_usd,
                latency_ms=result.latency_ms,
                ticker=ticker, success=True,
            ), name="llm_log_call")

            return result

        except json.JSONDecodeError as e:
            last_error = e
            logger.warning(
                "%s: invalid JSON from %s (attempt %d/%d): %s",
                feature, model, attempt + 1, max_retries + 1, e,
            )
            if attempt < max_retries:
                continue

        except Exception as e:
            last_error = e
            latency = int((time.monotonic() - t0) * 1000)
            logger.warning(
                "%s: %s error (attempt %d/%d, %dms): %s",
                feature, model, attempt + 1, max_retries + 1, latency, e,
            )

            if _is_retryable(e) and attempt < max_retries:
                wait = min(2 ** attempt * 2, 30)
                await asyncio.sleep(wait)
                continue

            if attempt >= max_retries:
                # Log the failure
                monitored_task(_log_call(
                    feature=feature, model=model, provider=provider,
                    input_tokens=0, output_tokens=0, cost_usd=0.0,
                    latency_ms=latency, ticker=ticker, success=False,
                    error_message=str(e)[:500],
                ), name="llm_log_call")
                break

    # Primary model exhausted retries; try fallback if available
    if fallback_model:
        logger.info(
            "%s: primary %s failed, falling back to %s",
            feature, model, fallback_model,
        )
        try:
            return await complete(
                model=fallback_model,
                system=system,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                json_mode=json_mode,
                feature=feature,
                ticker=ticker,
                fallback_model=None,
                max_retries=max_retries,
            )
        except Exception as fb_err:
            logger.error(
                "%s: fallback %s also failed: %s", feature, fallback_model, fb_err
            )
            raise fb_err from last_error

    raise RuntimeError(
        f"{feature}: {model} failed after {max_retries + 1} attempts: {last_error}"
    ) from last_error


# ---------------------------------------------------------------------------
# Async logging (fire-and-forget)
# ---------------------------------------------------------------------------

async def _log_call(
    feature: str,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    latency_ms: int,
    ticker: str | None,
    success: bool,
    error_message: str | None = None,
) -> None:
    try:
        import db
        pool = await db.get_pool()
        if pool is None:
            return
        await db.log_llm_call(
            pool,
            feature=feature,
            model=model,
            provider=provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            ticker=ticker,
            success=success,
            error_message=error_message,
        )
    except Exception as exc:
        logger.debug("Failed to log LLM call: %s", exc)


def get_llm_status() -> dict:
    """Return last-success timestamps per provider for health reporting."""
    from datetime import datetime, timezone
    result = {}
    for provider, ts in _last_success.items():
        result[provider] = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    return result
