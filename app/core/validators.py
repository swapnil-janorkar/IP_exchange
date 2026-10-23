"""
Platform-wide validation utilities.

Import individual validators / annotated types into Pydantic schemas:

    from app.core.validators import (
        EmailField,
        PasswordField,
        DocumentSizeBytes,
        validate_mime_type,
        validate_keywords,
        validate_phone,
        ALLOWED_DOC_MIME_TYPES,
    )

All validators raise ValueError (Pydantic converts them to 422 response detail).
"""

import re
from datetime import date, datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, Field

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Supported document MIME types for upload endpoints
ALLOWED_DOC_MIME_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/tiff",
    }
)

# Maximum document upload size = 50 MB
MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

# ---------------------------------------------------------------------------
# Patent proof-document constraints (stricter than the general upload limits)
# ---------------------------------------------------------------------------

# Only PDF is accepted for patent proof documents (industry standard)
ALLOWED_PATENT_DOC_MIME_TYPES: frozenset[str] = frozenset({"application/pdf"})

# Patent proof documents must not exceed 10 MB
MAX_PATENT_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

# Minimum age for innovators registering on the platform
MIN_AGE_YEARS = 18

# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------

# Pydantic's EmailStr already validates RFC 5322; this re-checks the domain
# is not a bare IP or localhost (extra guard for business emails).
_DISPOSABLE_DOMAIN_KEYWORDS = frozenset(
    {"mailinator", "trashmail", "guerrillamail", "yopmail", "throwam"}
)


def _validate_email(v: str) -> str:
    v = v.strip().lower()
    domain = v.split("@")[-1] if "@" in v else ""
    for kw in _DISPOSABLE_DOMAIN_KEYWORDS:
        if kw in domain:
            raise ValueError(
                f"Disposable email domains ('{kw}') are not allowed."
            )
    return v


# Use as a type annotation in Pydantic models:
#   email: EmailField
EmailField = Annotated[str, AfterValidator(_validate_email)]

