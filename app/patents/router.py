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

from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.patents.models import Patent, PatentStatus
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
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Patent]:
    """
    Public browse for organisations — only ever returns LISTED patents,
    and PatentPublicOut strips owner_id/proof_document_url/rejection_reason.
    This is the placeholder for real search (Phase 3/6 add keyword and
    vector search) — same status filter, same response shape.
    """
    result = await db.execute(
        select(Patent)
        .where(Patent.status == PatentStatus.LISTED)
        .order_by(Patent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
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

    Validation enforced server-side:
      • Format: PDF only (Content-Type must be application/pdf).
      • Size:   Maximum 10 MB.

    The file is saved to ``documents/patents/`` with a UUID-based name to
    prevent collisions. The ``proof_document_url`` on the patent record is
    updated automatically — no separate submit call needed just for the URL.

    After uploading, call ``POST /patents/{id}/submit`` (with the returned
    ``proof_document_url``) to move the patent to PENDING_VERIFICATION.
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

    try:
        validate_patent_document(content_type=content_type, size_bytes=len(content))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # --- Persist to disk ---
    safe_name = f"{uuid.uuid4().hex}.pdf"
    dest = _UPLOAD_DIR / safe_name
    dest.write_bytes(content)

    # Store a relative URL path (swap for a real CDN/storage URL in production)
    patent.proof_document_url = f"/documents/patents/{safe_name}"

    await db.commit()
    await db.refresh(patent)
    return patent


@router.post("/{patent_id}/submit", response_model=PatentOut)
async def submit_for_verification(
    patent_id: int,
    body: PatentSubmitForVerification,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    """DRAFT/REJECTED -> PENDING_VERIFICATION. Verification track picks it up from here.

    ``body.proof_document_url`` must be the URL of a PDF file.
    Use ``POST /patents/{id}/upload-document`` to upload the file directly —
    that endpoint validates format and size before saving.
    """
    patent = await _get_owned_patent(patent_id, user, db)

    if patent.status not in EDITABLE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot submit a patent in '{patent.status.value}' status",
        )

    patent.proof_document_url = body.proof_document_url
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