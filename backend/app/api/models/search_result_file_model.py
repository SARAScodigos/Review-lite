from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
import uuid
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.extracted_record_model import ExtractedRecord
    from app.api.models.rsl_project_model import RSLProject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SearchResultFile(SQLModel, table=True):
    """Modelo para registrar los archivos de resultados de búsqueda (CSV, RIS, XLS, etc.) exportados de bases de datos como Scopus WOS etc."""

    __tablename__ = "search_result_files"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único UUID v4 del archivo registrado",
    )
    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
        description="ID del proyecto RSL al que pertenece la búsqueda",
    )
    nombre: str = Field(
        nullable=False,
        description="Nombre del archivo referencial",
    )
    file_path: str = Field(
        nullable=False,
        description="Ruta de almacenamiento interno en disco dentro de app/data/search_results/",
    )
    database_source: Optional[str] = Field(
        default=None,
        index=True,
        description="Base de datos científica de origen (ej. Scopus, Web of Science, PubMed, IEEE)",
    )
    search_equation: Optional[str] = Field(
        default=None,
        description="Ecuación de búsqueda específica utilizada para generar este reporte de hallazgos",
    )
    notes: Optional[str] = Field(
        default=None,
        description="Anotaciones u observaciones adicionales sobre la búsqueda o los registros",
    )
    total_records: Optional[int] = Field(
        default=None,
        description="Cantidad total de artículos/registros reportados en el archivo",
    )
    file_type: Optional[str] = Field(
        default=None,
        description="Tipo o formato de archivo (ej. csv, ris, xls, xlsx, bib)",
    )
    created_at: datetime = Field(
        default_factory=utc_now,
        nullable=False,
        description="Fecha y hora de subida/registro del archivo",
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": utc_now},
        nullable=False,
        description="Fecha y hora de última actualización de metadatos",
    )

    # Relación Muchos a Uno con RSLProject
    project: Optional["RSLProject"] = Relationship(back_populates="search_files")

    # Relación Uno a Muchos con Registros Extraídos (ExtractedRecord)
    extracted_records: List["ExtractedRecord"] = Relationship(
        back_populates="file",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
