"""
AI service — AI summary generation and embedding creation.

On patent approval:
  1. generate_patent_summary()  → stores ai_summary on the Patent
  2. generate_and_store_embedding() → stores vector in the embeddings table

Both are designed to be called after-commit so they never block the
approval transaction. They gracefully degrade (log + skip) if no API
key is configured.
"""

import json
import logging
from typing import TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

if TYPE_CHECKING:
    from app.patents.models import Patent

logger = logging.getLogger(__name__)


def _local_summary(patent: "Patent") -> str:
    """
    Generate a professional patent summary locally without any external API.

    Uses keyword extraction, description analysis, and structured templates to
    produce a clean 2-3 sentence summary suitable for marketplace listings.
    This runs instantly and requires no API credits.
    """
    import re

    title: str = patent.title or ""
    description: str = patent.description or ""
    keywords: str = patent.keywords or ""

    # Clean up the description
    desc_clean = re.sub(r"\s+", " ", description).strip()

    # Extract first meaningful sentence(s) from description (up to ~200 chars)
    sentences = re.split(r"(?<=[.!?])\s+", desc_clean)
    lead = ""
    for s in sentences:
        lead += (" " + s).lstrip() if lead else s
        if len(lead) >= 120:
            break
    if not lead:
        lead = desc_clean[:200]
    if len(lead) > 220:
        lead = lead[:220].rsplit(" ", 1)[0] + "..."

    # Build a keyword phrase (up to 4 keywords)
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()][:4]
    kw_phrase = ", ".join(kw_list) if kw_list else ""

    # Compose summary from parts
    parts = [f"**{title}** is an innovative technology"]
    if kw_phrase:
        parts[0] += f" in the domains of {kw_phrase}"
    parts[0] += "."

    if lead:
        parts.append(lead if lead.endswith(".") else lead + ".")

    parts.append(
        "This patent represents a commercially valuable intellectual property asset "
        "with strong licensing and acquisition potential for industry players."
    )

    return " ".join(parts)


async def generate_patent_summary(patent: "Patent", db: AsyncSession) -> str | None:
    """
    Generate a concise AI summary for the patent and persist it.

    Uses OpenAI if openai_api_key is set, falls back to Anthropic if
    anthropic_api_key is set, otherwise returns None.

    Returns the generated summary string, or None if no AI provider is configured.
    """
    prompt = (
        f"Write a concise 2-3 sentence professional summary of this patent for a marketplace listing.\n\n"
        f"Title: {patent.title}\n\n"
        f"Description: {patent.description}\n\n"
        f"Keywords: {patent.keywords}\n\n"
        f"Focus on the innovation, its value, and potential applications. Be clear and professional."
    )

    summary: str | None = None

    if settings.openai_api_key:
        try:
            import openai  # type: ignore
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are an expert IP marketplace analyst. Write concise, professional patent summaries."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=200,
                temperature=0.4,
            )
            summary = response.choices[0].message.content.strip()
            logger.info("OpenAI summary generated for patent #%d", patent.id)
        except Exception as exc:
            logger.warning(
                "OpenAI summary generation failed for patent #%d: %s — using local summary.",
                patent.id, exc,
            )
            summary = _local_summary(patent)

    elif settings.anthropic_api_key:
        try:
            import anthropic  # type: ignore
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            response = await client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            summary = response.content[0].text.strip()
            logger.info("Anthropic summary generated for patent #%d", patent.id)
        except Exception as exc:
            logger.warning(
                "Anthropic summary generation failed for patent #%d: %s — using local summary.",
                patent.id, exc,
            )
            summary = _local_summary(patent)

    else:
        logger.info(
            "No AI API key configured — using local summary for patent #%d.",
            patent.id,
        )
        summary = _local_summary(patent)

    if summary:
        patent.ai_summary = summary
        await db.commit()
        await db.refresh(patent)

    return summary


async def generate_and_store_embedding(patent: "Patent", db: AsyncSession) -> bool:
    """
    Generate a text embedding for the patent and store it in the embeddings table.

    Uses OpenAI text-embedding-3-small. If not configured, stores a
    placeholder zero-vector so the row still exists for future back-fill.

    Returns True if a real embedding was stored, False otherwise.
    """
    from app.patents.exchange_models import Embedding  # local import to avoid circular

    text = f"{patent.title}\n\n{patent.description}\n\nKeywords: {patent.keywords}"
    if patent.ai_summary:
        text += f"\n\nSummary: {patent.ai_summary}"

    vector: list[float] | None = None
    model_name = "text-embedding-3-small"
    real_embedding = False

    if settings.openai_api_key:
        try:
            import openai  # type: ignore
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.embeddings.create(
                model=model_name,
                input=text,
            )
            vector = response.data[0].embedding
            real_embedding = True
            logger.info("Embedding generated for patent #%d (%d dims)", patent.id, len(vector))
        except Exception as exc:
            logger.warning("Embedding generation failed for patent #%d: %s", patent.id, exc)

    if vector is None:
        # Store a 1536-dim zero vector as placeholder (matches text-embedding-3-small dims)
        vector = [0.0] * 1536
        model_name = "placeholder-zero-1536"
        logger.info("Storing placeholder zero-vector for patent #%d", patent.id)

    # Upsert: remove any existing embedding for this patent
    from sqlalchemy import delete
    await db.execute(
        delete(Embedding).where(
            Embedding.source_type == "patent",
            Embedding.source_id == patent.id,
        )
    )

    embedding = Embedding(
        source_type="patent",
        source_id=patent.id,
        model_name=model_name,
        vector_json=json.dumps(vector),
    )
    db.add(embedding)
    await db.commit()

    return real_embedding
