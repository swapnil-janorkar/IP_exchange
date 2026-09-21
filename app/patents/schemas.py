"""
Request/response shapes for the Patents API.

These are the contract other tracks (Verification, Search, AI,
frontend) code against — change field names here deliberately, not
casually, since others build on top of them.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.patents.models import PatentStatus


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
    """Body for POST /patents/{id}/submit — moves DRAFT -> PENDING_VERIFICATION."""

    proof_document_url: str = Field(description="Required before submission")


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