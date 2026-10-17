"""
Auth business logic: registration, login, token refresh, password change.

Design notes
------------
* refresh_token is a cryptographically random 32-byte hex string.
  Only the SHA-256 hash is stored in the DB.
* Access tokens are short-lived (30 min by default).
* Refresh tokens are long-lived (7 days by default) and can be revoked.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.refresh_token_models import RefreshToken
from app.auth.schemas import PasswordChangeRequest, RegisterRequest
from app.auth.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.core.config import settings


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _generate_refresh_token() -> str:
    return secrets.token_hex(32)


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------


async def register_user(
    db: AsyncSession,
    data: RegisterRequest,
) -> User:
    # Check whether the email is already registered
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise ValueError("Email already registered")

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        full_name=data.full_name,
        phone=data.phone,
        date_of_birth=data.date_of_birth,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


async def login_user(
    db: AsyncSession,
    email: str,
    password: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, str]:
    """
    Returns (access_token, refresh_token) on success.
    Raises ValueError for invalid credentials or inactive account.
    """
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        raise ValueError("Invalid email or password")

    if not user.is_active:
        raise ValueError("User account is inactive")

    access_token = create_access_token(user_id=user.id, role=user.role.value)

    raw_refresh = _generate_refresh_token()
    refresh_expires = datetime.now(timezone.utc) + timedelta(
        days=getattr(settings, "refresh_token_expire_days", 7)
    )

    db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=_hash_token(raw_refresh),
        expires_at=refresh_expires,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(db_refresh)
    await db.commit()

    return access_token, raw_refresh


# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------


async def refresh_access_token(
    db: AsyncSession,
    raw_refresh_token: str,
) -> tuple[str, str]:
    """
    Validates the refresh token, rotates it (old one revoked, new one issued),
    and returns (new_access_token, new_refresh_token).
    """
    token_hash = _hash_token(raw_refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    rt = result.scalar_one_or_none()

    if rt is None or rt.is_revoked:
        raise ValueError("Invalid or revoked refresh token")

    if rt.expires_at < datetime.now(timezone.utc):
        raise ValueError("Refresh token has expired")

    # Revoke old token
    rt.is_revoked = True
    await db.flush()

    # Load user
    user_result = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.is_active:
        raise ValueError("User account not found or inactive")

    # Mint new tokens
    new_access = create_access_token(user_id=user.id, role=user.role.value)
    new_raw_refresh = _generate_refresh_token()
    new_expires = datetime.now(timezone.utc) + timedelta(
        days=getattr(settings, "refresh_token_expire_days", 7)
    )

    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=_hash_token(new_raw_refresh),
        expires_at=new_expires,
        ip_address=rt.ip_address,
        user_agent=rt.user_agent,
    )
    db.add(new_rt)
    await db.commit()

    return new_access, new_raw_refresh


# ---------------------------------------------------------------------------
# Password change
# ---------------------------------------------------------------------------


async def change_password(
    db: AsyncSession,
    user: User,
    data: PasswordChangeRequest,
) -> None:
    if not verify_password(data.current_password, user.password_hash):
        raise ValueError("Current password is incorrect")

    user.password_hash = hash_password(data.new_password)

    # Revoke all refresh tokens for this user (force re-login on all devices)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.is_revoked == False,  # noqa: E712
        )
    )
    for rt in result.scalars().all():
        rt.is_revoked = True

    await db.commit()


# ---------------------------------------------------------------------------
# Logout (revoke a single refresh token)
# ---------------------------------------------------------------------------


async def logout_user(db: AsyncSession, raw_refresh_token: str) -> None:
    token_hash = _hash_token(raw_refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    rt = result.scalar_one_or_none()
    if rt and not rt.is_revoked:
        rt.is_revoked = True
        await db.commit()