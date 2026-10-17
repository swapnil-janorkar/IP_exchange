"""
Pydantic request/response schemas for the IPVEXA domain.

All write schemas (Create / Update) apply the platform validation layer
from app.core.validators.
"""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.validators import validate_keywords
from app.ipvexa.models import (
    IPRRecordStatus,
    JobStatus,
    ServiceCategory,
    ServiceRequestStatus,
)


# ---------------------------------------------------------------------------
# IPR Record schemas
# ---------------------------------------------------------------------------


class IPRRecordCreate(BaseModel):
    title: str = Field(min_length=5, max_length=300)
    description: str = Field(min_length=20)
    ip_type: str = Field(default="patent", max_length=100)
    keywords: str = Field(default="", max_length=1000)

    @field_validator("keywords")
    @classmethod
    def _validate_keywords(cls, v: str) -> str:
        return validate_keywords(v) if v else v


class IPRRecordUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=5, max_length=300)
    description: str | None = Field(default=None, min_length=20)
    ip_type: str | None = Field(default=None, max_length=100)
    keywords: str | None = Field(default=None, max_length=1000)

    @field_validator("keywords")
    @classmethod
    def _validate_keywords(cls, v: str | None) -> str | None:
        return validate_keywords(v) if v else v


class IPRRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    title: str
    description: str
    ip_type: str
    status: IPRRecordStatus
    admin_notes: str | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Service schemas
# ---------------------------------------------------------------------------


class ServiceCreate(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10)
    category: ServiceCategory
    price_cents: int = Field(ge=0, description="Price in smallest currency unit (paise/cents)")


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, min_length=10)
    category: ServiceCategory | None = None
    price_cents: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider_id: int
    name: str
    description: str
    category: ServiceCategory
    price_cents: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Service Request schemas
# ---------------------------------------------------------------------------


class ServiceRequestCreate(BaseModel):
    ipr_record_id: int
    service_id: int
    message: str | None = Field(default=None, max_length=2000)


class ServiceRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    requester_id: int
    ipr_record_id: int
    service_id: int
    status: ServiceRequestStatus
    message: str | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Job schemas
# ---------------------------------------------------------------------------


class JobCreate(BaseModel):
    service_request_id: int
    assigned_to: int
    notes: str | None = Field(default=None, max_length=5000)
    due_date: datetime | None = None


class JobUpdate(BaseModel):
    status: JobStatus | None = None
    notes: str | None = Field(default=None, max_length=5000)
    due_date: datetime | None = None
    assigned_to: int | None = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    service_request_id: int
    assigned_to: int
    status: JobStatus
    notes: str | None
    due_date: datetime | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Work Report schemas
# ---------------------------------------------------------------------------


class WorkReportCreate(BaseModel):
    job_id: int
    title: str = Field(min_length=3, max_length=300)
    summary: str = Field(min_length=10)
    document_url: str | None = Field(default=None, max_length=512)
    document_mime_type: str | None = Field(default=None, max_length=100)
    document_size_bytes: int | None = Field(
        default=None, gt=0, le=50 * 1024 * 1024,
        description="File size in bytes (max 50 MB)"
    )

    @field_validator("document_mime_type")
    @classmethod
    def _validate_mime(cls, v: str | None) -> str | None:
        if v is not None:
            from app.core.validators import validate_mime_type
            return validate_mime_type(v)
        return v


class WorkReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    author_id: int
    title: str
    summary: str
    document_url: str | None
    document_mime_type: str | None
    document_size_bytes: int | None
    created_at: datetime
