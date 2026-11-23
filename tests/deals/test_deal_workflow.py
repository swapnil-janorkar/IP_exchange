import pytest
import pytest_asyncio

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User, UserRole
from app.core.database import get_db
from app.documents import storage
from app.main import app
from app.patents.exchange_models import Document, DocumentType
from app.patents.models import Patent, PatentStatus


@pytest_asyncio.fixture
async def deal_workflow_client(
    db_session: AsyncSession, tmp_path, monkeypatch
):
    innovator = User(
        email="seller@example.com",
        password_hash="test",
        role=UserRole.INNOVATOR,
        is_active=True,
        is_verified=True,
    )
    organisation = User(
        email="buyer@example.com",
        password_hash="test",
        role=UserRole.ORGANISATION,
        is_active=True,
        is_verified=True,
    )
    db_session.add_all([innovator, organisation])
    await db_session.flush()

    patent = Patent(
        owner_id=innovator.id,
        title="Listed test patent",
        description="A patent used to test the deal workflow.",
        keywords="test",
        status=PatentStatus.LISTED,
    )
    db_session.add(patent)
    await db_session.commit()
    await db_session.refresh(patent)

    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr(storage, "UPLOAD_DIR", upload_dir)

    identity = {"user": organisation}

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return identity["user"]

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, identity, innovator, organisation, patent, upload_dir

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_interest_creates_deal_and_blocks_duplicate(
    deal_workflow_client, db_session: AsyncSession
):
    client, identity, _, organisation, patent, _ = deal_workflow_client

    response = await client.post("/deals", json={"patent_id": patent.id})

    assert response.status_code == 201, response.text
    deal = response.json()
    assert deal["buyer_id"] == organisation.id
    assert deal["seller_id"] == patent.owner_id
    assert deal["nda_complete"] is False

    duplicate = await client.post("/deals", json={"patent_id": patent.id})
    assert duplicate.status_code == 409

    outsider = User(
        email="outsider@example.com",
        password_hash="test",
        role=UserRole.ORGANISATION,
        is_active=True,
        is_verified=True,
    )
    db_session.add(outsider)
    await db_session.commit()
    identity["user"] = outsider

    hidden_deal = await client.get(f"/deals/{deal['id']}")
    assert hidden_deal.status_code == 403

@pytest.mark.asyncio
async def test_nda_is_required_for_document_access_and_both_parties_sign(
    deal_workflow_client, db_session: AsyncSession
):
    client, identity, innovator, organisation, patent, upload_dir = (
        deal_workflow_client
    )
    deal_response = await client.post("/deals", json={"patent_id": patent.id})
    assert deal_response.status_code == 201, deal_response.text
    deal_id = deal_response.json()["id"]

    patent_file = upload_dir / "technical-notes.txt"
    patent_file.write_text("Confidential technical details", encoding="utf-8")
    patent_document = Document(
        owner_id=innovator.id,
        patent_id=patent.id,
        doc_type=DocumentType.OTHER,
        file_name="technical-notes.txt",
        storage_url="technical-notes.txt",
        mime_type="text/plain",
        size_bytes=30,
    )
    db_session.add(patent_document)
    await db_session.commit()
    await db_session.refresh(patent_document)

    blocked_download = await client.get(
        f"/deals/{deal_id}/documents/{patent_document.id}/download"
    )
    assert blocked_download.status_code == 403

    blocked_upload = await client.post(
        "/documents/upload",
        data={"doc_type": "other", "deal_id": str(deal_id)},
        files={"file": ("draft.txt", b"private", "text/plain")},
    )
    assert blocked_upload.status_code == 403

    identity["user"] = innovator
    nda_upload = await client.post(
        "/documents/upload",
        data={"doc_type": "nda", "deal_id": str(deal_id)},
        files={"file": ("nda.txt", b"Approved NDA terms", "text/plain")},
    )
    assert nda_upload.status_code == 201, nda_upload.text
    nda_id = nda_upload.json()["id"]

    identity["user"] = organisation
    visible_before_signing = await client.get(f"/deals/{deal_id}/documents")
    assert visible_before_signing.status_code == 200
    assert [doc["id"] for doc in visible_before_signing.json()] == [nda_id]

    nda_download = await client.get(
        f"/deals/{deal_id}/documents/{nda_id}/download"
    )
    assert nda_download.status_code == 200
    assert nda_download.content == b"Approved NDA terms"

    buyer_signature = await client.post(f"/deals/{deal_id}/nda/sign")
    assert buyer_signature.status_code == 200, buyer_signature.text
    assert buyer_signature.json()["nda_complete"] is False

    identity["user"] = innovator
    seller_signature = await client.post(f"/deals/{deal_id}/nda/sign")
    assert seller_signature.status_code == 200, seller_signature.text
    assert seller_signature.json()["nda_complete"] is True
    assert seller_signature.json()["status"] == "negotiating"

    identity["user"] = organisation
    shared_documents = await client.get(f"/deals/{deal_id}/documents")
    assert shared_documents.status_code == 200
    assert {doc["id"] for doc in shared_documents.json()} == {
        nda_id,
        patent_document.id,
    }

    patent_download = await client.get(
        f"/deals/{deal_id}/documents/{patent_document.id}/download"
    )
    assert patent_download.status_code == 200
    assert patent_download.content == b"Confidential technical details"


@pytest.mark.asyncio
async def test_only_organisation_can_express_interest(deal_workflow_client):
    client, identity, innovator, _, patent, _ = deal_workflow_client
    identity["user"] = innovator

    response = await client.post("/deals", json={"patent_id": patent.id})

    assert response.status_code == 403
