"""
Modelo de Base de Datos para la Matriz de Extracción Dinámica Desacoplada (Hito 4).
Utiliza una columna JSONB flexible para almacenar las 18 columnas estándar del proyecto RSL
junto con cualquier variable personalizada, soportando tanto la generación por IA como la importación Excel.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, Optional
import uuid
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.api.models.extracted_record_model import ExtractedRecord
    from app.api.models.rsl_project_model import RSLProject


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExtractionSourceType(str, Enum):
    AI_GENERATED = "AI_GENERATED"
    MANUAL_SCREENING = "MANUAL_SCREENING"
    USER_IMPORTED = "USER_IMPORTED"


class ExtractionReviewStatus(str, Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"


class ExtractedMatrixRow(SQLModel, table=True):
    """
    Entidad que administra cada fila de la Matriz de Extracción RSL en formato JSONB.
    Almacena las 18 variables de estudio más variables dinámicas personalizadas.
    Permite desacoplamiento completo (record_id es opcional para filas importadas directamente de Excel/CSV).
    """

    __tablename__ = "extracted_matrix_rows"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        nullable=False,
        description="Identificador único UUID v4 de la fila de extracción",
    )
    project_id: uuid.UUID = Field(
        foreign_key="rsl_projects.id",
        nullable=False,
        ondelete="CASCADE",
        index=True,
        description="ID del proyecto RSL al que pertenece la matriz",
    )
    record_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="extracted_records.id",
        ondelete="SET NULL",
        index=True,
        description="ID del artículo extraído evaluado (OPCIONAL: NULL si fue importado directamente desde Excel/CSV)",
    )

    source_type: ExtractionSourceType = Field(
        default=ExtractionSourceType.AI_GENERATED,
        index=True,
        description="Origen de la fila: AI_GENERATED, MANUAL_SCREENING o USER_IMPORTED",
    )
    article_custom_id: Optional[str] = Field(
        default=None,
        index=True,
        description="Identificador compuesto del artículo (5 letras de título + 4 de autores)",
    )

    # Almacenamiento JSONB de la matriz de variables
    extraction_data: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False),
        description="Diccionario JSONB con los campos de extracción (18 predeterminados + dinámicos)",
    )

    confidence_score: Optional[float] = Field(
        default=None,
        description="Grado de certeza del modelo de IA entre 0.0 y 1.0",
    )
    review_status: ExtractionReviewStatus = Field(
        default=ExtractionReviewStatus.DRAFT,
        index=True,
        description="Estado de la revisión humana: DRAFT o CONFIRMED",
    )

    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, sa_column_kwargs={"onupdate": utc_now}, nullable=False)

    # Relaciones
    project: Optional["RSLProject"] = Relationship()
    record: Optional["ExtractedRecord"] = Relationship()
