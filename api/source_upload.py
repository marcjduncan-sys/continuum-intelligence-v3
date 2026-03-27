"""
Research source upload endpoint.

Handles file upload, text extraction, Claude decomposition, passage
chunking, embedding generation, and DB persistence for user-uploaded
research documents.
"""

import asyncio
import logging
import time

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth import decode_token
import db
from decompose import decompose_document, _load_hypotheses
from embeddings import generate_embedding
from ingest import get_tickers
from text_extract import extract_text, validate_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sources", tags=["sources"])

# Rate limiter for upload endpoint (in-memory, consistent with main.py pattern)
_limiter = Limiter(key_func=get_remote_address)

# Serialise uploads to protect Fly.io memory (512MB-1GB)
_upload_semaphore = asyncio.Semaphore(1)


# ---------------------------------------------------------------------------
# Identity helper (same pattern as conversations.py)
# ---------------------------------------------------------------------------

def _get_identity(request: Request, guest_id_param: str | None = None):
    """Extract user identity from JWT or guest_id fallback."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            return payload.get("sub"), None
    return None, guest_id_param


# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------

def chunk_text(text: str, target_size: int = 1500, max_size: int = 2500) -> list[str]:
    """Split extracted text into retrieval-friendly chunks.

    Splits on paragraph boundaries first, then sentences if needed.
    Discards chunks under 50 characters.
    """
    if not text or not text.strip():
        return []

    # Split on double newlines (paragraph boundaries)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    # Further split any paragraph exceeding max_size
    split_paragraphs: list[str] = []
    for para in paragraphs:
        if len(para) <= max_size:
            split_paragraphs.append(para)
        else:
            # Try splitting on single newlines
            sub_parts = [s.strip() for s in para.split("\n") if s.strip()]
            for sub in sub_parts:
                if len(sub) <= max_size:
                    split_paragraphs.append(sub)
                else:
                    # Split on sentence boundaries
                    sentences = sub.split(". ")
                    current = ""
                    for sent in sentences:
                        candidate = (current + ". " + sent).strip() if current else sent
                        if len(candidate) <= max_size:
                            current = candidate
                        else:
                            if current:
                                split_paragraphs.append(current)
                            current = sent
                    if current:
                        split_paragraphs.append(current)

    # Accumulate paragraphs into chunks at target_size
    chunks: list[str] = []
    current_chunk = ""
    for para in split_paragraphs:
        if not current_chunk:
            current_chunk = para
        elif len(current_chunk) + len(para) + 2 <= target_size:
            current_chunk = current_chunk + "\n\n" + para
        else:
            chunks.append(current_chunk)
            current_chunk = para

    if current_chunk:
        chunks.append(current_chunk)

    # Discard chunks under 50 characters
    return [c for c in chunks if len(c) >= 50]


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------

class UploadResponse(BaseModel):
    source_id: str
    source_name: str
    ticker: str
    view: dict
    passage_count: int
    processing_time_ms: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload")
@_limiter.limit("5/minute")
async def upload_source(
    request: Request,
    file: UploadFile,
    ticker: str = Form(...),
    source_name: str = Form(...),
    source_type: str = Form("broker"),
    document_date: str | None = Form(None),
    guest_id: str | None = Form(None),
):
    """Upload a research document for a covered ticker."""
    start = time.time()

    # Identity
    user_id, guest_id = _get_identity(request, guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization header or guest_id.",
        )

    # Validate ticker is in coverage
    ticker = ticker.upper()
    if ticker not in get_tickers():
        raise HTTPException(
            status_code=404,
            detail=f"Ticker '{ticker}' is not in coverage.",
        )

    # Read file bytes
    file_bytes = await file.read()
    filename = file.filename or "unknown"

    # Validate file
    try:
        validate_upload(file_bytes, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Acquire semaphore (serialise uploads for memory safety)
    async with _upload_semaphore:
        try:
            # Extract text
            extracted_text, page_count, mime_type = extract_text(file_bytes, filename)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Load hypotheses for this ticker
        try:
            hypotheses = _load_hypotheses(ticker)
        except FileNotFoundError:
            raise HTTPException(
                status_code=404,
                detail=f"Research data not found for ticker '{ticker}'.",
            )

        # Decompose via Claude
        try:
            view = await decompose_document(
                extracted_text=extracted_text,
                ticker=ticker,
                hypotheses=hypotheses,
            )
        except Exception:
            logger.exception("Decomposition failed for %s upload", ticker)
            raise HTTPException(
                status_code=500,
                detail="Analysis failed. Please try again.",
            )

        # Chunk text into passages
        chunks = chunk_text(extracted_text)

        # Compute embeddings for each chunk
        passage_data: list[dict] = []
        for chunk in chunks:
            embedding = await generate_embedding(chunk)
            passage_data.append({
                "ticker": ticker,
                "section": "external",
                "subsection": "uploaded",
                "content": chunk,
                "tags": [],
                "weight": 1.0,
                "embedding": embedding,
            })

    # Store in DB (source_db functions from Stream A)
    # This import is deferred because source_db.py is built by Stream A
    try:
        from source_db import create_source, create_view, insert_passages

        pool = await db.get_pool()

        source_row = await create_source(
            pool,
            user_id=user_id,
            guest_id=guest_id,
            ticker=ticker,
            source_name=source_name,
            source_type=source_type,
            document_date=document_date,
            file_name=filename,
            page_count=page_count,
            char_count=len(extracted_text),
        )
        source_id = source_row["id"] if source_row else None
        if not source_id:
            raise HTTPException(
                status_code=503, detail="Database unavailable.",
            )

        await create_view(
            pool,
            source_id=source_id,
            aligned_hypothesis=view.get("aligned_hypothesis"),
            alignment_confidence=view.get("alignment_confidence"),
            direction=view.get("direction"),
            price_target=view.get("price_target"),
            conviction_signals=view.get("conviction_signals"),
            key_evidence=view.get("key_evidence"),
            key_risks=view.get("key_risks"),
            summary=view.get("summary"),
            raw_decomposition=view.get("raw_decomposition"),
        )
        await insert_passages(
            pool,
            source_id=source_id,
            ticker=ticker,
            passages=passage_data,
        )

    except ImportError:
        logger.warning("source_db not available; returning view without persistence")
        source_id = "preview-no-db"
    except HTTPException:
        raise
    except Exception:
        logger.exception("DB storage failed for %s upload", ticker)
        raise HTTPException(
            status_code=500,
            detail="Storage failed. Please try again.",
        )

    elapsed_ms = int((time.time() - start) * 1000)

    return UploadResponse(
        source_id=str(source_id),
        source_name=source_name,
        ticker=ticker,
        view={
            k: v for k, v in view.items()
            if k not in ("raw_decomposition", "model_used")
        },
        passage_count=len(passage_data),
        processing_time_ms=elapsed_ms,
    )


@router.get("/{ticker}")
async def list_sources(
    request: Request,
    ticker: str,
    guest_id: str | None = None,
):
    """Return all sources for a ticker + identity."""
    user_id, guest_id = _get_identity(request, guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization header or guest_id.",
        )

    try:
        from source_db import list_sources as db_list_sources

        pool = await db.get_pool()
        sources = await db_list_sources(
            pool,
            ticker=ticker.upper(),
            user_id=user_id,
            guest_id=guest_id,
        )
        return sources

    except ImportError:
        logger.warning("source_db not available; returning empty list")
        return []
    except Exception:
        logger.exception("Failed to list sources for %s", ticker)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve sources.",
        )


@router.delete("/{source_id}")
async def delete_source(
    request: Request,
    source_id: str,
    guest_id: str | None = None,
):
    """Delete a source by ID. Ownership verified in source_db."""
    user_id, guest_id = _get_identity(request, guest_id)
    if not user_id and not guest_id:
        raise HTTPException(
            status_code=400,
            detail="Provide Authorization header or guest_id.",
        )

    try:
        from source_db import delete_source as db_delete_source

        pool = await db.get_pool()
        deleted = await db_delete_source(
            pool,
            source_id=source_id,
            user_id=user_id,
            guest_id=guest_id,
        )
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail="Source not found or not owned by you.",
            )
        return {"deleted": True, "source_id": source_id}

    except ImportError:
        logger.warning("source_db not available")
        raise HTTPException(status_code=503, detail="Database unavailable.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete source %s", source_id)
        raise HTTPException(
            status_code=500,
            detail="Failed to delete source.",
        )