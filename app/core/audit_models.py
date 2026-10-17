"""
Audit log model — tracks every security-relevant action across the platform.

Owned by: Core / Auth track.

Design notes
------------
* `actor_id` is nullable so system-generated events (cron, background jobs)
  can be logged without a user.
* `resource_type` + `resource_id` identify the entity that was acted upon
  (e.g. "patent", 42).
* `ip_address` is stored as a string (IPv4/IPv6) for simplicity; use
  inet_aton / inet_pton at the application level if you need range queries.
* This table is append-only. Never UPDATE or DELETE rows from it.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Null for system/background events
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # e.g. "user", "patent", "deal", "signature", "service_request"
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # PK of the resource (null for collection-level events like "list patents")
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # e.g. "login", "register", "submit_patent", "approve_patent", "sign_document"
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # "success" | "failure" | "error"
    outcome: Mapped[str] = mapped_column(String(20), nullable=False, default="success")

    # Optional JSON payload with before/after state or error detail
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )
