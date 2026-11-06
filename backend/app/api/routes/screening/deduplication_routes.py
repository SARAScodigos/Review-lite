"""
Controlador HTTP específico para la Desduplicación por Clusters y Human-in-the-Loop (Hito 1).
Maneja el disparo asíncrono en Celery, consulta de clusters dudosos, resolución humana y exportación Excel.
"""
from io import BytesIO
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app.api.schemas.extracted_record_schema import AsyncExtractionResponse
from app.api.schemas.screening.deduplication_schema import (
    DeduplicationSummaryResponse,
    DuplicateClusterRead,
    PaginatedUniqueRecordsResponse,
    ResolveClusterRequest,
    StartDeduplicationRequest,
)
from app.api.schemas.screening.session_schema import ScreeningSessionRead
from app.api.services.screening.deduplication_service import (
    export_unique_records_excel,
    get_deduplication_summary,
    get_or_create_screening_session,
    get_pending_duplicate_clusters,
    get_unique_records_paginated,
    resolve_duplicate_cluster,
)
from app.db.session import get_session
from app.workers.tasks import run_deduplication_task

router = APIRouter()


@router.post("/deduplicate", response_model=AsyncExtractionResponse)
def start_deduplication_endpoint(
    project_id: uuid.UUID,
    payload: StartDeduplicationRequest = StartDeduplicationRequest(),
    db: Session = Depends(get_session),
):
    """
    Inicia la tarea asíncrona en Celery para la detección y agrupamiento de duplicados por clusters.
    """
    session_obj = get_or_create_screening_session(db, project_id)

    if session_obj.total_initial_records == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pueden detectar duplicados porque no hay registros extraídos en el proyecto.",
        )

    task = run_deduplication_task.delay(str(project_id), payload.force_rerun)

    return AsyncExtractionResponse(
        task_id=task.id,
        project_id=project_id,
        status="QUEUED",
        message="Proceso de desduplicación por clusters encolado exitosamente en Celery.",
    )


@router.get("/duplicates/summary", response_model=DeduplicationSummaryResponse)
def get_deduplication_summary_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna los conteos actuales de desduplicación del proyecto, incluyendo
    totales globales y desglose por fuente bibliográfica importada.
    """
    return get_deduplication_summary(db, project_id)


@router.get("/duplicates/pending", response_model=List[DuplicateClusterRead])
def get_pending_duplicate_clusters_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna la lista de clusters de duplicados que se encuentran en estado 'PENDING_HUMAN_REVIEW'
    para que el usuario en la UI elija el Registro Maestro de cada grupo.
    """
    return get_pending_duplicate_clusters(db, project_id)


@router.post("/duplicates/resolve-cluster", response_model=ScreeningSessionRead)
def resolve_duplicate_cluster_endpoint(
    project_id: uuid.UUID,
    payload: ResolveClusterRequest,
    db: Session = Depends(get_session),
):
    """
    Aplica la resolución dada por el usuario para un cluster de duplicados, seleccionando el Registro Maestro.
    """
    return resolve_duplicate_cluster(
        db=db,
        project_id=project_id,
        cluster_id=payload.cluster_id,
        selected_master_record_id=payload.selected_master_record_id,
        action=payload.action,
    )


@router.get("/duplicates/unique-records", response_model=PaginatedUniqueRecordsResponse)
def get_unique_records_endpoint(
    project_id: uuid.UUID,
    skip: int = Query(default=0, ge=0, description="Registros únicos a omitir"),
    limit: int = Query(default=100, ge=1, le=500, description="Límite por página"),
    db: Session = Depends(get_session),
):
    """
    Retorna los registros únicos actuales del proyecto con paginación y fuente bibliográfica.
    """
    return get_unique_records_paginated(
        db=db,
        project_id=project_id,
        skip=skip,
        limit=limit,
    )


@router.get("/export/unique-excel")
def export_unique_records_excel_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Exporta en formato Excel (.xlsx) los registros únicos del proyecto tras la desduplicación.
    Campos del reporte: id_article (5 letras título + 4 autor), título, autores, año, doi y journal.
    """
    excel_bytes, filename = export_unique_records_excel(db, project_id)
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"'
    }
    return StreamingResponse(
        BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
