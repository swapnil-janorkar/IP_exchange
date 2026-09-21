"""
Patent model.

Owned by: Patents track.

`owner_id` references `users.id`, a table owned by the Auth track.
We deliberately do NOT import the User class here — that would create
a circular import between the two modules being built in parallel.
A relationship() back to User is added at integration time, once
app.auth.models.User exists (see the TODO near the bottom of this
file) — until then, owner_id alone is enough for CRUD and ownership
checks.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class PatentStatus(str, enum.Enum):
    """
    The single source of truth for patent lifecycle state.
    Auth/Verification track reads and writes this same enum —
    don't redefine it elsewhere.
    """

    DRAFT = "draft"                            # owner is still editing, not submitted
    PENDING_VERIFICATION = "pending_verification"  # submitted, waiting on admin review
    VERIFIED = "verified"                       # admin approved, not yet publicly listed
    LISTED = "listed"                           # publicly searchable
    SOLD = "sold"                                # deal closed, removed from search
    REJECTED = "rejected"                        # admin rejected, owner can edit and resubmit


class Patent(Base):
    __tablename__ = "patents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK to users.id (Auth track's table). No `User` import — see module docstring.
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[str] = mapped_column(String(500), nullable=False, default="")

    status: Mapped[PatentStatus] = mapped_column(
        Enum(PatentStatus, name="patent_status"),
        default=PatentStatus.DRAFT,
        nullable=False,
        index=True,
    )

    # Set by the AI module in Phase 5 — nullable until then.
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Set by the Verification track when they reject a submission.
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    proof_document_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # TODO (integration step, once app.auth.models.User exists):
    #   owner: Mapped["User"] = relationship("User", lazy="joined", viewonly=True)
    # relationship() needs a real mapped class, not just a table, so this
    # can't be added until the Auth track's User model is merged. Nothing
    # in the Patents module currently needs `.owner` — owner_id is enough.