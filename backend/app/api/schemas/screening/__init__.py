"""
Paquete de esquemas de respuesta y petición para el módulo de Screening y PRISMA.
"""
from app.api.schemas.screening.abstract_screening_schema import (
    AbstractAIScreeningOutput,
    AbstractScreeningItemRead,
    AbstractScreeningMetricsRead,
    AbstractScreeningRecordRead,
    AbstractScreeningSourceMetricsRead,
    PaginatedAbstractScreeningRecordsResponse,
    StartAbstractScreeningRequest,
)
from app.api.schemas.screening.deduplication_schema import (
    DuplicateClusterRead,
    DuplicateRecordDetail,
    RecordSourceFileSchema,
    ResolveClusterRequest,
    StartDeduplicationRequest,
)
from app.api.schemas.screening.override_schema import OverrideDecisionRequest
from app.api.schemas.screening.session_schema import ScreeningSessionRead
from app.api.schemas.screening.title_screening_schema import (
    PaginatedTitleScreeningRecordsResponse,
    StartTitleScreeningRequest,
    TitleAIScreeningOutput,
    TitleScreeningItemRead,
    TitleScreeningMetricsRead,
    TitleScreeningRecordRead,
    TitleScreeningSourceMetricsRead,
)

__all__ = [
    "ScreeningSessionRead",
    "RecordSourceFileSchema",
    "DuplicateRecordDetail",
    "DuplicateClusterRead",
    "ResolveClusterRequest",
    "StartDeduplicationRequest",
    "StartTitleScreeningRequest",
    "TitleAIScreeningOutput",
    "TitleScreeningItemRead",
    "TitleScreeningMetricsRead",
    "TitleScreeningSourceMetricsRead",
    "TitleScreeningRecordRead",
    "PaginatedTitleScreeningRecordsResponse",
    "StartAbstractScreeningRequest",
    "AbstractAIScreeningOutput",
    "AbstractScreeningItemRead",
    "AbstractScreeningMetricsRead",
    "AbstractScreeningSourceMetricsRead",
    "AbstractScreeningRecordRead",
    "PaginatedAbstractScreeningRecordsResponse",
    "OverrideDecisionRequest",
]
