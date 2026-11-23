from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.documents import storage
from app.patents.exchange_models import Deal, Document, DocumentType, Signature, SignatureStatus


async def get_nda_document(db: AsyncSession, deal_id: int) -> Document | None:
    result = await db.execute(
        select(Document)
        .where(
            Document.deal_id == deal_id,
            Document.doc_type == DocumentType.NDA,
        )
        .order_by(Document.created_at.desc())
        .limit(1)
    )
    return result.scalars().first()


async def get_nda_signer_ids(
    db: AsyncSession, deal_id: int, document_id: int
) -> set[int]:
    result = await db.execute(
        select(Signature.signer_id).where(
            Signature.deal_id == deal_id,
            Signature.document_id == document_id,
            Signature.status == SignatureStatus.SIGNED,
        )
    )
    return set(result.scalars().all())


async def has_completed_nda(db: AsyncSession, deal: Deal) -> bool:
    document = await get_nda_document(db, deal.id)
    if document is None:
        return False
    signers = await get_nda_signer_ids(db, deal.id, document.id)
    return {deal.seller_id, deal.buyer_id}.issubset(signers)


def resolve_document_path(storage_url: str) -> Path:
    """Resolve local document keys while preventing paths outside managed storage."""
    project_root = Path(__file__).resolve().parents[2]
    upload_root = storage.UPLOAD_DIR.resolve()

    if storage_url.startswith(("/", "\\")):
        candidate = (project_root / storage_url.lstrip("/\\")).resolve()
    else:
        candidate = (upload_root / storage_url).resolve()

    for root in (upload_root, project_root.resolve()):
        try:
            candidate.relative_to(root)
            return candidate
        except ValueError:
            continue

    raise ValueError("Document path is outside managed storage.")
