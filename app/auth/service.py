from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.schemas import RegisterRequest
from app.auth.security import (
    create_access_token,
    hash_password,
    verify_password,
)


async def register_user(
    db: AsyncSession,
    data: RegisterRequest,
) -> User:
    # Check whether the email is already registered
    result = await db.execute(
        select(User).where(User.email == data.email)
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise ValueError("Email already registered")

    # Create user with hashed password
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


async def login_user(
    db: AsyncSession,
    email: str,
    password: str,
) -> str:
    result = await db.execute(
        select(User).where(User.email == email)
    )

    user = result.scalar_one_or_none()

    if not user:
        raise ValueError("Invalid email or password")

    if not verify_password(password, user.password_hash):
        raise ValueError("Invalid email or password")

    if not user.is_active:
        raise ValueError("User account is inactive")

    return create_access_token(
        user_id=user.id,
        role=user.role.value,
    )