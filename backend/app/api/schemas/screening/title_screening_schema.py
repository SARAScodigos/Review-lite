"""
Esquemas Pydantic para el Cribado por Título asistido por IA (Fase 1 del Hito 2).
Incluye DTOs para solicitudes de ejecución, respuestas del modelo de IA y presentación de resultados a la UI.
"""
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.ai.catalog import DEFAULT_SCREENING_MODEL, DEFAULT_SCREENING_PROVIDER
from app.api.models.screening_model import DuplicateReviewStatus, ScreeningDecisionEnum


class StartTitleScreeningRequest(BaseModel):
    """Payload para que el usuario inicie el cribado masivo de títulos indicando la IA deseada."""

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


class TitleAIScreeningOutput(BaseModel):
    """Esquema de salida estructurada que debe devolver el LLM por cada título evaluado."""

    decision: ScreeningDecisionEnum = Field(
        ...,
        description="Decisión asignada al artículo basada en su título: INCLUDED, EXCLUDED o MAYBE",
    )
    reasoning: str = Field(
        ...,
        description="Justificación concisa de 1 o 2 oraciones explicando por qué cumple o incumple los criterios",
    )


class TitleScreeningItemRead(BaseModel):
    """Estructura de respuesta para presentar el resultado del cribado por título de un artículo a la UI."""

    record_id: uuid.UUID
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    source_title: Optional[str] = None
    title_status: ScreeningDecisionEnum
    title_reason: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TitleScreeningRecordRead(BaseModel):
    """Registro disponible para cribado por título, sin abstract, con estado actual editable."""

    record_id: uuid.UUID
    file_id: uuid.UUID
    database_source: str
    id_article: str
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    source_title: Optional[str] = None
    is_duplicate: bool
    duplicate_review_status: DuplicateReviewStatus
    passes_title_filter: Optional[bool] = None
    title_status: ScreeningDecisionEnum
    title_reason: Optional[str] = None
    title_overridden: bool = False


class PaginatedTitleScreeningRecordsResponse(BaseModel):
    """Respuesta paginada para la mesa de trabajo de cribado por título."""

    items: List[TitleScreeningRecordRead]
    total: int
    skip: int
    limit: int
    returned: int
    has_next: bool
    has_previous: bool


class TitleScreeningMetricsRead(BaseModel):
    """Contadores actuales de registros únicos y decisiones de la fase de título."""

    total_unique: int
    included_title: int
    excluded_title: int
    maybe_title: int
    by_database_source: List["TitleScreeningSourceMetricsRead"]


class TitleScreeningSourceMetricsRead(BaseModel):
    """Contadores de título correspondientes a una base de datos de origen."""

    database_source: str
    total_unique: int
    included_title: int
    excluded_title: int
    maybe_title: int
