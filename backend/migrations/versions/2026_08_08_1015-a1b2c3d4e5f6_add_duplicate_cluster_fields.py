"""add duplicate cluster fields to screening_decisions and AWAITING_DUPLICATE_REVIEW to processstatus

Revision ID: a1b2c3d4e5f6
Revises: 9939ebebaa5a
Create Date: 2026-08-08 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '9939ebebaa5a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Crear enum duplicatereviewstatus
    duplicatereviewstatus = sa.Enum(
        'NOT_APPLICABLE',
        'AUTO_CONFIRMED',
        'PENDING_HUMAN_REVIEW',
        'HUMAN_RESOLVED_DUPLICATE',
        'HUMAN_RESOLVED_UNIQUE',
        name='duplicatereviewstatus'
    )
    duplicatereviewstatus.create(op.get_bind(), checkfirst=True)

    # Añadir AWAITING_DUPLICATE_REVIEW a processstatus
    op.execute("ALTER TYPE processstatus ADD VALUE IF NOT EXISTS 'AWAITING_DUPLICATE_REVIEW'")

    # Añadir columnas a screening_decisions
    op.add_column('screening_decisions', sa.Column('duplicate_cluster_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('screening_decisions', sa.Column('similarity_score', sa.Float(), nullable=True))
    op.add_column('screening_decisions', sa.Column('match_reason', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column(
        'screening_decisions',
        sa.Column(
            'duplicate_review_status',
            sa.Enum(
                'NOT_APPLICABLE',
                'AUTO_CONFIRMED',
                'PENDING_HUMAN_REVIEW',
                'HUMAN_RESOLVED_DUPLICATE',
                'HUMAN_RESOLVED_UNIQUE',
                name='duplicatereviewstatus'
            ),
            nullable=False,
            server_default='NOT_APPLICABLE'
        )
    )

    # Crear índices
    op.create_index(op.f('ix_screening_decisions_duplicate_cluster_id'), 'screening_decisions', ['duplicate_cluster_id'], unique=False)
    op.create_index(op.f('ix_screening_decisions_duplicate_review_status'), 'screening_decisions', ['duplicate_review_status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_screening_decisions_duplicate_review_status'), table_name='screening_decisions')
    op.drop_index(op.f('ix_screening_decisions_duplicate_cluster_id'), table_name='screening_decisions')
    op.drop_column('screening_decisions', 'duplicate_review_status')
    op.drop_column('screening_decisions', 'match_reason')
    op.drop_column('screening_decisions', 'similarity_score')
    op.drop_column('screening_decisions', 'duplicate_cluster_id')

    sa.Enum(name='duplicatereviewstatus').drop(op.get_bind(), checkfirst=True)
