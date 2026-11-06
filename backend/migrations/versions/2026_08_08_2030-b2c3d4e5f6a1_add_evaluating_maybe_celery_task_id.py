"""add EVALUATING and MAYBE to screeningdecisionenum and celery_task_id to screening_sessions

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-08-08 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Añadir valores a la enumeración PostgreSQL screeningdecisionenum
    op.execute("ALTER TYPE screeningdecisionenum ADD VALUE IF NOT EXISTS 'EVALUATING'")
    op.execute("ALTER TYPE screeningdecisionenum ADD VALUE IF NOT EXISTS 'MAYBE'")

    # Añadir columna celery_task_id a screening_sessions
    op.add_column('screening_sessions', sa.Column('celery_task_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('screening_sessions', 'celery_task_id')
