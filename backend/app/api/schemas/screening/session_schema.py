"""
Esquema Pydantic para el Tablero Global de Sesión de Screening y Diagrama PRISMA 2020.
Administra el estado general del proceso (IDLE, PROCESSING, AWAITING_REVIEW) y los contadores acumulados.
"""
from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict

from app.api.models.screening_model import ProcessStatus


class ScreeningSessionRead(BaseModel):
    """Esquema de respuesta para la sesión global de cribado y métricas PRISMA 2020."""

    id: uuid.UUID
    project_id: uuid.UUID
    status: ProcessStatus
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None
    total_initial_records: int
    duplicate_records_count: int
    unique_records_count: int
    title_included_count: int
    title_excluded_count: int
    abstract_included_count: int
    abstract_excluded_count: int
    fulltext_included_count: int
    fulltext_excluded_count: int
    fulltext_not_retrieved_count: int = 0
    fulltext_retrieved_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
