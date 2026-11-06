"""
Esquemas Pydantic para los controladores HTTP del Módulo de Síntesis y Redacción Científica (Hito 5).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.api.models.synthesis_model import StatusWriting, SynthesisSectionType


class CreateSynthesisSectionRequest(BaseModel):
    """Payload para crear una nueva sección o capítulo de síntesis en el proyecto."""

    section_type: SynthesisSectionType = Field(..., example="RESULTS_OBJECTIVE", description="Tipo de sección RSL")
    objective_title: Optional[str] = Field(default=None, example="OB1", description="Código o título del objetivo (ej. OB1, OB2)")
    objective_description: Optional[str] = Field(default=None, example="Analizar distribución por país", description="Descripción del objetivo")
    order_index: int = Field(default=1, ge=1, description="Orden numérico del capítulo en el documento final")


class SynthesisCandidateArticleRead(BaseModel):
    article_id: str
    title: Optional[str] = None


class RSLSynthesisSectionRead(BaseModel):
    """DTO de lectura completo para responder una sección de síntesis."""

    id: uuid.UUID
    project_id: uuid.UUID
    section_type: SynthesisSectionType
    status_writing: StatusWriting
    objective_title: Optional[str] = None
    objective_description: Optional[str] = None
    order_index: int
    candidate_article_ids: List[str] = []
    candidate_articles: List[SynthesisCandidateArticleRead] = []
    selection_justifications: Dict[str, str] = {}
    trimmed_columns_used: List[str] = []
    generated_table: Dict[str, Any] = {}
    generated_draft: Optional[str] = None
    custom_prompt_instructions: Optional[str] = None
    is_confirmed: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvaluateEligibilityRequest(BaseModel):
    """Payload para ejecutar la evaluación de elegibilidad de candidatos e identificación de columnas por objetivo."""

    objective_code: Optional[str] = Field(default=None, example="OB1", description="Código del objetivo registrado en extra_metadata (OB1, OB2...)")
    selected_custom_columns: Optional[List[str]] = Field(default=None, description="Lista opcional de columnas personalizadas elegidas manualmente por el usuario")
    provider: str = Field(default="deepseek", example="deepseek")
    model: str = Field(default="deepseek-v4-pro", example="deepseek-v4-pro")
    temperature: float = Field(default=0.2, ge=0.0, le=1.0)
    custom_prompt: Optional[str] = Field(default=None, description="Instrucción temporal enviada solo a esta tarea de IA")


class GenerateSectionDraftRequest(BaseModel):
    """Payload para solicitar la redacción/generación unificada por IA de una sección."""

    selected_custom_columns: Optional[List[str]] = Field(default=None, description="Columnas personalizadas seleccionadas por el usuario")
    provider: str = Field(default="deepseek", example="deepseek")
    model: str = Field(default="deepseek-v4-pro", example="deepseek-v4-pro")
    temperature: float = Field(default=0.3, ge=0.0, le=1.0)
    custom_prompt: Optional[str] = Field(default=None, description="Instrucción temporal enviada solo a esta tarea de IA")
    force: bool = Field(default=False, description="Permite regenerar una tabla de objetivo ya existente")


class UpdateSynthesisSectionRequest(BaseModel):
    """Payload para permitir la actualización directa de campos por el investigador."""

    candidate_article_ids: Optional[List[str]] = None
    selection_justifications: Optional[Dict[str, str]] = None
    trimmed_columns_used: Optional[List[str]] = None
    generated_table: Optional[Dict[str, Any]] = None
    generated_draft: Optional[str] = None
    is_confirmed: Optional[bool] = None
