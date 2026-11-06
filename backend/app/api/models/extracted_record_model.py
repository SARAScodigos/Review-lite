from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Optional
import uuid

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.article_pdf_model import ArticlePDF
    from app.api.models.search_result_file_model import SearchResultFile


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExtractedRecord(SQLModel, table=True):
    """
    Modelo que representa cada artículo/registro individual extraído de los archivos de búsqueda (CSV, XLS, XLSX).
    Combina campos estandarizados comunes indexados con un objeto JSONB flexible para almacenar la totalidad
    de las columnas originales de cualquier base de datos (Scopus, WOS, IEEE, PubMed).
    """

    __tablename__ = "extracted_records"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único UUID v4 del registro extraído",
    )
    file_id: uuid.UUID = Field(
        foreign_key="search_result_files.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
        description="ID del archivo de búsqueda de origen",
    )

    # Campos normalizados clave (indexados para búsquedas y filtrados rápidos)
    title: Optional[str] = Field(
        default=None,
        index=True,
        description="Título estandarizado del artículo/publicación",
    )
    authors: Optional[str] = Field(
        default=None,
        description="Cadena con los nombres de los autores",
    )
    publication_year: Optional[int] = Field(
        default=None,
        index=True,
        description="Año de publicación de la entrada",
    )
    doi: Optional[str] = Field(
        default=None,
        index=True,
        description="Identificador de Objeto Digital (DOI) para desduplicación",
    )
    source_title: Optional[str] = Field(
        default=None,
        description="Título de la revista, conferencia o libro fuente",
    )
    abstract: Optional[str] = Field(
        default=None,
        description="Resumen o Abstract del artículo",
    )

    # Almacenamiento completo e íntegro de la fila original en formato JSONB
    raw_data: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
        description="Diccionario JSONB con la totalidad de columnas y valores originales del archivo sin pérdida de información",
    )

    created_at: datetime = Field(
        default_factory=utc_now,
        nullable=False,
        description="Fecha y hora en que se extrajo e insertó el registro",
    )
    updated_at: datetime = Field(
        default_factory=utc_now,
        sa_column_kwargs={"onupdate": utc_now},
        nullable=False,
        description="Fecha y hora de última modificación del registro",
    )

    # Relación Muchos a Uno con SearchResultFile
    file: Optional["SearchResultFile"] = Relationship(back_populates="extracted_records")

    # Relación Uno a Uno con ArticlePDF
    pdf: Optional["ArticlePDF"] = Relationship(
        back_populates="record",
        sa_relationship_kwargs={"uselist": False, "cascade": "all, delete-orphan"},
    )
