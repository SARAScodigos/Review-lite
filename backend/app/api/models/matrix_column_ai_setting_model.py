"""Preferencias de inclusión de columnas de matriz en extracciones por IA."""
import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class MatrixColumnAISetting(SQLModel, table=True):
    __tablename__ = "matrix_column_ai_settings"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "column_name",
            name="uq_matrix_column_ai_settings_project_column",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
    )
    column_name: str = Field(nullable=False)
    include_in_ai: bool = Field(default=True, nullable=False)
