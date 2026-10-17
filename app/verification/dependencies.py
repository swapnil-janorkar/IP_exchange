"""
Admin-only access check for Verification endpoints.

Delegates to the centralised RBAC module in app/auth/rbac.py.
Import `require_admin` from here to keep existing router imports intact.
"""

from app.auth.rbac import require_admin  # noqa: F401  re-exported for routers
