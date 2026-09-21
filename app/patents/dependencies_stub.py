"""
TEMPORARY stub for the current-user dependency.

The Patents track needs *some* notion of "who's making this request"
to test ownership checks, without waiting on the Auth track to finish
JWT login. This file exists so Patents can build and test in
isolation.

>>> SWAP-OUT INSTRUCTIONS (once Auth track ships app/auth/dependencies.py) <
1. Delete this file.
2. In app/patents/router.py, replace:
       from app.patents.dependencies_stub import get_current_user_stub as get_current_user
   with:
       from app.auth.dependencies import get_current_user
3. Nothing else changes — the return shape (an object with `.id` and
   `.role`) is the same contract get_current_user must satisfy.
"""

from dataclasses import dataclass


@dataclass
class FakeUser:
    id: int
    role: str = "innovator"  # "innovator" | "organisation" | "admin"


def get_current_user_stub() -> FakeUser:
    """
    Hardcoded fake user, id=1, role=innovator. Swap the id/role here
    directly while testing different ownership/role scenarios locally
    — e.g. change role to "admin" to test admin-only behaviour before
    the real verification endpoints exist.
    """
    return FakeUser(id=1, role="innovator")