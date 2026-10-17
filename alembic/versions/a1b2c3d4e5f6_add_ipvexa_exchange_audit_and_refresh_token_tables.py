"""add ipvexa exchange audit and refresh token tables

Revision ID: a1b2c3d4e5f6
Revises: 3edf95aa78a4
Create Date: 2026-10-14 18:00:00.000000

Adds:
  - users: full_name, phone, date_of_birth columns
  - refresh_tokens table
  - audit_logs table
  - ipr_records table
  - services table
  - service_requests table
  - jobs table
  - work_reports table
  - documents table
  - embeddings table
  - deals table
  - signatures table
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "3edf95aa78a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # Extend users table with profile columns
    # ------------------------------------------------------------------
    op.add_column("users", sa.Column("full_name", sa.String(length=150), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))

    # ------------------------------------------------------------------
    # refresh_tokens
    # ------------------------------------------------------------------
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_refresh_tokens_user_id"), "refresh_tokens", ["user_id"])
    op.create_index(
        op.f("ix_refresh_tokens_token_hash"),
        "refresh_tokens",
        ["token_hash"],
        unique=True,
    )

    # ------------------------------------------------------------------
    # audit_logs
    # ------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.Column("resource_type", sa.String(length=100), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("outcome", sa.String(length=20), nullable=False, server_default="success"),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_actor_id"), "audit_logs", ["actor_id"])
    op.create_index(op.f("ix_audit_logs_resource_type"), "audit_logs", ["resource_type"])
    op.create_index(op.f("ix_audit_logs_resource_id"), "audit_logs", ["resource_id"])
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"])
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"])

    # ------------------------------------------------------------------
    # ipr_records
    # ------------------------------------------------------------------
    op.create_table(
        "ipr_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("ip_type", sa.String(length=100), nullable=False, server_default="patent"),
        sa.Column(
            "status",
            sa.Enum(
                "IDEA",
                "UNDER_REVIEW",
                "ACCEPTED",
                "REJECTED",
                "COMPLETED",
                name="ipr_record_status",
            ),
            nullable=False,
            server_default="IDEA",
        ),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ipr_records_owner_id"), "ipr_records", ["owner_id"])
    op.create_index(op.f("ix_ipr_records_status"), "ipr_records", ["status"])

    # ------------------------------------------------------------------
    # services
    # ------------------------------------------------------------------
    op.create_table(
        "services",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "PATENT_FILING",
                "TRADEMARK",
                "COPYRIGHT",
                "TRADE_SECRET",
                "LICENSING",
                "CONSULTING",
                "OTHER",
                name="service_category",
            ),
            nullable=False,
        ),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["provider_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_services_provider_id"), "services", ["provider_id"])
    op.create_index(op.f("ix_services_category"), "services", ["category"])

    # ------------------------------------------------------------------
    # service_requests
    # ------------------------------------------------------------------
    op.create_table(
        "service_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requester_id", sa.Integer(), nullable=False),
        sa.Column("ipr_record_id", sa.Integer(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "ACCEPTED",
                "IN_PROGRESS",
                "COMPLETED",
                "CANCELLED",
                name="service_request_status",
            ),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["ipr_record_id"], ["ipr_records.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requester_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_service_requests_requester_id"), "service_requests", ["requester_id"])
    op.create_index(op.f("ix_service_requests_ipr_record_id"), "service_requests", ["ipr_record_id"])
    op.create_index(op.f("ix_service_requests_service_id"), "service_requests", ["service_id"])
    op.create_index(op.f("ix_service_requests_status"), "service_requests", ["status"])

    # ------------------------------------------------------------------
    # jobs
    # ------------------------------------------------------------------
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("service_request_id", sa.Integer(), nullable=False),
        sa.Column("assigned_to", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "OPEN",
                "IN_PROGRESS",
                "UNDER_REVIEW",
                "CLOSED",
                "CANCELLED",
                name="job_status",
            ),
            nullable=False,
            server_default="OPEN",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["service_request_id"], ["service_requests.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("service_request_id"),
    )
    op.create_index(op.f("ix_jobs_assigned_to"), "jobs", ["assigned_to"])
    op.create_index(op.f("ix_jobs_status"), "jobs", ["status"])

    # ------------------------------------------------------------------
    # work_reports
    # ------------------------------------------------------------------
    op.create_table(
        "work_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("document_url", sa.String(length=512), nullable=True),
        sa.Column("document_mime_type", sa.String(length=100), nullable=True),
        sa.Column("document_size_bytes", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_work_reports_job_id"), "work_reports", ["job_id"])

    # ------------------------------------------------------------------
    # deals  (must be created before documents due to FK)
    # ------------------------------------------------------------------
    op.create_table(
        "deals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patent_id", sa.Integer(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("buyer_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "INITIATED",
                "NEGOTIATING",
                "PENDING_SIGNATURE",
                "SIGNED",
                "COMPLETED",
                "CANCELLED",
                name="deal_status",
            ),
            nullable=False,
            server_default="INITIATED",
        ),
        sa.Column("price_cents", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["patent_id"], ["patents.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["seller_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_deals_patent_id"), "deals", ["patent_id"])
    op.create_index(op.f("ix_deals_seller_id"), "deals", ["seller_id"])
    op.create_index(op.f("ix_deals_buyer_id"), "deals", ["buyer_id"])
    op.create_index(op.f("ix_deals_status"), "deals", ["status"])

    # ------------------------------------------------------------------
    # documents
    # ------------------------------------------------------------------
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("patent_id", sa.Integer(), nullable=True),
        sa.Column("deal_id", sa.Integer(), nullable=True),
        sa.Column(
            "doc_type",
            sa.Enum(
                "PATENT_PROOF",
                "ASSIGNMENT",
                "LICENSE",
                "NDA",
                "WORK_PRODUCT",
                "OTHER",
                name="document_type",
            ),
            nullable=False,
        ),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_url", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["patent_id"], ["patents.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_documents_owner_id"), "documents", ["owner_id"])
    op.create_index(op.f("ix_documents_patent_id"), "documents", ["patent_id"])
    op.create_index(op.f("ix_documents_deal_id"), "documents", ["deal_id"])
    op.create_index(op.f("ix_documents_doc_type"), "documents", ["doc_type"])

    # ------------------------------------------------------------------
    # embeddings
    # ------------------------------------------------------------------
    op.create_table(
        "embeddings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column(
            "model_name",
            sa.String(length=100),
            nullable=False,
            server_default="text-embedding-3-small",
        ),
        sa.Column("vector_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_embeddings_source_type"), "embeddings", ["source_type"])
    op.create_index(op.f("ix_embeddings_source_id"), "embeddings", ["source_id"])

    # ------------------------------------------------------------------
    # signatures
    # ------------------------------------------------------------------
    op.create_table(
        "signatures",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("deal_id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("signer_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "SIGNED", "REJECTED", name="signature_status"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("document_hash", sa.String(length=64), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["signer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_signatures_deal_id"), "signatures", ["deal_id"])
    op.create_index(op.f("ix_signatures_document_id"), "signatures", ["document_id"])
    op.create_index(op.f("ix_signatures_signer_id"), "signatures", ["signer_id"])


def downgrade() -> None:
    op.drop_table("signatures")
    op.drop_table("embeddings")
    op.drop_table("documents")
    op.drop_table("deals")
    op.drop_table("work_reports")
    op.drop_table("jobs")
    op.drop_table("service_requests")
    op.drop_table("services")
    op.drop_table("ipr_records")
    op.drop_table("audit_logs")
    op.drop_index(op.f("ix_refresh_tokens_token_hash"), table_name="refresh_tokens")
    op.drop_index(op.f("ix_refresh_tokens_user_id"), table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_column("users", "date_of_birth")
    op.drop_column("users", "phone")
    op.drop_column("users", "full_name")

    # Drop enums
    for enum_name in (
        "signature_status",
        "document_type",
        "deal_status",
        "job_status",
        "service_request_status",
        "service_category",
        "ipr_record_status",
    ):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
