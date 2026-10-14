"""
Admin verification workflow.

Status flow this module owns:
    PENDING_VERIFICATION --approve--> VERIFIED --list--> LISTED
    PENDING_VERIFICATION --reject-->  REJECTED  (owner can edit + resubmit)

Patents track owns the model and the owner-facing transitions (submit,
edit); this module only ever moves a patent *forward* from
PENDING_VERIFICATION, and only for admins.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.database import get_db
from app.patents.models import Patent, PatentStatus
from app.patents.schemas import PatentOut
from app.verification.dependencies import require_admin
from app.verification.schemas import RejectRequest

router = APIRouter()


async def _get_patent_or_404(patent_id: int, db: AsyncSession) -> Patent:
    patent = await db.get(Patent, patent_id)
    if patent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patent not found")
    return patent


def _require_status(patent: Patent, expected: PatentStatus) -> None:
    if patent.status != expected:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Expected status '{expected.value}', patent is '{patent.status.value}'",
        )


@router.get("/queue", response_model=list[PatentOut])
async def verification_queue(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[Patent]:
    """Patents awaiting review, oldest first — a FIFO queue for admins."""
    result = await db.execute(
        select(Patent)
        .where(Patent.status == PatentStatus.PENDING_VERIFICATION)
        .order_by(Patent.created_at.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.post("/{patent_id}/approve", response_model=PatentOut)
async def approve_patent(
    patent_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    patent = await _get_patent_or_404(patent_id, db)
    _require_status(patent, PatentStatus.PENDING_VERIFICATION)

    patent.status = PatentStatus.VERIFIED
    patent.rejection_reason = None

    await db.commit()
    await db.refresh(patent)
    return patent


@router.post("/{patent_id}/reject", response_model=PatentOut)
async def reject_patent(
    patent_id: int,
    body: RejectRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    patent = await _get_patent_or_404(patent_id, db)
    _require_status(patent, PatentStatus.PENDING_VERIFICATION)

    patent.status = PatentStatus.REJECTED
    patent.rejection_reason = body.reason

    await db.commit()
    await db.refresh(patent)
    return patent


@router.post("/{patent_id}/list", response_model=PatentOut)
async def list_patent(
    patent_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Patent:
    """VERIFIED -> LISTED. A separate step from approval, so admins can
    verify authenticity first and decide when to actually publish."""
    patent = await _get_patent_or_404(patent_id, db)
    _require_status(patent, PatentStatus.VERIFIED)

    patent.status = PatentStatus.LISTED

    await db.commit()
    await db.refresh(patent)
    return patent
