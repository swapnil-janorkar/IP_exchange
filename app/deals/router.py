from datetime import datetime, timezone
import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User, UserRole
from app.core.audit_models import AuditLog
from app.core.database import get_db
from app.deals.service import (
    get_nda_document,
    get_nda_signer_ids,
    has_completed_nda,
    resolve_document_path,
)
from app.patents.exchange_models import (
    Deal,
    DealStatus,
    Document,
    DocumentType,
    Signature,
    SignatureStatus,
)
from app.patents.exchange_schemas import (
    DealCreate,
    DealDetailOut,
    DealDocumentOut,
    DealSummaryOut,
)
from app.patents.models import Patent, PatentStatus

router = APIRouter(prefix="/deals", tags=["deals"])


async def _get_authorized_deal(
    deal_id: int, user: User, db: AsyncSession
) -> Deal:
    deal = await db.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deal not found.")
    if user.role != UserRole.ADMIN and user.id not in {
        deal.seller_id,
        deal.buyer_id,
    }:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot access this deal.")
    return deal


async def _deal_summary(
    deal: Deal, db: AsyncSession
) -> dict:
    patent = await db.get(Patent, deal.patent_id)
    nda = await get_nda_document(db, deal.id)
    signer_ids = (
        await get_nda_signer_ids(db, deal.id, nda.id) if nda is not None else set()
    )
    return {
        "id": deal.id,
        "patent_id": deal.patent_id,
        "seller_id": deal.seller_id,
        "buyer_id": deal.buyer_id,
        "status": deal.status,
        "price_cents": deal.price_cents,
        "currency": deal.currency,
        "notes": deal.notes,
        "created_at": deal.created_at,
        "updated_at": deal.updated_at,
        "patent_title": patent.title if patent is not None else "Unknown patent",
        "nda_document_id": nda.id if nda is not None else None,
        "nda_signed_by": sorted(signer_ids),
        "nda_complete": {deal.seller_id, deal.buyer_id}.issubset(signer_ids),
    }


def _document_metadata(document: Document, deal_id: int) -> dict:
    return {
        "id": document.id,
        "file_name": document.file_name,
        "doc_type": document.doc_type,
        "mime_type": document.mime_type,
        "size_bytes": document.size_bytes,
        "created_at": document.created_at,
        "download_url": f"/deals/{deal_id}/documents/{document.id}/download",
    }


