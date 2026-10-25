"""
app/documents/storage.py
------------------------
Local-disk document storage for development / self-hosted deployments.

Public surface
--------------
save_upload(file: UploadFile) -> tuple[str, str, int, Path, str]
    Validates the uploaded file (type + size), streams it to UPLOAD_DIR,
    and returns:
        storage_key      — relative path used as the DB `storage_url`
        mime_type        — detected MIME type
        size_bytes       — exact byte count written
        saved_path       — absolute Path of the file on disk
        original_filename — sanitised original filename

Exceptions
----------
InvalidDocumentError  — unsupported file type
UploadTooLargeError   — file exceeds MAX_UPLOAD_BYTES

Design notes
------------
* Files are placed under  <project_root>/uploads/<YYYY>/<MM>/<uuid4>_<filename>
  so the directory never becomes unmanageably large.
* The storage_key stored in the DB is the path *relative* to UPLOAD_DIR,
  which makes it easy to switch to S3/GCS later (just change save_upload
  to call the cloud SDK instead of writing to disk).
* MIME type is determined from the file's first 2 KB (magic bytes) via the
  `python-magic` library when available, falling back to the Content-Type
  header sent by the client.  The header-only fallback is safe here because
  we also maintain an allowlist of permitted types.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Root directory for all uploaded files (relative to the repo root).
# Override by setting UPLOAD_DIR as an absolute path in your environment.
_DEFAULT_UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"

UPLOAD_DIR: Path = _DEFAULT_UPLOAD_DIR
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Maximum allowed upload size: 50 MB
MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024  # 50 MB

# Chunk size used when streaming the file to disk.
_CHUNK_SIZE: int = 256 * 1024  # 256 KB

# Permitted MIME types and their canonical file extensions.
ALLOWED_MIME_TYPES: dict[str, str] = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
    "text/plain": ".txt",
}

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class InvalidDocumentError(ValueError):
    """Raised when the uploaded file type is not permitted."""


class UploadTooLargeError(ValueError):
    """Raised when the uploaded file exceeds MAX_UPLOAD_BYTES."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_UNSAFE_CHARS = re.compile(r"[^\w.\-]")  # keep word chars, dots, hyphens


def _sanitise_filename(name: str) -> str:
    """Strip path components and replace unsafe characters."""
    # Take only the final component (strip any path traversal)
    name = Path(name).name
    # Replace unsafe characters with underscores
    name = _UNSAFE_CHARS.sub("_", name)
    # Truncate to 200 chars to stay well within filesystem limits
    return name[:200] or "upload"


def _detect_mime(file: UploadFile, first_chunk: bytes) -> str:
    """
    Attempt magic-byte MIME detection; fall back to the Content-Type header.
    Raises InvalidDocumentError if the type is not in the allowlist.
    """
    detected: str | None = None

    # Try python-magic (optional dependency)
    try:
        import magic  # type: ignore[import-untyped]

        detected = magic.from_buffer(first_chunk, mime=True)
    except ImportError:
        pass

    # Fall back to the browser-supplied header
    if not detected:
        ct = file.content_type or ""
        # Strip parameters like "; charset=utf-8"
        detected = ct.split(";")[0].strip() or "application/octet-stream"

    if detected not in ALLOWED_MIME_TYPES:
        allowed = ", ".join(sorted(ALLOWED_MIME_TYPES))
        raise InvalidDocumentError(
            f"File type '{detected}' is not permitted. "
            f"Allowed types: {allowed}"
        )

    return detected


def _build_storage_key(original_filename: str) -> tuple[Path, str]:
    """
    Returns (absolute_path, relative_storage_key).
    Layout: uploads/<YYYY>/<MM>/<uuid4>_<sanitised_filename>
    """
    now = datetime.now(timezone.utc)
    year_month = now.strftime("%Y/%m")

    subdir = UPLOAD_DIR / year_month
    subdir.mkdir(parents=True, exist_ok=True)

    safe_name = _sanitise_filename(original_filename)
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    abs_path = subdir / unique_name

    # storage_key = relative path from UPLOAD_DIR
    rel_key = f"{year_month}/{unique_name}"
    return abs_path, rel_key


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def save_upload(
    file: UploadFile,
) -> tuple[str, str, int, Path, str]:
    """
    Validate and persist an uploaded file to local disk.

    Parameters
    ----------
    file : UploadFile
        The FastAPI upload file object (from a multipart request).

    Returns
    -------
    storage_key : str
        Relative path from UPLOAD_DIR; stored in ``Document.storage_url``.
    mime_type : str
        Detected MIME type of the file.
    size_bytes : int
        Number of bytes written.
    saved_path : Path
        Absolute filesystem path of the saved file (used for rollback).
    original_filename : str
        The sanitised original filename from the client.

    Raises
    ------
    InvalidDocumentError
        If the file's MIME type is not in ``ALLOWED_MIME_TYPES``.
    UploadTooLargeError
        If the file exceeds ``MAX_UPLOAD_BYTES``.
    """
    original_filename = _sanitise_filename(file.filename or "upload")
    abs_path, storage_key = _build_storage_key(original_filename)

    size_bytes = 0
    first_chunk_captured = False
    mime_type: str = "application/octet-stream"  # resolved below

    try:
        with abs_path.open("wb") as fh:
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break

                # Detect MIME from the very first chunk (magic bytes)
                if not first_chunk_captured:
                    mime_type = _detect_mime(file, chunk)
                    first_chunk_captured = True

                size_bytes += len(chunk)
                if size_bytes > MAX_UPLOAD_BYTES:
                    raise UploadTooLargeError(
                        f"File exceeds the maximum allowed size of "
                        f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
                    )

                fh.write(chunk)

    except (InvalidDocumentError, UploadTooLargeError):
        # Clean up the partially written file before re-raising
        abs_path.unlink(missing_ok=True)
        raise

    return storage_key, mime_type, size_bytes, abs_path, original_filename
