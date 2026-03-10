"""
Embedding generation (Phase 7: Memory Selection & Ranking).

Generates vector embeddings using Google text-embedding-004 via the
existing google-genai SDK. Used for memory semantic search at query time
and for embedding memories at extraction time.

Architecture constraint: this model must not be changed without a full
re-embedding migration of all stored memory vectors.
"""

import asyncio
import logging

import config

logger = logging.getLogger(__name__)

_client = None


def _ensure_client():
    global _client
    if _client is None:
        from google import genai
        if not config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY not configured")
        _client = genai.Client(api_key=config.GEMINI_API_KEY)


async def generate_embedding(text: str) -> list[float] | None:
    """Generate a vector embedding for the given text.

    Returns a list of floats (768 dimensions for text-embedding-004),
    or None if the embedding could not be generated.
    """
    if not text or not text.strip():
        return None

    try:
        _ensure_client()
        response = await asyncio.to_thread(
            _client.models.embed_content,
            model=config.EMBEDDING_MODEL,
            contents=text.strip(),
        )
        if response and response.embeddings:
            return list(response.embeddings[0].values)
        return None
    except Exception as exc:
        logger.warning("Embedding generation failed: %s", exc)
        return None
