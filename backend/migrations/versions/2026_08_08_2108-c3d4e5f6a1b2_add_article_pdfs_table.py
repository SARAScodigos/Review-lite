"""create article_pdfs table

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-08-08 21:08:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a1b2'
down_revision: Union[str, None] = 'b2c3d4e5f6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Crear la tabla article_pdfs
    op.create_table(
        'article_pdfs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('project_id', sa.Uuid(), nullable=False),
        sa.Column('record_id', sa.Uuid(), nullable=False),
        sa.Column('download_status', sa.Enum('PENDING_AUTO_DOWNLOAD', 'DOWNLOADING', 'DOWNLOADED', 'PENDING_MANUAL_UPLOAD', 'MANUALLY_UPLOADED', 'ERROR', name='pdfdownloadstatus'), nullable=False),
        sa.Column('file_path', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('download_source', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('sha256_checksum', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('pdf_url', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('error_message', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('is_manually_uploaded', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['rsl_projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['record_id'], ['extracted_records.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_article_pdfs_download_status'), 'article_pdfs', ['download_status'], unique=False)
    op.create_index(op.f('ix_article_pdfs_project_id'), 'article_pdfs', ['project_id'], unique=False)
    op.create_index(op.f('ix_article_pdfs_record_id'), 'article_pdfs', ['record_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_article_pdfs_record_id'), table_name='article_pdfs')
    op.drop_index(op.f('ix_article_pdfs_project_id'), table_name='article_pdfs')
    op.drop_index(op.f('ix_article_pdfs_download_status'), table_name='article_pdfs')
    op.drop_table('article_pdfs')
    op.execute("DROP TYPE pdfdownloadstatus")
