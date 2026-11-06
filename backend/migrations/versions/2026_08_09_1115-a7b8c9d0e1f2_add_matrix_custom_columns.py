"""add matrix custom columns

Revision ID: a7b8c9d0e1f2
Revises: f6a1b2c3d4e5
Create Date: 2026-08-09 11:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "matrix_custom_columns",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["rsl_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name", name="uq_matrix_custom_columns_project_name"),
    )
    op.create_index(op.f("ix_matrix_custom_columns_project_id"), "matrix_custom_columns", ["project_id"], unique=False)
    op.create_index(op.f("ix_matrix_custom_columns_name"), "matrix_custom_columns", ["name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_matrix_custom_columns_name"), table_name="matrix_custom_columns")
    op.drop_index(op.f("ix_matrix_custom_columns_project_id"), table_name="matrix_custom_columns")
    op.drop_table("matrix_custom_columns")
