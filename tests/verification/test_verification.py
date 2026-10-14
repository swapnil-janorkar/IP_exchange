from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User, UserRole
from app.patents.models import Patent, PatentStatus


async def _make_owner(db_session: AsyncSession) -> User:
    owner = User(
        email="patent-owner@example.com",
        password_hash="not-a-real-hash",
        role=UserRole.INNOVATOR,
        is_active=True,
        is_verified=True,
    )
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)
    return owner


async def _make_patent(db_session: AsyncSession, owner: User, status: PatentStatus) -> Patent:
    patent = Patent(
        owner_id=owner.id,
        title="Self-cleaning solar panel coating",
        description="A nanostructured coating that sheds dust via static repulsion.",
        status=status,
    )
    db_session.add(patent)
    await db_session.commit()
    await db_session.refresh(patent)
    return patent


async def test_queue_lists_pending_patents_only(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _make_owner(db_session)
    await _make_patent(db_session, owner, PatentStatus.DRAFT)  # should NOT appear
    pending = await _make_patent(db_session, owner, PatentStatus.PENDING_VERIFICATION)

    resp = await admin_client.get("/verification/queue")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["id"] == pending.id


async def test_approve_moves_to_verified(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _make_owner(db_session)
    patent = await _make_patent(db_session, owner, PatentStatus.PENDING_VERIFICATION)

    resp = await admin_client.post(f"/verification/{patent.id}/approve")
    assert resp.status_code == 200
    assert resp.json()["status"] == "verified"


async def test_approve_wrong_status_is_conflict(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _make_owner(db_session)
    patent = await _make_patent(db_session, owner, PatentStatus.DRAFT)

    resp = await admin_client.post(f"/verification/{patent.id}/approve")
    assert resp.status_code == 409


async def test_reject_requires_reason_and_sets_it(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _make_owner(db_session)
    patent = await _make_patent(db_session, owner, PatentStatus.PENDING_VERIFICATION)

    resp = await admin_client.post(
        f"/verification/{patent.id}/reject", json={"reason": "Proof document is unreadable"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "rejected"
    assert body["rejection_reason"] == "Proof document is unreadable"


async def test_reject_without_reason_is_422(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _make_owner(db_session)
    patent = await _make_patent(db_session, owner, PatentStatus.PENDING_VERIFICATION)

    resp = await admin_client.post(f"/verification/{patent.id}/reject", json={})
    assert resp.status_code == 422


async def test_list_moves_verified_to_listed(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _make_owner(db_session)
    patent = await _make_patent(db_session, owner, PatentStatus.VERIFIED)

    resp = await admin_client.post(f"/verification/{patent.id}/list")
    assert resp.status_code == 200
    assert resp.json()["status"] == "listed"


async def test_list_before_verified_is_conflict(admin_client: AsyncClient, db_session: AsyncSession) -> None:
    owner = await _make_owner(db_session)
    patent = await _make_patent(db_session, owner, PatentStatus.PENDING_VERIFICATION)

    resp = await admin_client.post(f"/verification/{patent.id}/list")
    assert resp.status_code == 409


async def test_non_admin_cannot_approve(client: AsyncClient, db_session: AsyncSession) -> None:
    """`client` fixture is an innovator, not an admin — verification endpoints must reject them."""
    owner = await _make_owner(db_session)
    patent = await _make_patent(db_session, owner, PatentStatus.PENDING_VERIFICATION)

    resp = await client.post(f"/verification/{patent.id}/approve")
    assert resp.status_code == 403


async def test_approve_nonexistent_patent_404(admin_client: AsyncClient) -> None:
    resp = await admin_client.post("/verification/999/approve")
    assert resp.status_code == 404
