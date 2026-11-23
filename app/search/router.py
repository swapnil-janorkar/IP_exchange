"""
Semantic search router.

POST /search/semantic
  - Embeds the query with OpenAI text-embedding-3-small
  - Loads all patent embeddings from the DB (stored as JSON vectors)
  - Computes cosine similarity in Python (pgvector-equivalent logic)
  - Returns top-k LISTED patents sorted by similarity score

Falls back gracefully to keyword search if OpenAI is not configured.
"""

from __future__ import annotations

import json
import logging
import math
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.config import settings
from app.core.database import get_db
from app.patents.exchange_models import Embedding
from app.patents.models import Patent, PatentStatus
from app.patents.schemas import PatentPublicOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


# ─── Schemas ──────────────────────────────────────────────────────────────────


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500, description="Natural-language search query")
    top_k: int = Field(default=10, ge=1, le=50, description="Number of results to return")


class SemanticResult(BaseModel):
    patent: PatentPublicOut
    score: float = Field(..., description="Cosine similarity score (0–1)")
    search_type: str = Field(..., description="'semantic' | 'keyword_fallback'")


# ─── Cosine similarity (pure Python — pgvector equivalent) ────────────────────


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def _embed_query(query: str) -> list[float] | None:
    """Embed a query string with OpenAI. Returns None if not configured."""
    if not settings.openai_api_key:
        return None
    try:
        import openai  # type: ignore
        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=query,
        )
        return response.data[0].embedding
    except Exception as exc:
        logger.warning("Failed to embed query '%s': %s", query[:50], exc)
        return None


# ─── Endpoint ─────────────────────────────────────────────────────────────────


@router.post("/semantic", response_model=list[SemanticResult])
async def semantic_search(
    body: SemanticSearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SemanticResult]:
    """
    Semantic patent search using cosine similarity over OpenAI embeddings.

    If the OpenAI API key is not configured, falls back to SQL ILIKE keyword
    search and sets search_type='keyword_fallback' on each result.

    Only LISTED patents are returned.
    """

    # 1. Try to embed the query
    query_vector = await _embed_query(body.query)

    # ── Semantic path ──────────────────────────────────────────────────────
    if query_vector is not None:
        # Load all patent embeddings (not placeholder zero-vectors)
        emb_result = await db.execute(
            select(Embedding).where(
                Embedding.source_type == "patent",
                Embedding.model_name != "placeholder-zero-1536",
            )
        )
        embeddings: list[Embedding] = list(emb_result.scalars().all())

        if not embeddings:
            logger.info("No real embeddings found — falling back to keyword search")
            return await _keyword_fallback(body.query, body.top_k, db)

        # Score each embedding
        scored: list[tuple[int, float]] = []
        for emb in embeddings:
            try:
                vec: list[float] = json.loads(emb.vector_json)
                score = _cosine_similarity(query_vector, vec)
                scored.append((emb.source_id, score))
            except Exception:
                continue

        # Sort by score descending, take top_k
        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[: body.top_k]

        if not top:
            return []

        # Fetch the actual patent rows in order
        patent_ids = [pid for pid, _ in top]
        score_map = {pid: score for pid, score in top}

        patent_result = await db.execute(
            select(Patent).where(
                Patent.id.in_(patent_ids),
                Patent.status == PatentStatus.LISTED,
            )
        )
        patents_by_id = {p.id: p for p in patent_result.scalars().all()}

        # Build results preserving similarity order, only LISTED patents
        results: list[SemanticResult] = []
        for pid in patent_ids:
            patent = patents_by_id.get(pid)
            if patent is None:
                continue
            results.append(
                SemanticResult(
                    patent=PatentPublicOut.model_validate(patent),
                    score=round(score_map[pid], 4),
                    search_type="semantic",
                )
            )
        return results

    # ── Keyword fallback ───────────────────────────────────────────────────
    return await _keyword_fallback(body.query, body.top_k, db)


async def _keyword_fallback(query: str, top_k: int, db: AsyncSession) -> list[SemanticResult]:
    """ILIKE keyword search when embeddings are unavailable."""
    from sqlalchemy import or_

    term = f"%{query.strip()}%"
    result = await db.execute(
        select(Patent)
        .where(
            Patent.status == PatentStatus.LISTED,
            or_(
                Patent.title.ilike(term),
                Patent.description.ilike(term),
                Patent.keywords.ilike(term),
                Patent.ai_summary.ilike(term),
            ),
        )
        .order_by(Patent.created_at.desc())
        .limit(top_k)
    )
    patents = result.scalars().all()
    return [
        SemanticResult(
            patent=PatentPublicOut.model_validate(p),
            score=1.0,
            search_type="keyword_fallback",
        )
        for p in patents
    ]


# ─── Public detail endpoint ────────────────────────────────────────────────────


@router.get("/patents/{patent_id}", response_model=PatentPublicOut)
async def get_public_patent(
    patent_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Patent:
    """
    Fetch a single LISTED patent by ID for the detail page.
    Returns full public fields including ai_summary.
    """
    patent = await db.get(Patent, patent_id)
    if patent is None or patent.status != PatentStatus.LISTED:
        from fastapi import HTTPException
        raise HTTPException(404, "Patent not found or not listed")
    return patent
