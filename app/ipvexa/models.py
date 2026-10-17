"""
IPVEXA domain models.

Entities owned by the IP Verification Exchange & Assistance (IPVEXA) sub-system:
  - IPRRecord      : An intellectual property rights record (idea / request)
  - Service        : A service offered by an organisation (e.g. patent filing)
  - ServiceRequest : An innovator requests a Service
  - Job            : Internal task created to fulfil a ServiceRequest
  - WorkReport     : Final deliverable attached to a closed Job

Cross-module FK rules
---------------------
* owner_id / assigned_to / etc. all reference users.id without importing User.
* Use lazy="joined" + viewonly=True relationships only if you need them for reads;
  never write through them.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class IPRRecordStatus(str, enum.Enum):
    IDEA = "idea"                          # just submitted
    UNDER_REVIEW = "under_review"          # IPVEXA team reviewing
    ACCEPTED = "accepted"                  # matched to a Service
    REJECTED = "rejected"                  # cannot be processed
    COMPLETED = "completed"                # all work done


class ServiceCategory(str, enum.Enum):
    PATENT_FILING = "patent_filing"
    TRADEMARK = "trademark"
    COPYRIGHT = "copyright"
    TRADE_SECRET = "trade_secret"
    LICENSING = "licensing"
    CONSULTING = "consulting"
    OTHER = "other"


class ServiceRequestStatus(str, enum.Enum):
    PENDING = "pending"          # submitted, not yet accepted
    ACCEPTED = "accepted"        # org accepted, creating Job
    IN_PROGRESS = "in_progress"  # Job underway
    COMPLETED = "completed"      # Work report delivered
    CANCELLED = "cancelled"      # cancelled by either party


class JobStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    UNDER_REVIEW = "under_review"
    CLOSED = "closed"
    CANCELLED = "cancelled"


# ---------------------------------------------------------------------------
# IPR Record  (Idea / Request)
# ---------------------------------------------------------------------------


class IPRRecord(Base):
    """
    An idea or IP-rights request submitted by an innovator.
    This is the entry-point for the IPVEXA workflow.
    """

    __tablename__ = "ipr_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK to users.id (Auth track) — no direct import of User.
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # E.g. "patent", "trademark" — free-form tag for quick routing.
    ip_type: Mapped[str] = mapped_column(String(100), nullable=False, default="patent")

    status: Mapped[IPRRecordStatus] = mapped_column(
        Enum(IPRRecordStatus, name="ipr_record_status"),
        default=IPRRecordStatus.IDEA,
        nullable=False,
        index=True,
    )

    # Optional admin note / feedback
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships (read-only)
    service_requests: Mapped[list["ServiceRequest"]] = relationship(
        "ServiceRequest", back_populates="ipr_record", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class Service(Base):
    """
    A service offered by an organisation (e.g. "Patent Filing – EU").
    Only organisations (UserRole.ORGANISATION) can create Services.
    """

    __tablename__ = "services"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # FK to users.id — the org that owns this listing
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    category: Mapped[ServiceCategory] = mapped_column(
        Enum(ServiceCategory, name="service_category"),
        nullable=False,
        index=True,
    )

    # Price in cents/paise (avoid floats for money)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    service_requests: Mapped[list["ServiceRequest"]] = relationship(
        "ServiceRequest", back_populates="service", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# Service Request
# ---------------------------------------------------------------------------


class ServiceRequest(Base):
    """
    An innovator requesting a specific Service for their IPR Record.
    Links IPRRecord → Service; triggers Job creation on acceptance.
    """

    __tablename__ = "service_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    requester_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    ipr_record_id: Mapped[int] = mapped_column(
        ForeignKey("ipr_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    status: Mapped[ServiceRequestStatus] = mapped_column(
        Enum(ServiceRequestStatus, name="service_request_status"),
        default=ServiceRequestStatus.PENDING,
        nullable=False,
        index=True,
    )

    # Optional message from the innovator
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    ipr_record: Mapped["IPRRecord"] = relationship(
        "IPRRecord", back_populates="service_requests", lazy="joined", viewonly=True
    )
    service: Mapped["Service"] = relationship(
        "Service", back_populates="service_requests", lazy="joined", viewonly=True
    )
    jobs: Mapped[list["Job"]] = relationship(
        "Job", back_populates="service_request", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# Job
# ---------------------------------------------------------------------------


class Job(Base):
    """
    Internal work unit created by an organisation when they accept a ServiceRequest.
    One ServiceRequest can have at most one active Job.
    """

    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    service_request_id: Mapped[int] = mapped_column(
        ForeignKey("service_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,   # 1-to-1 with ServiceRequest
    )

    # The org user who is handling this job
    assigned_to: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )

    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status"),
        default=JobStatus.OPEN,
        nullable=False,
        index=True,
    )

    # Internal notes / progress log
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    service_request: Mapped["ServiceRequest"] = relationship(
        "ServiceRequest", back_populates="jobs", lazy="joined", viewonly=True
    )
    work_reports: Mapped[list["WorkReport"]] = relationship(
        "WorkReport", back_populates="job", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# Work Report
# ---------------------------------------------------------------------------


class WorkReport(Base):
    """
    Final deliverable submitted by the org when a Job is closed.
    Contains a reference to the uploaded document (stored in object storage).
    """

    __tablename__ = "work_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # The org user who authored this report
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    # URL to the actual document (PDF/DOCX in object storage)
    document_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # MIME type of uploaded file for validation
    document_mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # File size in bytes (used for validation, max 50 MB enforced in schema)
    document_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    job: Mapped["Job"] = relationship(
        "Job", back_populates="work_reports", lazy="joined", viewonly=True
    )
