"""add matrix column ai settings

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-09 11:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "matrix_column_ai_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("column_name", sa.String(), nullable=False),
        sa.Column("include_in_ai", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["rsl_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "column_name",
            name="uq_matrix_column_ai_settings_project_column",
        ),
    )
    op.create_index(
        op.f("ix_matrix_column_ai_settings_project_id"),
        "matrix_column_ai_settings",
        ["project_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_matrix_column_ai_settings_project_id"),
        table_name="matrix_column_ai_settings",
    )
    op.drop_table("matrix_column_ai_settings")
