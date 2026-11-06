"""
Modelo de Base de Datos para la Gestión de Historial de Versiones de Exportación en Word (.docx) del Manuscrito RSL.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
import uuid
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.rsl_project_model import RSLProject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExportStatus(str, Enum):
    """Estados del proceso de generación del manuscrito Word."""

    PENDING = "PENDING"
    GENERATING = "GENERATING"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"


class RSLExportVersion(SQLModel, table=True):
    """
    Entidad que administra cada versión exportada en formato Word (.docx) del informe RSL.
    Conserva la trazabilidad de versiones (V1, V2, V3...), la ruta en disco, tamaño y hash de integridad.
    """

    __tablename__ = "rsl_export_versions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único UUID v4 de la versión de exportación",
    )

    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
        description="ID del proyecto RSL exportado",
    )

    version_number: int = Field(
        default=1,
        index=True,
        description="Número de versión incremental (1, 2, 3...)",
    )

    version_label: str = Field(
        default="V1",
        description="Etiqueta visible de versión (ej. V1, V2, V3)",
    )

    file_path: str = Field(
        nullable=False,
        description="Ruta absoluta al archivo .docx en el almacenamiento del servidor",
    )

    file_name: str = Field(
        nullable=False,
        description="Nombre del archivo exportado (ej. Manuscrito_RSL_V1.docx)",
    )

    file_size_bytes: Optional[int] = Field(
        default=None,
        description="Tamaño en bytes del archivo .docx generado",
    )

    sha256_checksum: Optional[str] = Field(
        default=None,
        description="Hash SHA-256 de integridad del archivo",
    )

    export_status: ExportStatus = Field(
        default=ExportStatus.PENDING,
        index=True,
        description="Estado actual de la generación de la versión",
    )

    error_message: Optional[str] = Field(
        default=None,
        description="Detalle del error en caso de que la exportación falle",
    )

    created_at: datetime = Field(default_factory=utc_now, nullable=False)

    # Relación de SQLModel con el proyecto RSL
    project: Optional["RSLProject"] = Relationship()
