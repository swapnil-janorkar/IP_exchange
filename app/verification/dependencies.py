"""
Admin-only access check for Verification endpoints.

Lives here (not in app/auth/) because right now only Verification
needs it. If Deals or another module later needs the same check,
move this to app/auth/dependencies.py as a shared require_role()
factory — don't duplicate it.
"""

from fastapi import Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.auth.models import User, UserRole


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
