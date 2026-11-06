"""
Paquete de servicios de negocio para el módulo de Screening y PRISMA.
Contiene submódulos independientes para desduplicación, cribado por título, cribado por abstract y corrección manual.
"""
from app.api.services.screening.abstract_screening_service import (
    get_abstract_screening_records_paginated,
    get_abstract_screening_results,
    get_abstract_screening_metrics,
    run_abstract_screening_pipeline,
)
from app.api.services.screening.deduplication_service import (
    calculate_similarity,
    export_unique_records_excel,
    generate_article_id,
    get_or_create_screening_session,
    get_pending_duplicate_clusters,
    normalize_doi,
    normalize_title,
    resolve_duplicate_cluster,
    run_deduplication_pipeline,
)
from app.api.services.screening.override_service import (
    cancel_screening_process,
    override_screening_decision,
)
from app.api.services.screening.title_screening_service import (
    get_title_screening_records_paginated,
    get_title_screening_results,
    get_title_screening_metrics,
    run_title_screening_pipeline,
)

__all__ = [
    "normalize_doi",
    "normalize_title",
    "calculate_similarity",
    "get_or_create_screening_session",
    "run_deduplication_pipeline",
    "get_pending_duplicate_clusters",
    "resolve_duplicate_cluster",
    "generate_article_id",
    "export_unique_records_excel",
    "run_title_screening_pipeline",
    "get_title_screening_results",
    "get_title_screening_metrics",
    "get_title_screening_records_paginated",
    "run_abstract_screening_pipeline",
    "get_abstract_screening_results",
    "get_abstract_screening_metrics",
    "get_abstract_screening_records_paginated",
    "override_screening_decision",
    "cancel_screening_process",
]
