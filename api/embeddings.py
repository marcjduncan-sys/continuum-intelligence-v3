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

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
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
