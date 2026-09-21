"""
Patents CRUD API.

Ownership rule enforced throughout: a patent can only be edited by
its owner (or an admin), and only while it's in DRAFT or REJECTED
status — once submitted, it's locked until the admin acts on it.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.patents.dependencies_stub import FakeUser, get_current_user_stub as get_current_user
from app.patents.models import Patent, PatentStatus
from app.patents.schemas import (
    PatentCreate,
    PatentOut,
    PatentPublicOut,
    PatentSubmitForVerification,
    PatentUpdate,
)

router = APIRouter()

EDITABLE_STATUSES = {PatentStatus.DRAFT, PatentStatus.REJECTED}


async def _get_owned_patent(patent_id: int, user: FakeUser, db: AsyncSession) -> Patent:
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
    user: FakeUser = Depends(get_current_user),
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
    user: FakeUser = Depends(get_current_user),
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
    user: FakeUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    return await _get_owned_patent(patent_id, user, db)


@router.patch("/{patent_id}", response_model=PatentOut)
async def update_patent(
    patent_id: int,
    body: PatentUpdate,
    user: FakeUser = Depends(get_current_user),
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


@router.post("/{patent_id}/submit", response_model=PatentOut)
async def submit_for_verification(
    patent_id: int,
    body: PatentSubmitForVerification,
    user: FakeUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    """DRAFT/REJECTED -> PENDING_VERIFICATION. Verification track picks it up from here."""
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
    user: FakeUser = Depends(get_current_user),
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