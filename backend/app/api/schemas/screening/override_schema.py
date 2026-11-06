"""
Esquemas Pydantic para permitir la anulación/corrección manual de decisiones de la IA por el investigador.
"""
from typing import Optional
import uuid
from pydantic import BaseModel, Field

from app.api.models.screening_model import ScreeningDecisionEnum


class OverrideDecisionRequest(BaseModel):
    """Payload para que el usuario sobrescriba manualmente la decisión tomada por la IA."""

    record_id: uuid.UUID = Field(..., description="ID del registro/artículo a modificar")
    stage: str = Field(
        ...,
        example="title",
        description="Fase de cribado a modificar: 'title' o 'abstract'",
    )
    new_status: ScreeningDecisionEnum = Field(
        ...,
        example="INCLUDED",
        description="Nuevo estado asignado manualmente por el usuario: INCLUDED o EXCLUDED",
    )
    override_reason: Optional[str] = Field(
        default=None,
        description="Anotación opcional del investigador justificando el cambio manual",
    )
