"""
Controlador HTTP para la ejecución y consulta del Cribado por Título con IA (Fase 1 del Hito 2).
"""
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.schemas.extracted_record_schema import AsyncExtractionResponse
from app.api.schemas.screening.title_screening_schema import (
    PaginatedTitleScreeningRecordsResponse,
    StartTitleScreeningRequest,
    TitleScreeningItemRead,
    TitleScreeningMetricsRead,
)
from app.api.services.screening.deduplication_service import get_or_create_screening_session
from app.api.services.screening.title_screening_service import (
    get_title_screening_records_paginated,
    get_title_screening_results,
    get_title_screening_metrics,
    validate_title_screening_prerequisites,
)
from app.db.session import get_session
from app.workers.tasks import run_title_screening_task

router = APIRouter()


@router.post("/title/run", response_model=AsyncExtractionResponse)
def start_title_screening_endpoint(
    project_id: uuid.UUID,
    payload: StartTitleScreeningRequest = StartTitleScreeningRequest(),
    db: Session = Depends(get_session),
):
    """
    Inicia la tarea asíncrona en Celery para el cribado por título utilizando el proveedor y modelo de IA seleccionados.
    """
    session_obj = get_or_create_screening_session(db, project_id)
    validate_title_screening_prerequisites(db, session_obj)

    if session_obj.unique_records_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay registros únicos para evaluar por título.",
        )

    task = run_title_screening_task.delay(
        str(project_id),
        payload.provider,
        payload.model,
        payload.temperature,
        payload.re_run,
    )

    return AsyncExtractionResponse(
        task_id=task.id,
        project_id=project_id,
        status="QUEUED",
        message=f"Proceso de cribado por título encolado exitosamente en Celery con IA ({payload.provider} / {payload.model}).",
    )


@router.get("/title/results", response_model=List[TitleScreeningItemRead])
def get_title_screening_results_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """
    Retorna la lista de resultados del cribado por título con las justificaciones de la IA.
    """
    return get_title_screening_results(db, project_id)


@router.get("/title/metrics", response_model=TitleScreeningMetricsRead)
def get_title_screening_metrics_endpoint(
    project_id: uuid.UUID,
    db: Session = Depends(get_session),
):
    """Retorna los contadores de título para los indicadores del frontend."""
    return get_title_screening_metrics(db, project_id)


@router.get("/title/records", response_model=PaginatedTitleScreeningRecordsResponse)
def get_title_screening_records_endpoint(
    project_id: uuid.UUID,
    skip: int = Query(default=0, ge=0, description="Registros de cribado por título a omitir"),
    limit: int = Query(default=100, ge=1, le=500, description="Límite por página"),
    db: Session = Depends(get_session),
):
    """
    Retorna los registros únicos disponibles para cribado por título con paginación.
    Incluye metadatos sin abstract y el estado/decisión actual de título.
    """
    return get_title_screening_records_paginated(
        db=db,
        project_id=project_id,
        skip=skip,
        limit=limit,
    )
