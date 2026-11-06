"""
Modelo de Base de Datos SQLModel para los Archivos PDF de Artículos Científicos.
Almacena el estado de descarga automatizada (Open Access), rutas físicas en disco,
sumas de verificación SHA-256 y metadatos para la subida manual directa por el investigador.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
import uuid
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.extracted_record_model import ExtractedRecord
    from app.api.models.rsl_project_model import RSLProject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PDFDownloadStatus(str, Enum):
    PENDING_AUTO_DOWNLOAD = "PENDING_AUTO_DOWNLOAD"
    DOWNLOADING = "DOWNLOADING"
    DOWNLOADED = "DOWNLOADED"
    PENDING_MANUAL_UPLOAD = "PENDING_MANUAL_UPLOAD"
    MANUALLY_UPLOADED = "MANUALLY_UPLOADED"
    ERROR = "ERROR"


class ArticlePDF(SQLModel, table=True):
    """
    Entidad que administra el archivo PDF físico de un artículo científico en disco.
    Soporta tanto la descarga automatizada por DOI/URL como la subida manual directa por el investigador.
    """

    __tablename__ = "article_pdfs"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único del registro de PDF",
    )
    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
        description="ID del proyecto RSL al que pertenece el PDF",
    )
    record_id: uuid.UUID = Field(
        foreign_key="extracted_records.id",
        nullable=False,
        unique=True,
        ondelete="CASCADE",
        index=True,
        description="ID del artículo extraído evaluado (Relación 1 a 1)",
    )

    # Estado y Trazabilidad de Descarga
    download_status: PDFDownloadStatus = Field(
        default=PDFDownloadStatus.PENDING_AUTO_DOWNLOAD,
        index=True,
        description="Estado actual: PENDING_AUTO_DOWNLOAD, DOWNLOADING, DOWNLOADED, NOT_FOUND, MANUALLY_UPLOADED, ERROR",
    )
    file_path: Optional[str] = Field(
        default=None,
        description="Ruta física donde está almacenado el archivo PDF en disco (ej. app/data/pdfs/{project_id}/{record_id}.pdf)",
    )
    download_source: Optional[str] = Field(
        default=None,
        description="Fuente de obtención: Unpaywall API, Semantic Scholar API, CrossRef API, Direct URL, MANUAL_USER_UPLOAD",
    )
    file_size_bytes: Optional[int] = Field(
        default=None,
        description="Tamaño real del archivo PDF descargado o subido en bytes",
    )
    sha256_checksum: Optional[str] = Field(
        default=None,
        description="Suma de verificación SHA-256 del binario PDF para garantizar su integridad",
    )
    pdf_url: Optional[str] = Field(
        default=None,
        description="URL de origen desde la cual se descargó el PDF en acceso abierto",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Mensaje explicativo si la descarga automática de acceso abierto no encontró el PDF",
    )
    is_manually_uploaded: bool = Field(
        default=False,
        description="Indica si el archivo PDF fue subido manualmente por el investigador en la interfaz",
    )

    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now}, nullable=False)

    # Relaciones
    project: Optional["RSLProject"] = Relationship()
    record: Optional["ExtractedRecord"] = Relationship(back_populates="pdf")
