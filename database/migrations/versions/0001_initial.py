"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    user_role = postgresql.ENUM("user", "admin", name="userrole")
    account_status = postgresql.ENUM("pending", "active", "disconnected", "suspended", "rate_limited", name="accountstatus")
    campaign_status = postgresql.ENUM("draft", "active", "paused", "stopped", "completed", name="campaignstatus")
    template_kind = postgresql.ENUM("text", "image", "video", "document", name="templatekind")
    delivery_status = postgresql.ENUM("queued", "sent", "failed", "skipped", name="deliverystatus")
    bind = op.get_bind()
    for enum in [user_role, account_status, campaign_status, template_kind, delivery_status]:
        enum.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(255)),
        sa.Column("full_name", sa.String(255)),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("telegram_id"),
    )
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"])

    op.create_table(
        "accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(64)),
        sa.Column("api_id_encrypted", sa.Text(), nullable=False),
        sa.Column("api_hash_encrypted", sa.Text(), nullable=False),
        sa.Column("session_encrypted", sa.Text()),
        sa.Column("status", account_status, nullable=False),
        sa.Column("hourly_limit", sa.Integer(), nullable=False),
        sa.Column("daily_limit", sa.Integer(), nullable=False),
        sa.Column("flood_wait_until", sa.DateTime(timezone=True)),
        sa.Column("last_health_check_at", sa.DateTime(timezone=True)),
        sa.Column("metadata_json", postgresql.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_accounts_user_id", "accounts", ["user_id"])

    op.create_table(
        "groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("username", sa.String(255)),
        sa.Column("tags", postgresql.JSON(), nullable=False),
        sa.Column("is_excluded", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("account_id", "telegram_chat_id"),
    )
    op.create_index("ix_groups_user_id", "groups", ["user_id"])
    op.create_index("ix_groups_account_id", "groups", ["account_id"])

    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", template_kind, nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("media_file_id", sa.String(512)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_templates_user_id", "templates", ["user_id"])

    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", campaign_status, nullable=False),
        sa.Column("target_tags", postgresql.JSON(), nullable=False),
        sa.Column("schedule", postgresql.JSON(), nullable=False),
        sa.Column("retry_policy", postgresql.JSON(), nullable=False),
        sa.Column("sent_count", sa.Integer(), nullable=False),
        sa.Column("failed_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_campaigns_user_id", "campaigns", ["user_id"])

    op.create_table(
        "delivery_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("groups.id", ondelete="SET NULL")),
        sa.Column("status", delivery_status, nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("flood_wait_seconds", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_delivery_logs_user_id", "delivery_logs", ["user_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("entity_type", sa.String(255), nullable=False),
        sa.Column("entity_id", sa.String(255)),
        sa.Column("metadata_json", postgresql.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    for table in ["audit_logs", "delivery_logs", "campaigns", "templates", "groups", "accounts", "users"]:
        op.drop_table(table)
    for enum_name in ["deliverystatus", "templatekind", "campaignstatus", "accountstatus", "userrole"]:
        postgresql.ENUM(name=enum_name).drop(op.get_bind(), checkfirst=True)
