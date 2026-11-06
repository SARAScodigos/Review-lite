from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
import uuid

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.author_model import Author
    from app.api.models.search_result_file_model import SearchResultFile
    from app.api.models.screening_model import ScreeningSession


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RSLProjectAuthorLink(SQLModel, table=True):
    """Tabla de enlace Muchos a Muchos entre RSLProject y Author."""

    __tablename__ = "rsl_project_author_link"

    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        primary_key=True,
        ondelete="CASCADE",
    )
    author_id: int = Field(
        foreign_key="authors.id",
        primary_key=True,
        ondelete="CASCADE",
    )


class RSLProject(SQLModel, table=True):
    """Modelo que representa los metadatos de un Proyecto de Revisión Sistemática de la Literatura (RSL)."""

    __tablename__ = "rsl_projects"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único UUID v4 del proyecto RSL",
    )
    title: str = Field(
        index=True,
        nullable=False,
        description="Título principal del proyecto RSL",
    )
    variables: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSONB),
        description="Lista de variables o conceptos clave analizados",
    )
    geographic_scope: Optional[str] = Field(
        default=None,
        description="Espacio o ámbito geográfico delimitado en el estudio",
    )
    extra_metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSONB),
        description="Metadatos adicionales o flexibles en formato JSON",
    )
    created_at: datetime = Field(
        default_factory=utc_now,
        nullable=False,
        description="Fecha y hora de creación del proyecto",
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": utc_now},
        nullable=False,
        description="Fecha y hora de la última actualización del proyecto",
    )

    # Relación Muchos a Muchos con Autores
    authors: List["Author"] = Relationship(
        back_populates="projects",
        link_model=RSLProjectAuthorLink,
    )

    # Relación Uno a Muchos con Archivos de Búsqueda (CSV, RIS, XLS)
    search_files: List["SearchResultFile"] = Relationship(
        back_populates="project",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    # Relación Uno a Uno con la Sesión de Cribado / PRISMA Flow
    screening_session: Optional["ScreeningSession"] = Relationship(
        back_populates="project",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )
