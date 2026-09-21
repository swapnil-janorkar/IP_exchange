"""
Async database engine and session management.

`get_db` is a FastAPI dependency — every route that touches the DB
takes `db: AsyncSession = Depends(get_db)` and gets a session that is
opened for the request and closed automatically after, even on error.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# pool_pre_ping avoids handing out dead connections after the DB
# container restarts (common during local dev).
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class every SQLAlchemy model (User, Patent, Deal, ...) inherits from."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
