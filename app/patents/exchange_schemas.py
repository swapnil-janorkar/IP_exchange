"""
Pydantic request/response schemas for IP Exchange entities.

Covers: Document, Deal, Signature uploads/status updates.
Validation layer (MIME, size, currency, URL) applied at schema level.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import (
    MAX_DOCUMENT_SIZE_BYTES,
    validate_currency,
    validate_mime_type,
    validate_url,
)
from app.patents.exchange_models import (
    DealStatus,
    DocumentType,
    SignatureStatus,
)


# ---------------------------------------------------------------------------
# Document schemas
# ---------------------------------------------------------------------------


class DocumentCreate(BaseModel):
    """Body for uploading a new document (URL already stored in object storage)."""

    file_name: str = Field(min_length=1, max_length=255)
    storage_url: str = Field(max_length=512)
    mime_type: str = Field(max_length=100)
    size_bytes: int = Field(gt=0, le=MAX_DOCUMENT_SIZE_BYTES)
    doc_type: DocumentType

    patent_id: int | None = None
    deal_id: int | None = None

    @field_validator("storage_url")
    @classmethod
    def _validate_url(cls, v: str) -> str:
        return validate_url(v)

    @field_validator("mime_type")
    @classmethod
    def _validate_mime(cls, v: str) -> str:
        return validate_mime_type(v)


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    patent_id: int | None
    deal_id: int | None
    doc_type: DocumentType
    file_name: str
    storage_url: str
    mime_type: str
    size_bytes: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Deal schemas
# ---------------------------------------------------------------------------


class DealCreate(BaseModel):
    patent_id: int
    # buyer_id is taken from the authenticated user's id — not in request body.
    price_cents: int | None = Field(default=None, ge=0)
    currency: str = Field(default="INR", max_length=3)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, v: str) -> str:
        return validate_currency(v)


class DealUpdate(BaseModel):
    status: DealStatus | None = None
    price_cents: int | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=3)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, v: str | None) -> str | None:
        return validate_currency(v) if v else v


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patent_id: int
    seller_id: int
    buyer_id: int
    status: DealStatus
    price_cents: int | None
    currency: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Signature schemas
# ---------------------------------------------------------------------------


class SignatureCreate(BaseModel):
    deal_id: int
    document_id: int
    # signer_id comes from authenticated user; not in request body.


class SignatureUpdate(BaseModel):
    """Used by the signer to accept or reject a signature request."""

    status: SignatureStatus
    document_hash: str | None = Field(
        default=None,
        max_length=64,
        description="SHA-256 hex-digest of the document signed",
    )
    rejection_reason: str | None = Field(default=None, max_length=1000)


class SignatureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deal_id: int
    document_id: int
    signer_id: int
    status: SignatureStatus
    document_hash: str | None
    rejection_reason: str | None
    signed_at: datetime | None
    created_at: datetime
