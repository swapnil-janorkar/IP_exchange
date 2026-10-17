"""
Auth router — /auth prefix set in app/main.py (not here to avoid double-prefix).

Endpoints
---------
POST /auth/register         — create account
POST /auth/login            — get access + refresh token pair
POST /auth/refresh          — rotate refresh token
POST /auth/logout           — revoke current refresh token
POST /auth/change-password  — change password (revokes all sessions)
GET  /auth/me               — current user profile
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.auth.schemas import (
    LoginRequest,
    PasswordChangeRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.auth.service import (
    change_password,
    login_user,
    logout_user,
    refresh_access_token,
    register_user,
)
from app.core.config import settings
from app.core.database import get_db

router = APIRouter(
    prefix="/auth",
    tags=["Auth"],
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        return await register_user(db, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )


@router.post(
    "/login",
    response_model=TokenResponse,
)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    try:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")
        access_token, refresh_token = await login_user(
            db, data.email, data.password,
            ip_address=ip, user_agent=ua,
        )
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.access_token_expire_minutes * 60,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )


@router.post(
    "/refresh",
    response_model=TokenResponse,
)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        access_token, new_refresh = await refresh_access_token(db, body.refresh_token)
        return TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh,
            expires_in=settings.access_token_expire_minutes * 60,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    await logout_user(db, body.refresh_token)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def change_password_endpoint(
    data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await change_password(db, current_user, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.get(
    "/me",
    response_model=UserResponse,
)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user