# ---------------------------------------------------------------------------
# Password strength
# ---------------------------------------------------------------------------


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(v) > 72:
        raise ValueError("Password must not exceed 72 characters (bcrypt limit).")
    if not any(c.isupper() for c in v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not any(c.islower() for c in v):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one digit.")
    if not any(c in r"!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in v):
        raise ValueError("Password must contain at least one special character.")
    return v


PasswordField = Annotated[str, AfterValidator(_validate_password)]

# ---------------------------------------------------------------------------
# Document validation
# ---------------------------------------------------------------------------


def validate_mime_type(mime_type: str) -> str:
    """Validate that the MIME type is in the allowed set."""
    if mime_type not in ALLOWED_DOC_MIME_TYPES:
        allowed = ", ".join(sorted(ALLOWED_DOC_MIME_TYPES))
        raise ValueError(
            f"Unsupported file type '{mime_type}'. Allowed: {allowed}"
        )
    return mime_type


def validate_document_size(size_bytes: int) -> int:
    """Validate that the document size does not exceed 50 MB."""
    if size_bytes <= 0:
        raise ValueError("Document size must be greater than 0.")
    if size_bytes > MAX_DOCUMENT_SIZE_BYTES:
        max_mb = MAX_DOCUMENT_SIZE_BYTES // (1024 * 1024)
        raise ValueError(f"Document exceeds maximum size of {max_mb} MB.")
    return size_bytes


# Annotated type for document size in Pydantic models
DocumentSizeBytes = Annotated[
    int,
    Field(gt=0, le=MAX_DOCUMENT_SIZE_BYTES, description="File size in bytes (max 50 MB)"),
]


def validate_patent_document(content_type: str, size_bytes: int) -> None:
    """
    Validate a patent proof-document upload.

    Rules (enforced at the route layer before saving):
      - Format: PDF only (application/pdf).
      - Size: must be > 0 and <= MAX_PATENT_DOCUMENT_SIZE_BYTES (10 MB).

    Raises ValueError so callers can re-raise as HTTPException 422.
    """
    if content_type not in ALLOWED_PATENT_DOC_MIME_TYPES:
        raise ValueError(
            f"Patent proof document must be a PDF file (received '{content_type}'). "
            "Only 'application/pdf' is accepted."
        )
    if size_bytes <= 0:
        raise ValueError("Uploaded file is empty.")
    max_mb = MAX_PATENT_DOCUMENT_SIZE_BYTES // (1024 * 1024)
    if size_bytes > MAX_PATENT_DOCUMENT_SIZE_BYTES:
        actual_mb = size_bytes / (1024 * 1024)
        raise ValueError(
            f"Patent proof document exceeds the maximum allowed size of {max_mb} MB "
            f"(uploaded file is {actual_mb:.2f} MB). Please reduce the file size and retry."
        )

# ---------------------------------------------------------------------------
# Age validation
# ---------------------------------------------------------------------------


def validate_date_of_birth(dob: date) -> date:
    """
    Ensure the user is at least MIN_AGE_YEARS old.
    Pass a datetime.date (or datetime) value.
    """
    today = datetime.now(timezone.utc).date()
    age_years = (
        today.year
        - dob.year
        - ((today.month, today.day) < (dob.month, dob.day))
    )
    if age_years < MIN_AGE_YEARS:
        raise ValueError(
            f"Must be at least {MIN_AGE_YEARS} years old to register "
            f"(provided DOB implies age {age_years})."
        )
    return dob


# ---------------------------------------------------------------------------
# Phone number (E.164 format)
# ---------------------------------------------------------------------------

_PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def validate_phone(phone: str) -> str:
    """Accept E.164 format: +[country][number], 7–15 digits total."""
    phone = phone.strip().replace(" ", "").replace("-", "")
    if not _PHONE_RE.match(phone):
        raise ValueError(
            "Phone number must be in E.164 format (e.g. +919876543210)."
        )
    return phone


# ---------------------------------------------------------------------------
# Keywords field (comma-separated tags)
# ---------------------------------------------------------------------------

_MAX_KEYWORDS = 20
_MAX_KEYWORD_LEN = 50


def validate_keywords(raw: str) -> str:
    """
    Accept a comma-separated keyword string.
    Rules:
      - At most _MAX_KEYWORDS keywords
      - Each keyword at most _MAX_KEYWORD_LEN characters
      - No empty keywords
    Returns a normalised, lowercase, deduplicated keyword string.
    """
    parts = [kw.strip().lower() for kw in raw.split(",") if kw.strip()]
    if len(parts) > _MAX_KEYWORDS:
        raise ValueError(
            f"Too many keywords (max {_MAX_KEYWORDS}). Got {len(parts)}."
        )
    for kw in parts:
        if len(kw) > _MAX_KEYWORD_LEN:
            raise ValueError(
                f"Keyword '{kw}' exceeds max length of {_MAX_KEYWORD_LEN} characters."
            )
    # Deduplicate while preserving order
    seen: set[str] = set()
    deduped = []
    for kw in parts:
        if kw not in seen:
            seen.add(kw)
            deduped.append(kw)
    return ", ".join(deduped)


# ---------------------------------------------------------------------------
# URL / Storage URL
# ---------------------------------------------------------------------------

_URL_RE = re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.IGNORECASE)


def validate_url(url: str) -> str:
    """Validate that a string is a plausible HTTP/HTTPS URL."""
    if not _URL_RE.match(url):
        raise ValueError(f"'{url}' is not a valid HTTP/HTTPS URL.")
    return url


# ---------------------------------------------------------------------------
# Currency code (ISO 4217)
# ---------------------------------------------------------------------------

_SUPPORTED_CURRENCIES = frozenset({"INR", "USD", "EUR", "GBP", "SGD", "AED"})


def validate_currency(code: str) -> str:
    code = code.upper().strip()
    if code not in _SUPPORTED_CURRENCIES:
        raise ValueError(
            f"Unsupported currency '{code}'. "
            f"Allowed: {', '.join(sorted(_SUPPORTED_CURRENCIES))}."
        )
    return code