@router.post("", response_model=DealSummaryOut, status_code=status.HTTP_201_CREATED)
async def express_interest(
    body: DealCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if user.role != UserRole.ORGANISATION:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only organisation accounts can express interest in patents.",
        )

    patent = await db.get(Patent, body.patent_id)
    if patent is None or patent.status != PatentStatus.LISTED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listed patent not found.")
    if patent.owner_id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "You cannot express interest in your own patent.",
        )
    if patent.owner.role != UserRole.INNOVATOR:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The listed patent owner must be an innovator to create a deal.",
        )

    existing_result = await db.execute(
        select(Deal).where(
            Deal.patent_id == patent.id,
            Deal.buyer_id == user.id,
            Deal.status != DealStatus.CANCELLED,
        )
    )
    existing_deal = existing_result.scalars().first()
    if existing_deal is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You already have an active deal for this patent.",
        )

    deal = Deal(
        patent_id=patent.id,
        seller_id=patent.owner_id,
        buyer_id=user.id,
        status=DealStatus.INITIATED,
        price_cents=body.price_cents,
        currency=body.currency,
        notes=body.notes,
    )
    db.add(deal)
    await db.flush()
    db.add(
        AuditLog(
            actor_id=user.id,
            resource_type="deal",
            resource_id=deal.id,
            action="express_interest",
            outcome="success",
            detail=f"Organisation expressed interest in patent {patent.id}.",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    await db.commit()
    await db.refresh(deal)
    return await _deal_summary(deal, db)


@router.get("/mine", response_model=list[DealSummaryOut])
async def list_my_deals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    query = select(Deal).order_by(Deal.updated_at.desc())
    if user.role != UserRole.ADMIN:
        query = query.where(
            or_(Deal.seller_id == user.id, Deal.buyer_id == user.id)
        )
    result = await db.execute(query)
    return [await _deal_summary(deal, db) for deal in result.scalars().all()]


@router.get("/{deal_id}", response_model=DealDetailOut)
async def get_deal(
    deal_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    deal = await _get_authorized_deal(deal_id, user, db)
    summary = await _deal_summary(deal, db)
    nda = await get_nda_document(db, deal.id)
    summary["nda_document"] = (
        _document_metadata(nda, deal.id) if nda is not None else None
    )
    return summary


@router.post("/{deal_id}/nda/sign", response_model=DealDetailOut)
async def sign_nda(
    deal_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    deal = await _get_authorized_deal(deal_id, user, db)
    if user.id not in {deal.seller_id, deal.buyer_id}:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only deal parties can sign the NDA."
        )
    if deal.status == DealStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "This deal has been cancelled.")

    nda = await get_nda_document(db, deal.id)
    if nda is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The patent owner must upload an NDA before it can be signed.",
        )

    path = resolve_document_path(nda.storage_url)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "NDA document is unavailable.")
    document_hash = hashlib.sha256(path.read_bytes()).hexdigest()

    existing_result = await db.execute(
        select(Signature).where(
            Signature.deal_id == deal.id,
            Signature.document_id == nda.id,
            Signature.signer_id == user.id,
        )
    )
    existing_signature = existing_result.scalars().first()
    if existing_signature is not None:
        if existing_signature.status == SignatureStatus.SIGNED:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "You have already signed this NDA."
            )
        existing_signature.status = SignatureStatus.SIGNED
        existing_signature.document_hash = document_hash
        existing_signature.rejection_reason = None
        existing_signature.signed_at = datetime.now(timezone.utc)
    else:
        db.add(
            Signature(
                deal_id=deal.id,
                document_id=nda.id,
                signer_id=user.id,
                status=SignatureStatus.SIGNED,
                document_hash=document_hash,
                signed_at=datetime.now(timezone.utc),
            )
        )

    await db.flush()
    signer_ids = await get_nda_signer_ids(db, deal.id, nda.id)
    if {deal.seller_id, deal.buyer_id}.issubset(signer_ids):
        deal.status = DealStatus.NEGOTIATING

    db.add(
        AuditLog(
            actor_id=user.id,
            resource_type="deal",
            resource_id=deal.id,
            action="sign_nda",
            outcome="success",
            detail=f"Signed NDA document {nda.id}; SHA-256 {document_hash}.",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    await db.commit()
    await db.refresh(deal)
    summary = await _deal_summary(deal, db)
    summary["nda_document"] = _document_metadata(nda, deal.id)
    return summary


@router.get("/{deal_id}/documents", response_model=list[DealDocumentOut])
async def list_deal_documents(
    deal_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    deal = await _get_authorized_deal(deal_id, user, db)
    nda = await get_nda_document(db, deal.id)
    if nda is None:
        return []

    if await has_completed_nda(db, deal) and deal.status != DealStatus.CANCELLED:
        query = select(Document).where(
            or_(Document.deal_id == deal.id, Document.patent_id == deal.patent_id)
        )
    else:
        query = select(Document).where(
            Document.deal_id == deal.id,
            Document.doc_type == DocumentType.NDA,
        )

    result = await db.execute(query.order_by(Document.created_at.asc()))
    return [_document_metadata(doc, deal.id) for doc in result.scalars().all()]


@router.get("/{deal_id}/documents/{document_id}/download")
async def download_deal_document(
    deal_id: int,
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    deal = await _get_authorized_deal(deal_id, user, db)
    document = await db.get(Document, document_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")

    is_deal_nda = (
        document.deal_id == deal.id and document.doc_type == DocumentType.NDA
    )
    is_attached_to_deal = (
        document.deal_id == deal.id or document.patent_id == deal.patent_id
    )
    if not is_attached_to_deal:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
    if not is_deal_nda and (
        deal.status == DealStatus.CANCELLED
        or not await has_completed_nda(db, deal)
    ):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Both parties must sign the NDA before documents are shared.",
        )

    path = resolve_document_path(document.storage_url)
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document is unavailable.")
    return FileResponse(
        path,
        media_type=document.mime_type,
        filename=document.file_name,
    )
