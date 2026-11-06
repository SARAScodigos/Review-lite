"""
Módulo alias para mantener compatibilidad hacia atrás.
Redirige al nuevo paquete modular app.api.services.screening.
"""
from app.api.services.screening import (
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
]
