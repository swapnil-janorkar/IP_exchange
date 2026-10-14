from pydantic import BaseModel, Field


class RejectRequest(BaseModel):
    """Body for POST /verification/{id}/reject — a reason is mandatory, not optional."""

    reason: str = Field(min_length=5, description="Shown to the owner so they know what to fix")
