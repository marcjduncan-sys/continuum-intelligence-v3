"""
Embedding generation (Phase 7: Memory Selection & Ranking).

Generates vector embeddings using Google text-embedding-004 via a direct
REST call to the Generative Language API v1beta. Uses the single-item
embedContent endpoint, which text-embedding-004 supports. The SDK'''s
embed_content method routes to batchEmbedContents, which is not supported
by this model.

Architecture constraint: this model must not be changed without a full
re-embedding migration of all stored memory vectors.
"""

import asyncio
import logging

import httpx

import config

logger = logging.getLogger(__name__)

_EMBED_URL = (
    "https://generativelanguage.googleapis.com"
    "/v1beta/models/text-embedding-004:embedContent"
)

# Module-level pooled HTTP client (lazy init, reused across all calls)
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    """Return the shared httpx.AsyncClient, creating it on first use."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=10),
        )
    return _client


async def close_client() -> None:
    """Close the shared httpx client on shutdown."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
        _client = None
        logger.info("Embeddings httpx client closed")


async def generate_embedding(text: str) -> list[float] | None:
    """Generate a vector embedding for the given text.

    Returns a list of floats (768 dimensions for text-embedding-004),
    or None if the embedding could not be generated.
    """
    if not text or not text.strip():
        return None
    if not config.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not configured -- skipping embedding")
        return None

    payload = {
        "model": "models/text-embedding-004",
        "content": {"parts": [{"text": text.strip()}]},
    }

    client = _get_client()
    for attempt in range(2):
        try:
            response = await client.post(
                _EMBED_URL,
                params={"key": config.GEMINI_API_KEY},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            values = data["embedding"]["values"]
            if len(values) != 768:
                logger.warning(
                    "Unexpected embedding dimension %d (expected 768) -- discarding",
                    len(values),
                )
                return None
            return values
        except Exception as exc:
            if attempt == 0:
                logger.warning("Embedding generation failed (attempt 1): %s -- retrying", exc)
                await asyncio.sleep(1)
            else:
                logger.warning("Embedding generation failed (attempt 2): %s -- giving up", exc)
    return None


async def health_check() -> str:
    """Check embedding API reachability. Returns 'ok', 'no_api_key', or 'unreachable'."""
    if not config.GEMINI_API_KEY:
        return "no_api_key"
    try:
        client = _get_client()
        resp = await client.post(
            _EMBED_URL,
            params={"key": config.GEMINI_API_KEY},
            json={
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": "health"}]},
            },
            timeout=10.0,
        )
        return "ok" if resp.status_code == 200 else f"error:{resp.status_code}"
    except Exception as exc:
        logger.debug("Embedding health check failed: %s", exc)
        return "unreachable"
