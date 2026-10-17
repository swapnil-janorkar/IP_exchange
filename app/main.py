"""
App entrypoint. Run locally with:
    uvicorn app.main:app --reload

Each module (auth, patents, verification, ...) exposes its own
APIRouter in a `router.py`, imported and included here. This file
should stay thin — routing/wiring only, no business logic.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine

# ---- Import every model so metadata is populated before create_all ----
import app.auth.models                  # noqa: F401  User
import app.auth.refresh_token_models    # noqa: F401  RefreshToken
import app.core.audit_models            # noqa: F401  AuditLog
import app.patents.models               # noqa: F401  Patent
import app.patents.exchange_models      # noqa: F401  Document, Deal, Signature, Embedding
import app.ipvexa.models               # noqa: F401  IPRRecord, Service, ServiceRequest, Job, WorkReport
# -----------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup: create all tables that do not yet exist.
    Works with SQLite (dev/demo) and Postgres.
    For production use `alembic upgrade head` instead.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # (shutdown cleanup can go here)


app = FastAPI(
    title="IP Exchange Tool API",
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

# Loosened for local dev against a Next.js frontend on :3000.
# Tighten to explicit origins before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}


# --- Routers, included as each module is built ---
from app.auth.router import router as auth_router
from app.patents.router import router as patents_router
from app.verification.router import router as verification_router

# NOTE: auth_router already declares prefix="/auth" internally — do NOT pass prefix here.
app.include_router(auth_router, tags=["auth"])
app.include_router(patents_router, prefix="/patents", tags=["patents"])
app.include_router(verification_router, prefix="/verification", tags=["verification"])
