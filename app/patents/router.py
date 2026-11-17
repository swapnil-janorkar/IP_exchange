"""
Patents CRUD API.

Ownership rule enforced throughout: a patent can only be edited by
its owner (or an admin), and only while it's in DRAFT or REJECTED
status — once submitted, it's locked until the admin acts on it.
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from sqlalchemy import select, or_
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.patents.models import Patent, PatentStatus
from app.patents.exchange_models import Document, DocumentType
from app.patents.schemas import (
    PatentCreate,
    PatentOut,
    PatentPublicOut,
    PatentSubmitForVerification,
    PatentUpdate,
)
from app.core.validators import validate_patent_document

router = APIRouter()

EDITABLE_STATUSES = {PatentStatus.DRAFT, PatentStatus.REJECTED}

# Directory where proof documents are stored (relative to project root)
_UPLOAD_DIR = Path("documents") / "patents"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def _get_owned_patent(patent_id: int, user: User, db: AsyncSession) -> Patent:
    """Fetch a patent and verify the current user may act on it (owner or admin)."""
    patent = await db.get(Patent, patent_id)
    if patent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patent not found")
    if patent.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your patent")
    return patent


@router.post("", response_model=PatentOut, status_code=status.HTTP_201_CREATED)
async def create_patent(
    body: PatentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    patent = Patent(
        owner_id=user.id,
        title=body.title,
        description=body.description,
        keywords=body.keywords,
        status=PatentStatus.DRAFT,
    )
    db.add(patent)
    await db.commit()
    await db.refresh(patent)
    return patent



@router.get("", response_model=list[PatentPublicOut])
async def browse_listed_patents(
    q: str | None = Query(default=None, min_length=2, max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Patent]:
    """
    Keyword-first patent search for organisations.

    Searches title, description, keywords and AI summary.
    Only LISTED patents are publicly discoverable.
    """

    query = select(Patent).where(
        Patent.status == PatentStatus.LISTED
    )

    if q and q.strip():
        search_term = f"%{q.strip()}%"

        query = query.where(
            or_(
                Patent.title.ilike(search_term),
                Patent.description.ilike(search_term),
                Patent.keywords.ilike(search_term),
                Patent.ai_summary.ilike(search_term),
            )
        )

    query = (
        query
        .order_by(Patent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    result = await db.execute(query)

    return list(result.scalars().all())



@router.get("/mine", response_model=list[PatentOut])
async def list_my_patents(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Patent]:
    """All of the current user's patents, any status — their own dashboard."""
    result = await db.execute(
        select(Patent)
        .where(Patent.owner_id == user.id)
        .order_by(Patent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.get("/{patent_id}", response_model=PatentOut)
async def get_patent(
    patent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    return await _get_owned_patent(patent_id, user, db)


@router.patch("/{patent_id}", response_model=PatentOut)
async def update_patent(
    patent_id: int,
    body: PatentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    patent = await _get_owned_patent(patent_id, user, db)

    if patent.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot edit a patent in '{patent.status.value}' status",
        )

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(patent, field, value)

    await db.commit()
    await db.refresh(patent)
    return patent


@router.post("/{patent_id}/upload-document", response_model=PatentOut)
async def upload_proof_document(
    patent_id: int,
    file: UploadFile = File(
        ...,
        description="Patent proof document — PDF only, maximum 10 MB.",
    ),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    """
    Upload a PDF proof document for a patent (DRAFT or REJECTED status only).
    Multiple calls allowed — each PDF is stored and tracked in the documents table.

    Validation enforced server-side:
      • Format: PDF only (Content-Type must be application/pdf).
      • Size:   Maximum 10 MB.

    The file is saved to ``documents/patents/`` with a UUID-based name to
    prevent collisions. The ``proof_document_url`` on the patent record is
    updated to the latest upload. Additional documents are stored in the
    documents table for full multi-document support.
    """
    patent = await _get_owned_patent(patent_id, user, db)

    if patent.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot upload a document for a patent in '{patent.status.value}' status",
        )

    # --- Read the file content first so we know the real byte count ---
    content: bytes = await file.read()
    content_type: str = file.content_type or ""
    original_filename: str = file.filename or "document.pdf"

    try:
        validate_patent_document(content_type=content_type, size_bytes=len(content))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # --- Persist to disk ---
    safe_name = f"{uuid.uuid4().hex}.pdf"
    dest = _UPLOAD_DIR / safe_name
    dest.write_bytes(content)

    storage_url = f"/documents/patents/{safe_name}"

    # --- Update patent's main proof_document_url (backward compat) ---
    patent.proof_document_url = storage_url

    # --- Also record in the documents table (multi-doc support) ---
    doc = Document(
        owner_id=user.id,
        patent_id=patent.id,
        doc_type=DocumentType.PATENT_PROOF,
        file_name=original_filename,
        storage_url=storage_url,
        mime_type="application/pdf",
        size_bytes=len(content),
    )
    db.add(doc)

    await db.commit()
    await db.refresh(patent)
    return patent


@router.get("/{patent_id}/documents")
async def list_patent_documents(
    patent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    List all documents attached to a patent (owner or admin only).
    Returns all PDF proof documents uploaded for this patent.
    """
    # Check ownership/admin access
    await _get_owned_patent(patent_id, user, db)

    result = await db.execute(
        select(Document)
        .where(Document.patent_id == patent_id)
        .order_by(Document.created_at.asc())
    )
    docs = result.scalars().all()

    return [
        {
            "id": d.id,
            "file_name": d.file_name,
            "storage_url": d.storage_url,
            "mime_type": d.mime_type,
            "size_bytes": d.size_bytes,
            "doc_type": d.doc_type.value,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.delete("/{patent_id}/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patent_document(
    patent_id: int,
    doc_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a specific document from a patent (DRAFT or REJECTED only)."""
    patent = await _get_owned_patent(patent_id, user, db)

    if patent.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete a document while patent is in '{patent.status.value}' status",
        )

    doc = await db.get(Document, doc_id)
    if doc is None or doc.patent_id != patent_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    # Remove from disk if it exists
    if doc.storage_url:
        file_path = Path(".") / doc.storage_url.lstrip("/")
        file_path.unlink(missing_ok=True)

    # If this was the main proof_document_url, clear it or set to previous doc
    await db.delete(doc)
    await db.flush()

    # Recalculate proof_document_url from remaining docs
    remaining = await db.execute(
        select(Document)
        .where(Document.patent_id == patent_id)
        .order_by(Document.created_at.desc())
    )
    latest = remaining.scalars().first()
    patent.proof_document_url = latest.storage_url if latest else None

    await db.commit()


@router.post("/{patent_id}/submit", response_model=PatentOut)
async def submit_for_verification(
    patent_id: int,
    body: PatentSubmitForVerification,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    """DRAFT/REJECTED -> PENDING_VERIFICATION. Verification track picks it up from here.

    If body.proof_document_url is provided it updates the stored URL.
    If omitted the patent's existing proof_document_url (from upload-document)
    is used. At least one must be present — otherwise the submit is blocked.
    """
    patent = await _get_owned_patent(patent_id, user, db)

    if patent.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot submit a patent in '{patent.status.value}' status",
        )

    # If a URL was supplied use it; otherwise keep the existing one.
    if body.proof_document_url:
        patent.proof_document_url = body.proof_document_url

    # Require at least one proof document on file.
    if not patent.proof_document_url:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A proof document is required. Upload one first via POST /patents/{id}/upload-document.",
        )

    patent.status = PatentStatus.PENDING_VERIFICATION
    patent.rejection_reason = None

    await db.commit()
    await db.refresh(patent)
    return patent



@router.delete("/{patent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patent(
    patent_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    patent = await _get_owned_patent(patent_id, user, db)
    if patent.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete a patent in '{patent.status.value}' status",
        )
    await db.delete(patent)
    await db.commit()
