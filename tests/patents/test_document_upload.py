import io
import pytest
import pytest_asyncio

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.patents.models import Patent, PatentStatus
from app.core.validators import (
    MAX_PATENT_DOCUMENT_SIZE_BYTES,
    validate_patent_document,
    ALLOWED_PATENT_DOC_MIME_TYPES,
)
from app.patents.schemas import PatentSubmitForVerification
import pydantic


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MINIMAL_PDF = (
    b"""%PDF-1.4
1 0 obj
<< /Type /Catalog >>
endobj
xref
0 2
0000000000 65535 f 
trailer
<< /Size 2 /Root 1 0 R >>
startxref
9
%%%%EOF
"""
)


async def _create_draft_patent(client: AsyncClient) -> int:
    resp = await client.post(
        "/patents",
        json={
            "title": "Upload Test Patent",
            "description": "Testing the document upload endpoint.",
            "keywords": "pdf, upload, test",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# validator unit tests
# ---------------------------------------------------------------------------


class TestValidatePatentDocumentUnit:
    def test_valid_pdf_passes(self):
        validate_patent_document("application/pdf", 1024)

    def test_wrong_mime_type_raises(self):
        with pytest.raises(ValueError, match="application/pdf"):
            validate_patent_document("application/msword", 1024)

    def test_image_mime_type_raises(self):
        with pytest.raises(ValueError, match="application/pdf"):
            validate_patent_document("image/jpeg", 5000)

    def test_empty_file_raises(self):
        with pytest.raises(ValueError, match="empty"):
            validate_patent_document("application/pdf", 0)

    def test_negative_size_raises(self):
        with pytest.raises(ValueError, match="empty"):
            validate_patent_document("application/pdf", -1)

    def test_exact_limit_passes(self):
        validate_patent_document("application/pdf", MAX_PATENT_DOCUMENT_SIZE_BYTES)

    def test_one_byte_over_limit_raises(self):
        with pytest.raises(ValueError, match="10 MB"):
            validate_patent_document("application/pdf", MAX_PATENT_DOCUMENT_SIZE_BYTES + 1)

    def test_allowed_set_is_pdf_only(self):
        assert ALLOWED_PATENT_DOC_MIME_TYPES == frozenset({"application/pdf"})


# ---------------------------------------------------------------------------
# Schema-level validation (PatentSubmitForVerification)
# ---------------------------------------------------------------------------


class TestPatentSubmitSchema:
    def test_valid_pdf_url_accepted(self):
        s = PatentSubmitForVerification(
            proof_document_url="https://storage.example.com/patents/abc123.pdf"
        )
        assert s.proof_document_url.endswith(".pdf")

    def test_pdf_url_with_query_string_accepted(self):
        s = PatentSubmitForVerification(
            proof_document_url="https://cdn.example.com/doc.pdf?token=xyz"
        )
        assert s.proof_document_url is not None

    def test_non_pdf_url_rejected(self):
        with pytest.raises(pydantic.ValidationError, match="pdf"):
            PatentSubmitForVerification(
                proof_document_url="https://storage.example.com/patents/abc123.docx"
            )

    def test_non_https_url_rejected(self):
        with pytest.raises(pydantic.ValidationError):
            PatentSubmitForVerification(proof_document_url="ftp://files.example.com/doc.pdf")

    def test_plain_string_rejected(self):
        with pytest.raises(pydantic.ValidationError):
            PatentSubmitForVerification(proof_document_url="not-a-url-at-all")


# ---------------------------------------------------------------------------
# HTTP integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_valid_pdf(client: AsyncClient):
    patent_id = await _create_draft_patent(client)
    resp = await client.post(
        f"/patents/{patent_id}/upload-document",
        files={"file": ("proof.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["proof_document_url"] is not None
    assert data["proof_document_url"].endswith(".pdf")
    assert "/documents/patents/" in data["proof_document_url"]


@pytest.mark.asyncio
async def test_upload_wrong_mime_type_rejected(client: AsyncClient):
    patent_id = await _create_draft_patent(client)
    resp = await client.post(
        f"/patents/{patent_id}/upload-document",
        files={
            "file": (
                "proof.docx",
                io.BytesIO(b"PK\x03\x04fake-docx-content"),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert resp.status_code == 422, resp.text
    assert "application/pdf" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_oversized_file_rejected(client: AsyncClient):
    patent_id = await _create_draft_patent(client)
    oversized = b"%PDF-1.4\n" + b"X" * (MAX_PATENT_DOCUMENT_SIZE_BYTES + 1)
    resp = await client.post(
        f"/patents/{patent_id}/upload-document",
        files={"file": ("big.pdf", io.BytesIO(oversized), "application/pdf")},
    )
    assert resp.status_code == 422, resp.text
    assert "10 MB" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_empty_file_rejected(client: AsyncClient):
    patent_id = await _create_draft_patent(client)
    resp = await client.post(
        f"/patents/{patent_id}/upload-document",
        files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_upload_blocked_for_nonexistent_patent(client: AsyncClient):
    resp = await client.post(
        "/patents/99999/upload-document",
        files={"file": ("proof.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_blocked_after_submission(client: AsyncClient, db_session: AsyncSession):
    patent_id = await _create_draft_patent(client)
    await client.post(
        f"/patents/{patent_id}/upload-document",
        files={"file": ("proof.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
    )
    patent = await db_session.get(Patent, patent_id)
    patent.status = PatentStatus.PENDING_VERIFICATION
    await db_session.commit()
    resp = await client.post(
        f"/patents/{patent_id}/upload-document",
        files={"file": ("proof2.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
    )
    assert resp.status_code == 409, resp.text


@pytest.mark.asyncio
async def test_upload_allowed_after_rejection(client: AsyncClient, db_session: AsyncSession):
    patent_id = await _create_draft_patent(client)
    patent = await db_session.get(Patent, patent_id)
    patent.status = PatentStatus.REJECTED
    patent.rejection_reason = "Incomplete documentation"
    await db_session.commit()
    resp = await client.post(
        f"/patents/{patent_id}/upload-document",
        files={"file": ("revised_proof.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["proof_document_url"].endswith(".pdf")
