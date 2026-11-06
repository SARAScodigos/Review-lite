"""create rsl_synthesis_sections table

Revision ID: e5f6a1b2c3d4
Revises: d4e5f6a1b2c3
Create Date: 2026-08-09 08:27:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'e5f6a1b2c3d4'
down_revision: Union[str, None] = 'd4e5f6a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'rsl_synthesis_sections',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('project_id', sa.Uuid(), nullable=False),
        sa.Column('section_type', sa.Enum('INTRODUCTION', 'THEORETICAL_FRAMEWORK', 'RESULTS_OBJECTIVE', 'METHODOLOGY_PRISMA', 'DISCUSSION', 'CONCLUSIONS', name='synthesissectiontype'), nullable=False),
        sa.Column('status_writing', sa.Enum('SELECTING_IDS', 'TRIMER_COLUMNS', 'WRITING_BY_AI', 'ERROR', 'PENDING', 'COMPLETED', name='statuswriting'), nullable=False),
        sa.Column('objective_title', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('objective_description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=False),
        sa.Column('candidate_article_ids', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('selection_justifications', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('trimmed_columns_used', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('generated_table', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
        sa.Column('generated_draft', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('custom_prompt_instructions', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('is_confirmed', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['rsl_projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_rsl_synthesis_sections_order_index'), 'rsl_synthesis_sections', ['order_index'], unique=False)
    op.create_index(op.f('ix_rsl_synthesis_sections_project_id'), 'rsl_synthesis_sections', ['project_id'], unique=False)
    op.create_index(op.f('ix_rsl_synthesis_sections_section_type'), 'rsl_synthesis_sections', ['section_type'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_rsl_synthesis_sections_section_type'), table_name='rsl_synthesis_sections')
    op.drop_index(op.f('ix_rsl_synthesis_sections_project_id'), table_name='rsl_synthesis_sections')
    op.drop_index(op.f('ix_rsl_synthesis_sections_order_index'), table_name='rsl_synthesis_sections')
    op.drop_table('rsl_synthesis_sections')
    op.execute("DROP TYPE synthesissectiontype")
    op.execute("DROP TYPE statuswriting")
