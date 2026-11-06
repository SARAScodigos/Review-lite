"""
Esquemas Pydantic específicos para el Módulo de Desduplicación por Clusters (Hito 1).
Incluye DTOs para la presentación de clusters a la UI, resolución por el usuario y exportación.
"""
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class RecordSourceFileSchema(BaseModel):
    """Metadatos del archivo de origen de un registro extraído."""

    file_id: uuid.UUID
    file_name: str
    database_source: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DuplicateRecordDetail(BaseModel):
    """Detalle completo de un artículo que forma parte de un cluster de sospecha de duplicados."""

    record_id: uuid.UUID
    title: Optional[str] = None
    doi: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    source_title: Optional[str] = None
    abstract: Optional[str] = None
    has_abstract: bool
    source_file: RecordSourceFileSchema

    model_config = ConfigDict(from_attributes=True)


class DuplicateClusterRead(BaseModel):
    """Estructura de respuesta para presentar un cluster de duplicados en conflicto a la UI."""

    cluster_id: str
    similarity_score: float
    match_reason: str
    suggested_master_id: uuid.UUID
    records: List[DuplicateRecordDetail]


class DeduplicationSourceBreakdown(BaseModel):
    """Conteos de importación/desduplicación agrupados por fuente bibliográfica."""

    database_source: str
    total_records: int
    unique_records: int
    duplicate_records: int
    pending_review_records: int


class DeduplicationSummaryResponse(BaseModel):
    """Resumen agregado de desduplicación para un proyecto RSL."""

    project_id: uuid.UUID
    session_status: str
    total_records: int
    unique_records: int
    duplicate_records: int
    pending_review_records: int
    by_database_source: List[DeduplicationSourceBreakdown]


class UniqueRecordRead(BaseModel):
    """Registro único enriquecido con fuente bibliográfica para tabla paginada/exportación."""

    record_id: uuid.UUID
    file_id: uuid.UUID
    database_source: str
    id_article: str
    title: Optional[str] = None
    authors: Optional[str] = None
    publication_year: Optional[int] = None
    doi: Optional[str] = None
    source_title: Optional[str] = None
    abstract: Optional[str] = None


class PaginatedUniqueRecordsResponse(BaseModel):
    """Respuesta paginada para registros únicos tras desduplicación."""

    items: List[UniqueRecordRead]
    total: int
    skip: int
    limit: int
    returned: int
    has_next: bool
    has_previous: bool


class ResolveClusterRequest(BaseModel):
    """Payload para que el usuario resuelva un cluster de duplicados seleccionando el Registro Maestro."""

    cluster_id: str = Field(..., description="ID del cluster a resolver")
    selected_master_record_id: uuid.UUID = Field(
        ...,
        description="ID del registro elegido por el usuario como artículo maestro ganador",
    )
    action: str = Field(
        default="CONFIRM_DUPLICATES",
        description="Acción: 'CONFIRM_DUPLICATES' para descartar el resto como duplicados, o 'MARK_ALL_AS_UNIQUE' si ninguno es duplicado",
    )


class StartDeduplicationRequest(BaseModel):
    """Payload para iniciar la desduplicación de un proyecto."""

    force_rerun: bool = Field(
        default=False,
        description="Si es True, reinicia las decisiones previas y vuelve a ejecutar la desduplicación",
    )
