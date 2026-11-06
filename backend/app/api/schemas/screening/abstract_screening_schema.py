"""
Esquemas Pydantic para el Cribado por Abstract asistido por IA (Fase 2 del Hito 2).
Incluye DTOs para solicitudes de ejecución, respuestas del modelo de IA y presentación de resultados a la UI.
"""
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.ai.catalog import DEFAULT_SCREENING_MODEL, DEFAULT_SCREENING_PROVIDER
from app.api.models.screening_model import ScreeningDecisionEnum


class StartAbstractScreeningRequest(BaseModel):
    """Payload para que el usuario inicie el cribado profundo de abstracts con la IA deseada."""

    provider: str = Field(
        default=DEFAULT_SCREENING_PROVIDER,
        example=DEFAULT_SCREENING_PROVIDER,
        description="Proveedor de IA: openai, google, anthropic, deepseek",
    )
    model: str = Field(
        default=DEFAULT_SCREENING_MODEL,
        example=DEFAULT_SCREENING_MODEL,
        description="Modelo soportado según el catálogo",
    )
    temperature: float = Field(
        default=0.2,
        ge=0.0,
        le=1.0,
        description="Temperatura del modelo para controlar la creatividad de la evaluación",
    )
    re_run: bool = Field(
        default=False,
        alias="re_hacer",
        description="Si es True, reinicia y re-evalúa los registros previamente cribados",
    )

    model_config = ConfigDict(populate_by_name=True)


class AbstractAIScreeningOutput(BaseModel):
    """Esquema de salida estructurada que debe devolver el LLM por cada abstract evaluado."""

    decision: ScreeningDecisionEnum = Field(
        ...,
        description="Decisión asignada al artículo basada en su abstract: INCLUDED o EXCLUDED",
    )
    reasoning: str = Field(
        ...,
        description="Explicación detallada de la relevancia del estudio frente a los criterios de inclusión/exclusión",
    )


class AbstractScreeningItemRead(BaseModel):
    """Estructura de respuesta para presentar el resultado del cribado por abstract a la UI."""

    record_id: uuid.UUID
    title: Optional[str] = None
    abstract: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    source_title: Optional[str] = None
    abstract_status: ScreeningDecisionEnum
    abstract_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AbstractScreeningRecordRead(BaseModel):
    """Registro disponible para cribado por abstract, con decisiones de título y abstract."""

    record_id: uuid.UUID
    file_id: uuid.UUID
    database_source: str
    id_article: str
    title: Optional[str] = None
    abstract: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    source_title: Optional[str] = None
    title_status: ScreeningDecisionEnum
    title_reason: Optional[str] = None
    title_overridden: bool = False
    passes_abstract_filter: Optional[bool] = None
    abstract_status: ScreeningDecisionEnum
    abstract_reason: Optional[str] = None
    abstract_overridden: bool = False


class PaginatedAbstractScreeningRecordsResponse(BaseModel):
    """Respuesta paginada para la mesa de trabajo de cribado por abstract."""

    items: List[AbstractScreeningRecordRead]
    total: int
    skip: int
    limit: int
    returned: int
    has_next: bool
    has_previous: bool


class AbstractScreeningMetricsRead(BaseModel):
    """Contadores actuales de los registros que alcanzaron la fase de abstract."""

    total_unique: int
    included_abstract: int
    excluded_abstract: int
    maybe_abstract: int
    by_database_source: List["AbstractScreeningSourceMetricsRead"]


class AbstractScreeningSourceMetricsRead(BaseModel):
    """Contadores de abstract correspondientes a una base de datos de origen."""

    database_source: str
    total_unique: int
    included_abstract: int
    excluded_abstract: int
    maybe_abstract: int
