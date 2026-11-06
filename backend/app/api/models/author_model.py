from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from sqlmodel import Field, Relationship, SQLModel

from app.api.models.rsl_project_model import RSLProjectAuthorLink

if TYPE_CHECKING:
    from app.api.models.rsl_project_model import RSLProject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Author(SQLModel, table=True):
    """Modelo que representa un Autor involucrado en proyectos de RSL."""

    __tablename__ = "authors"

    id: int = Field(
        default=None,
        primary_key=True,
        description="Identificador único serial autoincrementable",
    )
    first_name: str = Field(
        nullable=False,
        description="Nombres del autor",
    )
    last_name: str = Field(
        nullable=False,
        description="Apellidos del autor",
    )
    orcid: Optional[str] = Field(
        default=None,
        index=True,
        description="Código identificador ORCID del autor",
    )
    university_affiliation: Optional[str] = Field(
        default=None,
        description="Afiliación universitaria u organización",
    )
    institutional_email: Optional[str] = Field(
        default=None,
        index=True,
        description="Correo electrónico institucional",
    )
    address: Optional[str] = Field(
        default=None,
        description="Dirección física o de contacto",
    )
    dni: Optional[str] = Field(
        default=None,
        index=True,
        description="Documento Nacional de Identidad / Cédula",
    )
    signature_url: Optional[str] = Field(
        default=None,
        description="Ruta o URL del archivo de firma del autor",
    )
    created_at: datetime = Field(
        default_factory=utc_now,
        nullable=False,
        description="Fecha y hora de registro del autor",
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": utc_now},
        nullable=False,
        description="Fecha y hora de última actualización del autor",
    )

    # Relación Muchos a Muchos con RSLProject
    projects: List["RSLProject"] = Relationship(
        back_populates="authors",
        link_model=RSLProjectAuthorLink,
    )
