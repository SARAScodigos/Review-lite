"""Definiciones de columnas dinámicas de la matriz de extracción por proyecto."""
import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


class MatrixCustomColumn(SQLModel, table=True):
    """Columna adicional que debe existir en todas las filas de matriz del proyecto."""

    __tablename__ = "matrix_custom_columns"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_matrix_custom_columns_project_name"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True, nullable=False)
    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
    )
    name: str = Field(nullable=False, index=True)
    position: int = Field(default=0, nullable=False)
