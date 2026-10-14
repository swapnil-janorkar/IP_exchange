"""
Shared fixtures for the test suite.

Uses an in-memory SQLite DB (via aiosqlite), not Postgres -- fast,
no Docker required, good for an 8GB machine and for CI. Once the
Auth/Verification tracks land, this same pattern extends: import
whatever Base.metadata needs (User, Patent, ...) before create_all.

Fixtures
--------
db_session             -- bare in-memory DB session; no HTTP layer.
client                 -- pre-authenticated HTTP client (get_current_user
                          stubbed with a fixed INNOVATOR user, id=1).
                          Use this for Patents CRUD tests that focus on
                          business logic, not JWT plumbing.
unauthenticated_client -- HTTP client with NO auth override; only get_db
                          is replaced. The real get_current_user runs
                          end-to-end, so callers must supply a valid
                          "Authorization: Bearer <jwt>" header themselves.
                          Use this for auth-integration tests.
"""

from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.dependencies import get_current_user
from app.auth.models import User, UserRole  # noqa: F401
from app.core.database import Base, get_db
from app.main import app

# Import models so their tables register on Base.metadata before create_all.
from app.patents.models import Patent  # noqa: F401


# ---------------------------------------------------------------------------
# DB fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


# ---------------------------------------------------------------------------
# Pre-authenticated client  (used by test_patents_crud.py)
# Overrides BOTH get_db AND get_current_user so tests never touch JWT logic.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTP client where authentication is already resolved via a dependency
    override. The stub user has id=1 and the INNOVATOR role -- matching the
    hard-coded assertions in test_patents_crud.py (owner_id == 1).

    The stub user is persisted into the DB so that subsequent inserts
    (e.g. `other_owner` in test_cannot_edit_another_users_patent) receive
    a different auto-incremented id and the ownership check actually fires.
    """
    stub_user = User(
        email="stub@example.com",
        password_hash="not-a-real-hash",
        role=UserRole.INNOVATOR,
        is_active=True,
        is_verified=True,
    )
    db_session.add(stub_user)
    await db_session.commit()
    await db_session.refresh(stub_user)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    async def override_get_current_user() -> User:
        return stub_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Admin fixtures  (used by tests/verification/test_verification.py)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    user = User(
        email="admin@example.com",
        password_hash="not-a-real-hash",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_client(db_session: AsyncSession, admin_user: User) -> AsyncGenerator[AsyncClient, None]:
    """Same shape as `client`, but authenticated as an admin — for Verification tests."""

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return admin_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Unauthenticated client  (used by test_patents_auth_integration.py)
# Only get_db is overridden; get_current_user runs for real so the caller
# must supply a valid "Authorization: Bearer <jwt>" header themselves.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def unauthenticated_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTP client with the real auth dependency intact. Only the DB session is
    swapped so requests hit the same in-memory SQLite DB that the test itself
    inserts rows into.
    """
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
