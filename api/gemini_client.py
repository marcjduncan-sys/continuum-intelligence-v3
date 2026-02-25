"""
Gemini (Google) API client for specialist analysis tasks.

Uses the google-genai SDK (new unified SDK, replaces google-generativeai).
Gemini 2.5 Flash: fast, cheap, native JSON mode via response_mime_type.
"""

import json
import logging
import time
from typing import Any

from google import genai
from google.genai import types

import config

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Lazy-init the Gemini client."""
    global _client
    if _client is None:
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not configured")
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def gemini_completion(
    system_prompt: str,
    user_prompt: str,
    *,
    json_mode: bool = True,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.3,
    max_retries: int = 2,
) -> dict[str, Any] | str:
    """
    Call Gemini generate_content API.

    Parameters
    ----------
    system_prompt : str
        System-level instruction for the specialist task.
    user_prompt : str
        The user message containing data and the specific request.
    json_mode : bool
        If True, request JSON output and parse it.
    model : str | None
        Override the default model from config.
    max_tokens : int
        Maximum tokens in the response.
    temperature : float
        Sampling temperature (lower = more deterministic).
    max_retries : int
        Number of retry attempts on transient errors.

    Returns
    -------
    dict | str
        Parsed JSON dict if json_mode=True, raw text otherwise.
    """
    client = _get_client()
    effective_model = model or config.GEMINI_MODEL

    # Build generation config
    gen_config: dict[str, Any] = {
        "max_output_tokens": max_tokens,
        "temperature": temperature,
        "system_instruction": system_prompt,
    }
    if json_mode:
        gen_config["response_mime_type"] = "application/json"

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            response = client.models.generate_content(
                model=effective_model,
                contents=user_prompt,
                config=gen_config,
            )

            # Extract text from response
            text = response.text or ""

            if json_mode:
                # Gemini with response_mime_type returns clean JSON,
                # but strip markdown fences if present as a safety measure
                text = text.strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                    text = text.rsplit("```", 1)[0]
                return json.loads(text)
            return text

        except json.JSONDecodeError as e:
            last_error = e
            logger.error(f"Gemini returned invalid JSON (attempt {attempt + 1}): {e}")
            if attempt < max_retries:
                continue
            raise ValueError(
                f"Gemini returned invalid JSON after {max_retries + 1} attempts"
            ) from e

        except Exception as e:
            last_error = e
            error_str = str(e).lower()

            # Rate limit / quota errors
            if "429" in str(e) or "quota" in error_str or "rate" in error_str:
                wait = min(2 ** attempt * 2, 30)
                logger.warning(
                    f"Gemini rate limit hit, retrying in {wait}s (attempt {attempt + 1})"
                )
                time.sleep(wait)
                continue

            # Transient server errors
            if "500" in str(e) or "503" in str(e):
                logger.warning(f"Gemini server error, retrying (attempt {attempt + 1})")
                time.sleep(1)
                continue

            # Non-retryable error
            logger.error(f"Gemini API error: {e}")
            if attempt < max_retries:
                time.sleep(1)
            else:
                raise

    raise RuntimeError(f"Gemini API failed after {max_retries + 1} attempts: {last_error}")
