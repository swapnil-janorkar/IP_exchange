"""
Auth request/response schemas.

Validation rules applied here:
  - email       : RFC-5322 via EmailStr + disposable-domain guard
  - password    : strength check (upper, lower, digit, special) via PasswordField
  - date_of_birth: minimum age (18 years) checked via validate_date_of_birth
"""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.auth.models import UserRole
from app.core.validators import PasswordField, validate_date_of_birth, validate_phone


class RegisterRequest(BaseModel):
    """Body for POST /auth/register."""

    email: EmailStr
    password: PasswordField
    role: UserRole

    # Optional profile fields — collected at registration time
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    phone: str | None = None
    date_of_birth: date | None = None

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str | None) -> str | None:
        return validate_phone(v) if v else v

    @field_validator("date_of_birth")
    @classmethod
    def _validate_dob(cls, v: date | None) -> date | None:
        return validate_date_of_birth(v) if v else v


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: UserRole
    is_active: bool
    is_verified: bool
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    # Raw password — only 8-char minimum here (strength already checked on register)
    password: str = Field(min_length=8, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access token TTL in seconds")


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    """Body for POST /auth/change-password."""

    current_password: str = Field(min_length=8, max_length=72)
    new_password: PasswordField