"""
App entrypoint. Run locally with:
    uvicorn app.main:app --reload

Each module (auth, patents, verification, ...) exposes its own
APIRouter in a `router.py`, imported and included here. This file
should stay thin — routing/wiring only, no business logic.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="IP Exchange Tool API",
    version="0.1.0",
    debug=settings.debug,
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
# from app.auth.router import router as auth_router
from app.patents.router import router as patents_router
# from app.verification.router import router as verification_router

# app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(patents_router, prefix="/patents", tags=["patents"])
# app.include_router(verification_router, prefix="/verification", tags=["verification"])
