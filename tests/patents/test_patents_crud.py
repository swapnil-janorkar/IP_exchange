"""
Patents CRUD tests, run against the stub auth user (id=1, role=innovator
— see app/patents/dependencies_stub.py). These exercise the module in
full isolation from the Auth track.
"""

from httpx import AsyncClient


async def _create_draft(client: AsyncClient) -> dict:
    resp = await client.post(
        "/patents",
        json={
            "title": "Self-healing polymer coating",
            "description": "A coating that repairs microcracks on exposure to sunlight.",
            "keywords": "polymer, self-healing, coating",
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def test_create_patent_starts_as_draft(client: AsyncClient) -> None:
    patent = await _create_draft(client)
    assert patent["status"] == "draft"
    assert patent["owner_id"] == 1
    assert patent["ai_summary"] is None


async def test_list_mine_returns_own_patents(client: AsyncClient) -> None:
    await _create_draft(client)
    await _create_draft(client)

    resp = await client.get("/patents/mine")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


async def test_get_nonexistent_patent_returns_404(client: AsyncClient) -> None:
    resp = await client.get("/patents/999")
    assert resp.status_code == 404


async def test_update_draft_patent_succeeds(client: AsyncClient) -> None:
    patent = await _create_draft(client)

    resp = await client.patch(f"/patents/{patent['id']}", json={"title": "Updated title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated title"
    # Unset fields are left untouched
    assert resp.json()["description"] == patent["description"]


async def test_submit_moves_to_pending_verification(client: AsyncClient) -> None:
    patent = await _create_draft(client)

    resp = await client.post(
        f"/patents/{patent['id']}/submit",
        json={"proof_document_url": "https://example.com/proof.pdf"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "pending_verification"
    assert body["proof_document_url"] == "https://example.com/proof.pdf"


async def test_cannot_edit_after_submission(client: AsyncClient) -> None:
    patent = await _create_draft(client)
    await client.post(
        f"/patents/{patent['id']}/submit",
        json={"proof_document_url": "https://example.com/proof.pdf"},
    )

    resp = await client.patch(f"/patents/{patent['id']}", json={"title": "Sneaky edit"})
    assert resp.status_code == 409


async def test_cannot_submit_twice(client: AsyncClient) -> None:
    patent = await _create_draft(client)
    await client.post(
        f"/patents/{patent['id']}/submit",
        json={"proof_document_url": "https://example.com/proof.pdf"},
    )

    resp = await client.post(
        f"/patents/{patent['id']}/submit",
        json={"proof_document_url": "https://example.com/proof2.pdf"},
    )
    assert resp.status_code == 409


async def test_delete_draft_patent_succeeds(client: AsyncClient) -> None:
    patent = await _create_draft(client)

    resp = await client.delete(f"/patents/{patent['id']}")
    assert resp.status_code == 204

    resp = await client.get(f"/patents/{patent['id']}")
    assert resp.status_code == 404


async def test_create_patent_rejects_short_title(client: AsyncClient) -> None:
    resp = await client.post(
        "/patents",
        json={"title": "ab", "description": "A description long enough to pass validation."},
    )
    assert resp.status_code == 422


async def test_browse_only_returns_listed_patents(client: AsyncClient, db_session) -> None:
    # A draft patent should never appear in the public browse endpoint.
    await _create_draft(client)

    resp = await client.get("/patents")
    assert resp.status_code == 200
    assert resp.json() == []

    # Manually promote one to LISTED (no Verification/AI module yet to do this for us).
    from app.patents.models import Patent, PatentStatus

    patent = (await db_session.execute(Patent.__table__.select())).first()
    listed = await db_session.get(Patent, patent.id)
    listed.status = PatentStatus.LISTED
    await db_session.commit()

    resp = await client.get("/patents")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    # Public view is trimmed — no owner_id, no proof_document_url.
    assert "owner_id" not in body[0]
    assert "proof_document_url" not in body[0]
    assert body[0]["title"] == "Self-healing polymer coating"


async def test_browse_respects_limit(client: AsyncClient, db_session) -> None:
    from app.patents.models import Patent, PatentStatus

    for _ in range(3):
        await _create_draft(client)
    result = await db_session.execute(Patent.__table__.select())
    for row in result.fetchall():
        p = await db_session.get(Patent, row.id)
        p.status = PatentStatus.LISTED
    await db_session.commit()

    resp = await client.get("/patents", params={"limit": 2})
    assert resp.status_code == 200
    assert len(resp.json()) == 2