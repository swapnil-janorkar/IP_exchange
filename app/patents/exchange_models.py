"""
IP Exchange domain models.

Entities owned by the IP Exchange sub-system:
  - Document   : A legal or supporting document attached to a Patent
  - Embedding  : pgvector embedding vector for semantic search on patents/docs
  - Deal       : A deal between an innovator and an organisation over a patent
  - Signature  : Digital signature event recorded for a deal document

Cross-module FK rules
---------------------
* All user / patent FKs reference their respective tables by string name only.
* Never import User or Patent classes here — avoids circular deps.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class DocumentType(str, enum.Enum):
    PATENT_PROOF = "patent_proof"          # proof of authorship/filing
    ASSIGNMENT = "assignment"              # IP assignment agreement
    LICENSE = "license"                    # licensing agreement
    NDA = "nda"                            # non-disclosure agreement
    WORK_PRODUCT = "work_product"          # deliverable from org
    OTHER = "other"


class DealStatus(str, enum.Enum):
    INITIATED = "initiated"        # deal opened by buyer
    NEGOTIATING = "negotiating"    # terms being discussed
    PENDING_SIGNATURE = "pending_signature"  # docs sent for e-sign
    SIGNED = "signed"              # both parties signed
    COMPLETED = "completed"        # funds released / IP transferred
    CANCELLED = "cancelled"        # deal abandoned


class SignatureStatus(str, enum.Enum):
    PENDING = "pending"
    SIGNED = "signed"
    REJECTED = "rejected"


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------


class Document(Base):
    """
    A legal or supporting document.
    Can be attached to a Patent, a Deal, or a WorkReport (via FK).
    At most one of patent_id / deal_id should be set (soft constraint).
    """

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Owner = user who uploaded the doc
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Optional attachments to other entities
    patent_id: Mapped[int | None] = mapped_column(
        ForeignKey("patents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    deal_id: Mapped[int | None] = mapped_column(
        ForeignKey("deals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    doc_type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, name="document_type"),
        nullable=False,
        index=True,
    )

    # Human-readable filename stored in object storage
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Full URL / object-storage key (S3 / GCS / MinIO)
    storage_url: Mapped[str] = mapped_column(String(512), nullable=False)

    # MIME type validated at upload time (PDF, DOCX, PNG …)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # File size in bytes; max 50 MB enforced in Pydantic schema
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Back-reference to signatures for this document
    signatures: Mapped[list["Signature"]] = relationship(
        "Signature", back_populates="document", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------


class Embedding(Base):
    """
    Stores the pgvector embedding for a Patent or Document for semantic search.

    The actual vector is stored as a TEXT column here so the model compiles
    without the pgvector SQLAlchemy extension. Switch to Vector(1536) once
    pgvector is installed and the migration is applied.

    source_type: "patent" | "document"
    source_id  : the primary key in the respective table
    """

    __tablename__ = "embeddings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    source_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )  # "patent" | "document"

    source_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    model_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="text-embedding-3-small",
    )

    # Stored as JSON-serialised list until pgvector extension is enabled
    vector_json: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ---------------------------------------------------------------------------
# Deal
# ---------------------------------------------------------------------------


class Deal(Base):
    """
    A deal between an innovator (seller) and an organisation (buyer) for a Patent.

    price_cents: agreed price in smallest currency unit (paise / cents).
                 Using integer avoids floating-point rounding issues.
    """

    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    patent_id: Mapped[int] = mapped_column(
        ForeignKey("patents.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Innovator (seller)
    seller_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Organisation (buyer)
    buyer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    status: Mapped[DealStatus] = mapped_column(
        Enum(DealStatus, name="deal_status"),
        default=DealStatus.INITIATED,
        nullable=False,
        index=True,
    )

    # Agreed price; null until both parties confirm terms
    price_cents: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # ISO 4217 currency code
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="INR"
    )

    # Admin or system notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Documents attached to this deal
    documents: Mapped[list["Document"]] = relationship(
        "Document",
        primaryjoin="Deal.id == Document.deal_id",
        foreign_keys="[Document.deal_id]",
        lazy="selectin",
        viewonly=True,
    )

    # Signatures for all documents in this deal
    signatures: Mapped[list["Signature"]] = relationship(
        "Signature", back_populates="deal", lazy="selectin"
    )


# ---------------------------------------------------------------------------
# Signature
# ---------------------------------------------------------------------------


class Signature(Base):
    """
    Records a digital signature event by a user on a Document in a Deal.

    signer_id  : the user who signed (or refused)
    signed_at  : timestamp of the actual signing action
    """

    __tablename__ = "signatures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    deal_id: Mapped[int] = mapped_column(
        ForeignKey("deals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    signer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    status: Mapped[SignatureStatus] = mapped_column(
        Enum(SignatureStatus, name="signature_status"),
        default=SignatureStatus.PENDING,
        nullable=False,
    )

    # Cryptographic hash of the signed document at time of signing
    document_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Rejection / decline reason
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    signed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    deal: Mapped["Deal"] = relationship(
        "Deal", back_populates="signatures", lazy="joined", viewonly=True
    )
    document: Mapped["Document"] = relationship(
        "Document", back_populates="signatures", lazy="joined", viewonly=True
    )
