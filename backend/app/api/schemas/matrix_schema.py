"""
Esquemas Pydantic para el módulo de Matriz de Extracción Dinámica JSONB y Cribado a Texto Completo.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.ai.catalog import DEFAULT_SCREENING_MODEL, DEFAULT_SCREENING_PROVIDER
from app.api.models.article_pdf_model import PDFDownloadStatus
from app.api.models.extracted_matrix_model import (
    ExtractionReviewStatus,
    ExtractionSourceType,
)
from app.api.models.screening_model import ScreeningDecisionEnum


class StartMatrixExtractionRequest(BaseModel):
    """Payload para iniciar la extracción masiva de matrices desde PDFs con la IA deseada."""

    provider: str = Field(default=DEFAULT_SCREENING_PROVIDER, example=DEFAULT_SCREENING_PROVIDER, description="openai, google, anthropic, deepseek")
    model: str = Field(default=DEFAULT_SCREENING_MODEL, example=DEFAULT_SCREENING_MODEL, description="Modelo del catálogo")
    temperature: float = Field(default=0.1, ge=0.0, le=1.0, description="Temperatura baja para máxima fidelidad científica")


class ExtractedMatrixRowRead(BaseModel):
    """Esquema de lectura para presentar una fila de la matriz de extracción (18 columnas + dinámicas)."""

    id: uuid.UUID
    project_id: uuid.UUID
    record_id: Optional[uuid.UUID] = None
    source_type: ExtractionSourceType
    article_custom_id: Optional[str] = None
    extraction_data: Dict[str, Any]
    confidence_score: Optional[str] = None
    review_status: ExtractionReviewStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedMatrixRowsResponse(BaseModel):
    """Página de filas de la matriz, incluidas las generadas e importadas."""

    items: List[ExtractedMatrixRowRead]
    total: int
    skip: int
    limit: int
    returned: int
    has_next: bool
    has_previous: bool


class MatrixColumnRead(BaseModel):
    id: Optional[uuid.UUID] = None
    project_id: uuid.UUID
    name: str
    position: int
    is_predefined: bool
    is_ai_extractable: bool
    include_in_ai: bool


class UpdateMatrixColumnAIInclusionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    include_in_ai: bool


class CreateMatrixCustomColumnRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class UpdateMatrixCustomColumnRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    position: Optional[int] = Field(default=None, ge=0)


class UpdateMatrixRowRequest(BaseModel):
    """Payload para permitir la edición manual celda por celda de la matriz JSONB."""

    extraction_data: Dict[str, Any] = Field(..., description="Diccionario completo de la fila editado por el investigador")
    review_status: Optional[ExtractionReviewStatus] = Field(default=ExtractionReviewStatus.CONFIRMED, description="Estado de revisión: DRAFT o CONFIRMED")


class PatchMatrixRowRequest(BaseModel):
    """Cambios parciales sobre las celdas de una fila sin reemplazar el JSONB completo."""

    extraction_data_patch: Dict[str, Any] = Field(default_factory=dict)
    review_status: Optional[ExtractionReviewStatus] = None


class CreateManualMatrixRowRequest(BaseModel):
    """Fila creada directamente por el investigador dentro de la matriz."""

    article_custom_id: Optional[str] = None
    extraction_data: Dict[str, Any] = Field(default_factory=dict)
    review_status: ExtractionReviewStatus = ExtractionReviewStatus.CONFIRMED


class DeleteMatrixRowResponse(BaseModel):
    """Confirmación de eliminación de una fila de matriz."""

    row_id: uuid.UUID
    deleted: bool = True


class MatrixWorkbenchCandidateRead(BaseModel):
    """Artículo controlable en la mesa de extracción y cribado a texto completo."""

    position: int
    record_id: uuid.UUID
    file_id: uuid.UUID
    database_source: str
    article_custom_id: str
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    title_status: ScreeningDecisionEnum
    abstract_status: ScreeningDecisionEnum
    fulltext_status: ScreeningDecisionEnum
    final_decision: ScreeningDecisionEnum
    fulltext_reason: Optional[str] = None
    pdf_download_status: Optional[PDFDownloadStatus] = None
    pdf_file_path: Optional[str] = None
    matrix_row_id: Optional[uuid.UUID] = None
    matrix_review_status: Optional[ExtractionReviewStatus] = None
    can_extract: bool


class PaginatedMatrixWorkbenchCandidatesResponse(BaseModel):
    """Página de artículos que pueden revisarse o extraerse a texto completo."""

    items: List[MatrixWorkbenchCandidateRead]
    total: int
    skip: int
    limit: int
    returned: int
    has_next: bool
    has_previous: bool


class MatrixWorkbenchMetricsRead(BaseModel):
    """Indicadores agregados de disponibilidad, extracción y confirmación de texto completo."""

    total_candidates: int
    with_pdf: int
    without_pdf: int
    extracted_rows: int
    draft_rows: int
    confirmed_rows: int
    fulltext_included: int
    fulltext_excluded: int
    fulltext_pending: int


class ConfirmFulltextDecisionRequest(BaseModel):
    """Payload para la confirmación humana (Human-in-the-Loop) del cribado a texto completo."""

    record_id: uuid.UUID = Field(..., description="ID del artículo evaluado")
    final_status: ScreeningDecisionEnum = Field(..., example="INCLUDED", description="Decisión final: INCLUDED o EXCLUDED")
    decision_reason: Optional[str] = Field(default=None, description="Justificación o anotación del investigador")
