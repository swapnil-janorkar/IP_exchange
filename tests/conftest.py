"""
Shared fixtures for the test suite.

Uses an in-memory SQLite DB (via aiosqlite), not Postgres — fast,
no Docker required, good for an 8GB machine and for CI. Once the
Auth/Verification tracks land, this same pattern extends: import
whatever Base.metadata needs (User, Patent, ...) before create_all.
"""

from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Column, Integer, Table
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app

# Import models so their tables register on Base.metadata before create_all.
from app.patents.models import Patent  # noqa: F401

# --- TEMPORARY: stub `users` table -----------------------------------------
# `Patent.owner_id` has a ForeignKey("users.id"). Until the Auth track's
# app.auth.models.User exists, create_all() has nothing to point that FK
# at, so we register a minimal placeholder table here.
#
# ONCE app.auth.models.User EXISTS: delete this block and add
#     from app.auth.models import User  # noqa: F401
# alongside the Patent import above instead.
_stub_users_table = Table(
    "users",
    Base.metadata,
    Column("id", Integer, primary_key=True),
)
# -----------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()