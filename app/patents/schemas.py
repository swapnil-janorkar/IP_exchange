"""
Request/response shapes for the Patents API.

These are the contract other tracks (Verification, Search, AI,
frontend) code against — change field names here deliberately, not
casually, since others build on top of them.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.patents.models import PatentStatus
from app.core.validators import validate_url


class PatentCreate(BaseModel):
    """Body for POST /patents — owner creates a draft."""

    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10)
    keywords: str = Field(default="", max_length=500, description="Comma-separated keywords")


class PatentUpdate(BaseModel):
    """
    Body for PATCH /patents/{id}. All fields optional — only send what
    changes. Owner can only edit while status is DRAFT or REJECTED
    (enforced in the route, not here).
    """

    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, min_length=10)
    keywords: str | None = Field(default=None, max_length=500)
    proof_document_url: str | None = None


class PatentSubmitForVerification(BaseModel):
    """Body for POST /patents/{id}/submit — moves DRAFT -> PENDING_VERIFICATION.

    The proof_document_url must:
      - Be a valid HTTP/HTTPS URL.
      - Point to a PDF file (URL must end with '.pdf').

    Prefer using POST /patents/{id}/upload-document to upload the file
    directly — that endpoint also enforces the 10 MB size limit server-side.
    """

    proof_document_url: str = Field(description="HTTPS URL of the PDF proof document")

    @field_validator("proof_document_url")
    @classmethod
    def must_be_pdf_url(cls, v: str) -> str:
        # Basic HTTP/HTTPS format check
        validate_url(v)
        # Enforce .pdf extension (case-insensitive)
        if not v.lower().split("?")[0].endswith(".pdf"):
            raise ValueError(
                "proof_document_url must point to a PDF file (URL path must end with '.pdf')."
            )
        return v


class PatentOut(BaseModel):
    """Full patent detail — used for owner's own view and admin review."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    title: str
    description: str
    keywords: str
    status: PatentStatus
    ai_summary: str | None
    rejection_reason: str | None
    proof_document_url: str | None
    created_at: datetime
    updated_at: datetime


class PatentPublicOut(BaseModel):
    """
    Trimmed view for organisations browsing search results — no
    proof_document_url, no rejection_reason, no owner_id. Only ever
    returned for status == LISTED patents.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    keywords: str
    ai_summary: str | None
    created_at: datetime