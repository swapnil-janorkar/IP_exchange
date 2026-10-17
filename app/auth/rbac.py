"""
RBAC dependency factories and guards.

Usage in routers
----------------
    from app.auth.rbac import require_role, require_roles, require_verified

    # Single role
    @router.post("/submit")
    async def submit(user=Depends(require_role(UserRole.INNOVATOR))): ...

    # Any of several roles
    @router.get("/dashboard")
    async def dashboard(user=Depends(require_roles(UserRole.ADMIN, UserRole.ORGANISATION))): ...

    # Verified account only
    @router.post("/publish")
    async def publish(user=Depends(require_verified())): ...

Design
------
* All guards delegate to `get_current_user` so JWT validation happens
  exactly once per request.
* `require_role` / `require_roles` are *factory* functions that return
  FastAPI-compatible async callables — this avoids duplicating the same
  permission check in every router.
"""

from collections.abc import Callable
from typing import Any

from fastapi import Depends, HTTPException, status

from app.auth.dependencies import get_current_user
from app.auth.models import User, UserRole


def require_role(role: UserRole) -> Callable[..., Any]:
    """Return a dependency that passes only if the current user has *exactly* `role`."""

    async def guard(user: User = Depends(get_current_user)) -> User:
        if user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role '{role.value}'. Your role: '{user.role.value}'.",
            )
        return user

    return guard


def require_roles(*roles: UserRole) -> Callable[..., Any]:
    """Return a dependency that passes if the current user has *any* of the listed roles."""

    role_set = set(roles)

    async def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in role_set:
            allowed = ", ".join(r.value for r in roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of [{allowed}]. Your role: '{user.role.value}'.",
            )
        return user

    return guard


def require_verified() -> Callable[..., Any]:
    """Return a dependency that passes only if the user's email is verified."""

    async def guard(user: User = Depends(get_current_user)) -> User:
        if not user.is_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email verification required to perform this action.",
            )
        return user

    return guard


def require_active() -> Callable[..., Any]:
    """Return a dependency that passes only if the user's account is active."""

    async def guard(user: User = Depends(get_current_user)) -> User:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated. Contact support.",
            )
        return user

    return guard


# ---------------------------------------------------------------------------
# Pre-built convenience shorthands (import directly for common patterns)
# ---------------------------------------------------------------------------

require_admin = require_role(UserRole.ADMIN)
require_innovator = require_role(UserRole.INNOVATOR)
require_organisation = require_role(UserRole.ORGANISATION)
require_admin_or_org = require_roles(UserRole.ADMIN, UserRole.ORGANISATION)
