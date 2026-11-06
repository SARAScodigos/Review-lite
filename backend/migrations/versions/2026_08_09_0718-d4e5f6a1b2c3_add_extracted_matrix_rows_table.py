"""create extracted_matrix_rows table

Revision ID: d4e5f6a1b2c3
Revises: c3d4e5f6a1b2
Create Date: 2026-08-09 07:18:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a1b2c3'
down_revision: Union[str, None] = 'c3d4e5f6a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Crear la tabla extracted_matrix_rows
    op.create_table(
        'extracted_matrix_rows',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('project_id', sa.Uuid(), nullable=False),
        sa.Column('record_id', sa.Uuid(), nullable=True),
        sa.Column('source_type', sa.Enum('AI_GENERATED', 'MANUAL_SCREENING', 'USER_IMPORTED', name='extractionsourcetype'), nullable=False),
        sa.Column('article_custom_id', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('extraction_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('review_status', sa.Enum('DRAFT', 'CONFIRMED', name='extractionreviewstatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['rsl_projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['record_id'], ['extracted_records.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_extracted_matrix_rows_article_custom_id'), 'extracted_matrix_rows', ['article_custom_id'], unique=False)
    op.create_index(op.f('ix_extracted_matrix_rows_project_id'), 'extracted_matrix_rows', ['project_id'], unique=False)
    op.create_index(op.f('ix_extracted_matrix_rows_record_id'), 'extracted_matrix_rows', ['record_id'], unique=False)
    op.create_index(op.f('ix_extracted_matrix_rows_review_status'), 'extracted_matrix_rows', ['review_status'], unique=False)
    op.create_index(op.f('ix_extracted_matrix_rows_source_type'), 'extracted_matrix_rows', ['source_type'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_extracted_matrix_rows_source_type'), table_name='extracted_matrix_rows')
    op.drop_index(op.f('ix_extracted_matrix_rows_review_status'), table_name='extracted_matrix_rows')
    op.drop_index(op.f('ix_extracted_matrix_rows_record_id'), table_name='extracted_matrix_rows')
    op.drop_index(op.f('ix_extracted_matrix_rows_project_id'), table_name='extracted_matrix_rows')
    op.drop_index(op.f('ix_extracted_matrix_rows_article_custom_id'), table_name='extracted_matrix_rows')
    op.drop_table('extracted_matrix_rows')
    op.execute("DROP TYPE extractionsourcetype")
    op.execute("DROP TYPE extractionreviewstatus")
