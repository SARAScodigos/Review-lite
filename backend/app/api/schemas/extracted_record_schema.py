from datetime import datetime
from typing import Any, Dict, Optional
import uuid
from pydantic import BaseModel


class ExtractedRecordRead(BaseModel):
    """Esquema DTO de lectura para un registro/artículo extraído de un archivo de búsqueda."""

    id: uuid.UUID
    file_id: uuid.UUID
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    source_title: Optional[str] = None
    abstract: Optional[str] = None
    raw_data: Dict[str, Any] = {}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaginatedExtractedRecordsResponse(BaseModel):
    """Respuesta paginada para registros extraídos de un archivo de búsqueda."""

    items: list[ExtractedRecordRead]
    total: int
    skip: int
    limit: int
    returned: int
    has_next: bool
    has_previous: bool


class ExtractionSummaryResponse(BaseModel):
    """Esquema de respuesta para el reporte del proceso de extracción síncrono."""

    file_id: uuid.UUID
    extracted_records_count: int
    message: str


class AsyncExtractionResponse(BaseModel):
    """Esquema de respuesta al encolar una tarea asíncrona en Celery/Redis."""

    task_id: str
    file_id: Optional[uuid.UUID] = None
    project_id: Optional[uuid.UUID] = None
    version_id: Optional[uuid.UUID] = None
    status: str
    message: str


class TaskStatusResponse(BaseModel):
    """Esquema para consultar el estado de una tarea asíncrona en Celery."""

    task_id: str
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None

