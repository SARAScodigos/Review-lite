"""create rsl_export_versions table

Revision ID: f6a1b2c3d4e5
Revises: e5f6a1b2c3d4
Create Date: 2026-08-09 10:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'f6a1b2c3d4e5'
down_revision: Union[str, None] = 'e5f6a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'rsl_export_versions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('project_id', sa.Uuid(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('version_label', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('file_path', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('file_name', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('sha256_checksum', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('export_status', sa.Enum('PENDING', 'GENERATING', 'COMPLETED', 'ERROR', name='exportstatus'), nullable=False),
        sa.Column('error_message', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['rsl_projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_rsl_export_versions_export_status'), 'rsl_export_versions', ['export_status'], unique=False)
    op.create_index(op.f('ix_rsl_export_versions_project_id'), 'rsl_export_versions', ['project_id'], unique=False)
    op.create_index(op.f('ix_rsl_export_versions_version_number'), 'rsl_export_versions', ['version_number'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_rsl_export_versions_version_number'), table_name='rsl_export_versions')
    op.drop_index(op.f('ix_rsl_export_versions_project_id'), table_name='rsl_export_versions')
    op.drop_index(op.f('ix_rsl_export_versions_export_status'), table_name='rsl_export_versions')
    op.drop_table('rsl_export_versions')
    op.execute("DROP TYPE exportstatus")
