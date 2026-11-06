"""
Módulo alias para mantener compatibilidad hacia atrás.
Redirige al nuevo paquete modular app.api.schemas.screening.
"""
from app.api.schemas.screening import (
    AbstractAIScreeningOutput,
    AbstractScreeningItemRead,
    DuplicateClusterRead,
    DuplicateRecordDetail,
    OverrideDecisionRequest,
    RecordSourceFileSchema,
    ResolveClusterRequest,
    ScreeningSessionRead,
    StartAbstractScreeningRequest,
    StartDeduplicationRequest,
    StartTitleScreeningRequest,
    TitleAIScreeningOutput,
    TitleScreeningItemRead,
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
    "StartAbstractScreeningRequest",
    "AbstractAIScreeningOutput",
    "AbstractScreeningItemRead",
    "OverrideDecisionRequest",
]
