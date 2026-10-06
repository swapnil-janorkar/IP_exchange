"""
Proves the Patents <-> Auth integration works for real: a genuine JWT,
decoded by the real (non-overridden) get_current_user, hitting a real
DB-backed User lookup. The override-based tests in test_patents_crud.py
prove Patents' own logic is correct in isolation; this proves the wire
between the two modules is actually connected.
"""

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User, UserRole
from app.core.config import settings


def _make_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


async def test_real_jwt_authenticates_and_creates_patent(
    unauthenticated_client: AsyncClient, db_session: AsyncSession
) -> None:
    user = User(
        email="real-flow@example.com",
        password_hash="not-a-real-hash",
        role=UserRole.INNOVATOR,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = _make_token(user)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await unauthenticated_client.post(
        "/patents",
        json={"title": "Real auth flow patent", "description": "Created via a real JWT, not a test override."},
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["owner_id"] == user.id


async def test_missing_token_is_rejected(unauthenticated_client: AsyncClient) -> None:
    resp = await unauthenticated_client.get("/patents/mine")
    assert resp.status_code in (401, 403)  # HTTPBearer returns 403 when the header is absent entirely


async def test_inactive_user_is_rejected(
    unauthenticated_client: AsyncClient, db_session: AsyncSession
) -> None:
    user = User(
        email="inactive@example.com",
        password_hash="not-a-real-hash",
        role=UserRole.INNOVATOR,
        is_active=False,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = _make_token(user)
    resp = await unauthenticated_client.get(
        "/patents/mine", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 401


async def test_tampered_token_is_rejected(unauthenticated_client: AsyncClient) -> None:
    resp = await unauthenticated_client.get(
        "/patents/mine", headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert resp.status_code == 401
