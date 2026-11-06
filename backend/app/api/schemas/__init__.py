from app.api.schemas.author_schema import (
    AuthorCreate,
    AuthorRead,
    AuthorReadWithProjects,
    AuthorUpdate,
)
from app.api.schemas.extracted_record_schema import (
    AsyncExtractionResponse,
    ExtractedRecordRead,
    ExtractionSummaryResponse,
    TaskStatusResponse,
)
from app.api.schemas.rsl_project_schema import (
    RSLProjectCreate,
    RSLProjectRead,
    RSLProjectReadWithAuthors,
    RSLProjectUpdate,
)
from app.api.schemas.search_result_file_schema import (
    SearchResultFileBase,
    SearchResultFileRead,
    SearchResultFileUpdate,
)
from app.api.schemas import screening, screening_schema
from app.api.schemas.screening_schema import (
    DuplicateClusterRead,
    DuplicateRecordDetail,
    RecordSourceFileSchema,
    ResolveClusterRequest,
    ScreeningSessionRead,
    StartDeduplicationRequest,
)

# Resolver referencias circulares entre esquemas de respuesta Pydantic v2
AuthorReadWithProjects.model_rebuild()
RSLProjectReadWithAuthors.model_rebuild()

__all__ = [
    "AuthorCreate",
    "AuthorUpdate",
    "AuthorRead",
    "AuthorReadWithProjects",
    "RSLProjectCreate",
    "RSLProjectUpdate",
    "RSLProjectRead",
    "RSLProjectReadWithAuthors",
    "SearchResultFileBase",
    "SearchResultFileRead",
    "SearchResultFileUpdate",
    "ExtractedRecordRead",
    "ExtractionSummaryResponse",
    "AsyncExtractionResponse",
    "TaskStatusResponse",
    "ScreeningSessionRead",
    "RecordSourceFileSchema",
    "DuplicateRecordDetail",
    "DuplicateClusterRead",
    "ResolveClusterRequest",
    "StartDeduplicationRequest",
]
